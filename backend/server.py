"""AI Attendance System backend.

FastAPI + MongoDB + InsightFace (ArcFace 512-d).
JWT Bearer auth (mobile-friendly). Endpoints under /api.

Roles: student, teacher, admin (admin is hardcoded).
Teachers need admin approval before their account is activated.
Real-time notifications via WebSocket.
CSV export for attendance.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import csv
import json
import logging
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict, Set

import bcrypt
import jwt
from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect,
    Query,
)
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

import face_service

# --- DB ---
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# --- App ---
app = FastAPI(title="AI Attendance System")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

JWT_ALGO = "HS256"
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-please-32-chars-minimum-xxx")

ADMIN_ID = "adminpannel"
ADMIN_PASSWORD = "abcd1234"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("attendance")


# --- Helpers ---
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


async def get_current(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    role = payload["role"]
    if role == "admin":
        return {"id": ADMIN_ID, "name": "Admin", "role": "admin"}

    user_id = payload["sub"]
    coll = db.teachers if role == "teacher" else db.students
    user = await coll.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "id_photo_base64": 0})
    if not user:
        raise HTTPException(401, "User not found")
    user["role"] = role
    return user


async def require_teacher(user: dict = Depends(get_current)) -> dict:
    if user.get("role") != "teacher":
        raise HTTPException(403, "Teacher access required")
    return user


async def require_student(user: dict = Depends(get_current)) -> dict:
    if user.get("role") != "student":
        raise HTTPException(403, "Student access required")
    return user


async def require_admin(user: dict = Depends(get_current)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return user


# --- Pydantic models ---
class UnifiedLogin(BaseModel):
    identifier: str
    password: str


class StudentRegister(BaseModel):
    name: str
    usn: str
    branch: str
    roll_number: str
    semester: str
    division: str
    password: str


class TeacherRegisterRequest(BaseModel):
    employee_id: str
    name: str
    id_photo_base64: str


class FaceUpload(BaseModel):
    image_base64: str


class SessionCreate(BaseModel):
    semester: str
    division: str
    lecture: str
    time_from: str
    time_to: str
    branch: Optional[str] = ""


class RecognizeRequest(BaseModel):
    images_base64: List[str]
    threshold: float = 0.40


class AttendanceEntry(BaseModel):
    student_id: str
    status: Literal["present", "absent"]


class SaveAttendance(BaseModel):
    entries: List[AttendanceEntry]


class ApproveTeacher(BaseModel):
    password: str


class EditStudent(BaseModel):
    name: Optional[str] = None
    branch: Optional[str] = None
    semester: Optional[str] = None
    division: Optional[str] = None
    roll_number: Optional[str] = None


# --- WebSocket manager (for real-time notifications) ---
class ConnectionManager:
    def __init__(self):
        # student_id -> set of websocket connections
        self.active: Dict[str, Set[WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, student_id: str, ws: WebSocket):
        await ws.accept()
        async with self.lock:
            self.active.setdefault(student_id, set()).add(ws)

    async def disconnect(self, student_id: str, ws: WebSocket):
        async with self.lock:
            if student_id in self.active:
                self.active[student_id].discard(ws)
                if not self.active[student_id]:
                    self.active.pop(student_id, None)

    async def send_to_student(self, student_id: str, message: dict):
        async with self.lock:
            conns = list(self.active.get(student_id, set()))
        for ws in conns:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                pass  # client will reconnect


ws_manager = ConnectionManager()


# ======================================================================
# AUTH
# ======================================================================
@api.post("/auth/login")
async def unified_login(payload: UnifiedLogin):
    ident = payload.identifier.strip()

    # Admin (hardcoded)
    if ident == ADMIN_ID and payload.password == ADMIN_PASSWORD:
        token = make_token(ADMIN_ID, "admin")
        return {
            "token": token,
            "user": {"id": ADMIN_ID, "name": "Admin", "role": "admin"},
        }

    ident_upper = ident.upper()

    # Teacher (by employee_id, must be approved)
    t = await db.teachers.find_one({"employee_id": ident_upper})
    if t:
        if t.get("status") != "approved":
            raise HTTPException(403, f"Account {t.get('status', 'pending')} — contact admin")
        if not t.get("password_hash") or not verify_pw(payload.password, t["password_hash"]):
            raise HTTPException(401, "Invalid credentials")
        token = make_token(t["id"], "teacher")
        return {
            "token": token,
            "user": {
                "id": t["id"], "name": t["name"], "employee_id": t["employee_id"],
                "role": "teacher",
            },
        }

    # Student (by USN)
    s = await db.students.find_one({"usn": ident_upper})
    if s and verify_pw(payload.password, s.get("password_hash", "")):
        token = make_token(s["id"], "student")
        return {
            "token": token,
            "user": {
                "id": s["id"], "name": s["name"], "usn": s["usn"],
                "roll_number": s["roll_number"], "semester": s["semester"],
                "division": s["division"], "branch": s.get("branch", ""),
                "face_registered": bool(s.get("face_registered")),
                "role": "student",
            },
        }

    raise HTTPException(401, "Invalid credentials")


@api.post("/auth/register-student")
async def register_student(payload: StudentRegister):
    usn = payload.usn.upper().strip()
    if await db.students.find_one({"usn": usn}):
        raise HTTPException(400, "USN already registered")
    sid = str(uuid.uuid4())
    await db.students.insert_one({
        "id": sid,
        "name": payload.name,
        "usn": usn,
        "branch": payload.branch,
        "roll_number": payload.roll_number,
        "semester": payload.semester,
        "division": payload.division,
        "password_hash": hash_pw(payload.password),
        "embeddings": [],
        "face_registered": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    token = make_token(sid, "student")
    return {
        "token": token,
        "user": {
            "id": sid, "name": payload.name, "usn": usn,
            "branch": payload.branch,
            "roll_number": payload.roll_number, "semester": payload.semester,
            "division": payload.division, "face_registered": False,
            "role": "student",
        },
    }


@api.post("/auth/register-teacher-request")
async def register_teacher_request(payload: TeacherRegisterRequest):
    """Teacher submits registration request with ID photo. Pending admin approval."""
    emp_id = payload.employee_id.upper().strip()
    if await db.teachers.find_one({"employee_id": emp_id}):
        raise HTTPException(400, "Employee ID already registered or pending")
    tid = str(uuid.uuid4())
    await db.teachers.insert_one({
        "id": tid,
        "employee_id": emp_id,
        "name": payload.name,
        "id_photo_base64": payload.id_photo_base64,
        "status": "pending",  # pending | approved | rejected
        "password_hash": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "message": "Registration submitted. Pending admin approval."}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current)):
    user.pop("embeddings", None)
    return user


# ======================================================================
# STUDENT
# ======================================================================
@api.post("/upload-face")
async def upload_face(payload: FaceUpload, user: dict = Depends(require_student)):
    try:
        emb = face_service.extract_single_embedding(payload.image_base64)
    except Exception as e:
        raise HTTPException(400, f"Invalid image: {e}")
    if emb is None:
        raise HTTPException(400, "No face detected. Please retake with good lighting.")
    await db.students.update_one(
        {"id": user["id"]},
        {"$push": {"embeddings": emb},
         "$set": {"face_registered": True,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    s = await db.students.find_one({"id": user["id"]}, {"_id": 0, "embeddings": 1})
    return {"ok": True, "embeddings_count": len(s.get("embeddings", []))}


@api.get("/students/me")
async def student_me(user: dict = Depends(require_student)):
    s = await db.students.find_one(
        {"id": user["id"]}, {"_id": 0, "password_hash": 0, "embeddings": 0}
    )
    if not s:
        raise HTTPException(404, "Not found")
    return s


@api.get("/attendance/student")
async def my_attendance(user: dict = Depends(require_student)):
    cur = db.attendance.find({"student_id": user["id"]}, {"_id": 0}).sort("date", -1)
    rows = await cur.to_list(1000)
    total = len(rows)
    present = sum(1 for r in rows if r["status"] == "present")
    pct = round((present / total) * 100, 1) if total else 0.0
    return {"total": total, "present": present, "absent": total - present,
            "percentage": pct, "records": rows}


@api.get("/notifications")
async def list_notifications(user: dict = Depends(require_student)):
    cur = db.notifications.find(
        {"student_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1)
    return await cur.to_list(500)


@api.put("/notifications/{note_id}/read")
async def mark_read(note_id: str, user: dict = Depends(require_student)):
    res = await db.notifications.update_one(
        {"id": note_id, "student_id": user["id"]}, {"$set": {"read": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}


# ======================================================================
# TEACHER - Sessions
# ======================================================================
@api.post("/sessions")
async def create_session(payload: SessionCreate, user: dict = Depends(require_teacher)):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "teacher_id": user["id"],
        "teacher_name": user["name"],
        "semester": payload.semester,
        "division": payload.division,
        "lecture": payload.lecture,
        "branch": payload.branch or "",
        "time_from": payload.time_from,
        "time_to": payload.time_to,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "status": "open",
        "attendance": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sessions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/sessions")
async def list_sessions(user: dict = Depends(require_teacher)):
    cur = db.sessions.find({"teacher_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.get("/sessions/{session_id}")
async def get_session(session_id: str, user: dict = Depends(require_teacher)):
    s = await db.sessions.find_one({"id": session_id, "teacher_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@api.get("/sessions/{session_id}/students")
async def session_students(session_id: str, user: dict = Depends(require_teacher)):
    """All students in this session's sem+div (for manual attendance add)."""
    s = await db.sessions.find_one({"id": session_id, "teacher_id": user["id"]})
    if not s:
        raise HTTPException(404, "Session not found")
    cur = db.students.find(
        {"semester": s["semester"], "division": s["division"]},
        {"_id": 0, "password_hash": 0, "embeddings": 0},
    ).sort("roll_number", 1)
    return await cur.to_list(5000)


@api.put("/sessions/{session_id}/reopen")
async def reopen_session(session_id: str, user: dict = Depends(require_teacher)):
    s = await db.sessions.find_one({"id": session_id, "teacher_id": user["id"]})
    if not s:
        raise HTTPException(404, "Session not found")
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "open"}, "$unset": {"completed_at": ""}},
    )
    return {"ok": True}


@api.post("/sessions/{session_id}/recognize")
async def recognize(
    session_id: str, payload: RecognizeRequest,
    user: dict = Depends(require_teacher),
):
    sess = await db.sessions.find_one({"id": session_id, "teacher_id": user["id"]})
    if not sess:
        raise HTTPException(404, "Session not found")

    cursor = db.students.find(
        {"semester": sess["semester"], "division": sess["division"],
         "face_registered": True},
        {"_id": 0, "password_hash": 0},
    )
    students = await cursor.to_list(5000)
    if not students:
        raise HTTPException(400, "No registered students with face data for this class.")

    matched_ids = set()
    match_details = {}
    total_detected = 0
    for b64 in payload.images_base64:
        try:
            faces = face_service.detect_and_embed(b64)
        except Exception:
            logger.exception("detect_and_embed failed")
            continue
        total_detected += len(faces)
        for face in faces:
            res = face_service.match_embedding(
                face["embedding"],
                [{"id": s["id"], "name": s["name"],
                  "embeddings": s.get("embeddings", [])} for s in students],
                threshold=payload.threshold,
            )
            if res:
                stud, sim = res
                sid_ = stud["id"]
                if sid_ not in match_details or sim > match_details[sid_]:
                    match_details[sid_] = sim
                matched_ids.add(sid_)

    result = []
    for s in students:
        is_present = s["id"] in matched_ids
        result.append({
            "student_id": s["id"],
            "name": s["name"],
            "usn": s["usn"],
            "roll_number": s["roll_number"],
            "status": "present" if is_present else "absent",
            "similarity": match_details.get(s["id"]),
        })
    result.sort(key=lambda r: r["roll_number"])
    return {
        "total_faces_detected": total_detected,
        "total_matched": len(matched_ids),
        "total_students": len(students),
        "attendance": result,
    }


@api.post("/sessions/{session_id}/save-attendance")
async def save_attendance(
    session_id: str, payload: SaveAttendance,
    user: dict = Depends(require_teacher),
):
    sess = await db.sessions.find_one({"id": session_id, "teacher_id": user["id"]})
    if not sess:
        raise HTTPException(404, "Session not found")

    entries = []
    for e in payload.entries:
        if hasattr(e, "model_dump"):
            entries.append(e.model_dump())
        elif isinstance(e, dict):
            entries.append({"student_id": e.get("student_id"), "status": e.get("status")})
        else:
            entries.append({"student_id": getattr(e, "student_id", None),
                            "status": getattr(e, "status", None)})

    now = datetime.now(timezone.utc).isoformat()
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"attendance": entries, "status": "completed", "completed_at": now}},
    )

    await db.attendance.delete_many({"session_id": session_id})
    await db.notifications.delete_many({"session_id": session_id})

    rows = []
    notes = []
    for e in entries:
        rows.append({
            "id": str(uuid.uuid4()), "session_id": session_id,
            "student_id": e["student_id"], "status": e["status"],
            "lecture": sess["lecture"], "semester": sess["semester"],
            "division": sess["division"], "date": sess["date"],
            "time_from": sess["time_from"], "time_to": sess["time_to"],
            "created_at": now,
        })
        note = {
            "id": str(uuid.uuid4()),
            "student_id": e["student_id"], "session_id": session_id,
            "title": f"Attendance: {sess['lecture']}",
            "message": (
                f"You were marked {e['status'].upper()} for {sess['lecture']} "
                f"on {sess['date']} ({sess['time_from']}–{sess['time_to']})"
            ),
            "status": e["status"], "read": False, "created_at": now,
        }
        notes.append(note)

    if rows:
        await db.attendance.insert_many(rows)
    if notes:
        await db.notifications.insert_many(notes)

    # Push real-time via WebSocket
    for n in notes:
        await ws_manager.send_to_student(n["student_id"], {
            "type": "notification",
            "data": {k: v for k, v in n.items() if k != "_id"},
        })

    return {"ok": True, "saved": len(rows)}


@api.get("/sessions/{session_id}/export")
async def export_csv(session_id: str, user: dict = Depends(require_teacher)):
    sess = await db.sessions.find_one({"id": session_id, "teacher_id": user["id"]})
    if not sess:
        raise HTTPException(404, "Session not found")
    rows = await db.attendance.find({"session_id": session_id}, {"_id": 0}).to_list(5000)
    # Enrich with student name + usn
    ids = [r["student_id"] for r in rows]
    students = await db.students.find(
        {"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "usn": 1}
    ).to_list(5000)
    smap = {s["id"]: s for s in students}

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Student Name", "USN", "Date", "Session", "Status"])
    session_label = f"{sess['lecture']} ({sess['time_from']}-{sess['time_to']})"
    for r in rows:
        s = smap.get(r["student_id"], {})
        w.writerow([
            s.get("name", ""), s.get("usn", ""),
            r["date"], session_label, r["status"].upper(),
        ])

    filename = f"attendance_{sess['lecture'].replace(' ', '_')}_{sess['date']}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ======================================================================
# ADMIN
# ======================================================================
@api.get("/admin/teachers")
async def admin_list_teachers(
    status: Optional[str] = Query(None),
    user: dict = Depends(require_admin),
):
    q = {} if not status else {"status": status}
    cur = db.teachers.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", -1)
    return await cur.to_list(500)


@api.get("/admin/teachers/{teacher_id}")
async def admin_get_teacher(teacher_id: str, user: dict = Depends(require_admin)):
    t = await db.teachers.find_one({"id": teacher_id}, {"_id": 0, "password_hash": 0})
    if not t:
        raise HTTPException(404, "Teacher not found")
    return t


@api.post("/admin/teachers/{teacher_id}/approve")
async def admin_approve(
    teacher_id: str, payload: ApproveTeacher,
    user: dict = Depends(require_admin),
):
    t = await db.teachers.find_one({"id": teacher_id})
    if not t:
        raise HTTPException(404, "Teacher not found")
    await db.teachers.update_one(
        {"id": teacher_id},
        {"$set": {
            "status": "approved",
            "password_hash": hash_pw(payload.password),
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "employee_id": t["employee_id"]}


@api.post("/admin/teachers/{teacher_id}/reject")
async def admin_reject(teacher_id: str, user: dict = Depends(require_admin)):
    res = await db.teachers.update_one(
        {"id": teacher_id},
        {"$set": {"status": "rejected",
                  "rejected_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Teacher not found")
    return {"ok": True}


@api.get("/admin/students")
async def admin_list_students(user: dict = Depends(require_admin)):
    cur = db.students.find({}, {"_id": 0, "password_hash": 0, "embeddings": 0}).sort("usn", 1)
    return await cur.to_list(5000)


@api.put("/admin/students/{student_id}")
async def admin_edit_student(
    student_id: str, payload: EditStudent,
    user: dict = Depends(require_admin),
):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    res = await db.students.update_one({"id": student_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Student not found")
    return {"ok": True, "updated": list(updates.keys())}


# ======================================================================
# WEBSOCKET - real-time notifications for students
# ======================================================================
@app.websocket("/api/ws/notifications")
async def ws_notifications(ws: WebSocket, token: str = Query(...)):
    try:
        payload = decode_token(token)
    except Exception:
        await ws.close(code=4401)
        return
    if payload.get("role") != "student":
        await ws.close(code=4403)
        return
    sid = payload["sub"]
    await ws_manager.connect(sid, ws)
    try:
        while True:
            # keep-alive; ignore incoming messages
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await ws_manager.disconnect(sid, ws)


# --- Health ---
@api.get("/")
async def root():
    return {"message": "AI Attendance System API", "status": "ok"}


@app.on_event("startup")
async def startup():
    await db.teachers.create_index("employee_id", unique=True)
    await db.students.create_index("usn", unique=True)
    await db.sessions.create_index([("teacher_id", 1), ("created_at", -1)])
    await db.attendance.create_index([("student_id", 1), ("date", -1)])
    await db.notifications.create_index([("student_id", 1), ("created_at", -1)])
    try:
        face_service.get_face_app()
        logger.info("InsightFace model loaded")
    except Exception as e:
        logger.exception("Face model load failed: %s", e)


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
