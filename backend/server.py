"""AI Attendance System backend.

FastAPI + MongoDB + InsightFace + SendGrid emails.
Roles: student, teacher, admin. Teachers need admin approval.
Forgot-password via 6-digit OTP (15-min validity).
Real-time notifications via WebSocket.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import csv
import json
import random
import logging
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict, Set

import bcrypt
import jwt
from fastapi import (
    FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query,
)
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr

import face_service
import email_service

# --- DB ---
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="AI Attendance System")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

JWT_ALGO = "HS256"
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-please-32-chars-minimum-xxx")

ADMIN_ID = "adminpannel"
ADMIN_PASSWORD = "abcd1234"
DEFAULT_TEACHER_PASSWORD = "Teacher@123"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("attendance")


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id, "role": role,
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


# --- Models ---
class UnifiedLogin(BaseModel):
    identifier: str
    password: str


class StudentRegister(BaseModel):
    name: str
    usn: str
    email: EmailStr
    branch: str
    roll_number: str
    semester: str
    division: str
    password: str


class TeacherRegisterRequest(BaseModel):
    employee_id: str
    name: str
    email: EmailStr
    courses: List[str]
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


class EditStudent(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    branch: Optional[str] = None
    semester: Optional[str] = None
    division: Optional[str] = None
    roll_number: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class ForgotRequest(BaseModel):
    email: EmailStr


class ResetConfirm(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


class UpdateCourses(BaseModel):
    courses: List[str]


# --- WebSocket manager ---
class ConnectionManager:
    def __init__(self):
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
                pass


ws_manager = ConnectionManager()


# ======================================================================
# AUTH
# ======================================================================
@api.post("/auth/login")
async def unified_login(payload: UnifiedLogin):
    ident = payload.identifier.strip()

    if ident == ADMIN_ID and payload.password == ADMIN_PASSWORD:
        return {
            "token": make_token(ADMIN_ID, "admin"),
            "user": {"id": ADMIN_ID, "name": "Admin", "role": "admin"},
        }

    ident_upper = ident.upper()

    t = await db.teachers.find_one({"employee_id": ident_upper})
    if t:
        if t.get("status") != "approved":
            raise HTTPException(403, f"Account {t.get('status', 'pending')} — contact admin")
        if not t.get("password_hash") or not verify_pw(payload.password, t["password_hash"]):
            raise HTTPException(401, "Invalid credentials")
        return {
            "token": make_token(t["id"], "teacher"),
            "user": {
                "id": t["id"], "name": t["name"], "employee_id": t["employee_id"],
                "email": t.get("email", ""),
                "courses": t.get("courses", []),
                "must_change_password": bool(t.get("must_change_password", False)),
                "role": "teacher",
            },
        }

    s = await db.students.find_one({"usn": ident_upper})
    if s and verify_pw(payload.password, s.get("password_hash", "")):
        return {
            "token": make_token(s["id"], "student"),
            "user": {
                "id": s["id"], "name": s["name"], "usn": s["usn"],
                "email": s.get("email", ""),
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
        "id": sid, "name": payload.name, "usn": usn,
        "email": payload.email.lower(),
        "branch": payload.branch, "roll_number": payload.roll_number,
        "semester": payload.semester, "division": payload.division,
        "password_hash": hash_pw(payload.password),
        "embeddings": [], "face_registered": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "token": make_token(sid, "student"),
        "user": {
            "id": sid, "name": payload.name, "usn": usn,
            "email": payload.email, "branch": payload.branch,
            "roll_number": payload.roll_number, "semester": payload.semester,
            "division": payload.division, "face_registered": False,
            "role": "student",
        },
    }


@api.post("/auth/register-teacher-request")
async def register_teacher_request(payload: TeacherRegisterRequest):
    emp_id = payload.employee_id.upper().strip()
    if await db.teachers.find_one({"employee_id": emp_id}):
        raise HTTPException(400, "Employee ID already registered or pending")
    tid = str(uuid.uuid4())
    courses = [c.strip() for c in payload.courses if c.strip()]
    await db.teachers.insert_one({
        "id": tid, "employee_id": emp_id,
        "name": payload.name, "email": payload.email.lower(),
        "courses": courses,
        "id_photo_base64": payload.id_photo_base64,
        "status": "pending", "password_hash": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "message": "Registration submitted. Pending admin approval."}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current)):
    user.pop("embeddings", None)
    return user


@api.post("/auth/change-password")
async def change_password(payload: PasswordChange, user: dict = Depends(get_current)):
    role = user.get("role")
    if role == "admin":
        raise HTTPException(403, "Admin password is fixed")
    coll = db.teachers if role == "teacher" else db.students
    rec = await coll.find_one({"id": user["id"]})
    if not rec or not verify_pw(payload.current_password, rec.get("password_hash", "")):
        raise HTTPException(401, "Current password is incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(400, "New password must be 6+ characters")
    await coll.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_pw(payload.new_password),
                  "must_change_password": False,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if rec.get("email"):
        email_service.send_email(
            rec["email"], "Password changed",
            email_service.password_changed(rec.get("name", "there")),
        )
    return {"ok": True}


# --- Forgot password ---
@api.post("/auth/forgot-password")
async def forgot_password(payload: ForgotRequest):
    email = payload.email.lower()
    teacher = await db.teachers.find_one({"email": email})
    student = None if teacher else await db.students.find_one({"email": email})
    target = teacher or student
    # Always respond 200 (don't leak which emails exist)
    if target:
        role = "teacher" if teacher else "student"
        otp = f"{random.randint(0, 999999):06d}"
        await db.password_resets.insert_one({
            "email": email, "role": role, "user_id": target["id"], "otp": otp,
            "used": False,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        email_service.send_email(
            email, "Your password reset code",
            email_service.otp_email(target.get("name", "there"), otp),
        )
    return {"ok": True, "message": "If the email exists, a code has been sent."}


@api.post("/auth/reset-password")
async def reset_password(payload: ResetConfirm):
    email = payload.email.lower()
    if len(payload.new_password) < 6:
        raise HTTPException(400, "Password must be 6+ characters")
    entry = await db.password_resets.find_one(
        {"email": email, "otp": payload.otp, "used": False},
        sort=[("created_at", -1)],
    )
    if not entry:
        raise HTTPException(400, "Invalid or expired code")
    if datetime.fromisoformat(entry["expires_at"]) < datetime.now(timezone.utc):
        raise HTTPException(400, "Code expired")
    coll = db.teachers if entry["role"] == "teacher" else db.students
    await coll.update_one(
        {"id": entry["user_id"]},
        {"$set": {
            "password_hash": hash_pw(payload.new_password),
            "must_change_password": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await db.password_resets.update_one({"_id": entry["_id"]}, {"$set": {"used": True}})
    rec = await coll.find_one({"id": entry["user_id"]}, {"name": 1})
    if rec and rec.get("name"):
        email_service.send_email(
            email, "Password reset successfully",
            email_service.password_changed(rec["name"]),
        )
    return {"ok": True}


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
    return user


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
    cur = db.notifications.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
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
# TEACHER - Courses + Sessions
# ======================================================================
@api.get("/teachers/me")
async def teachers_me(user: dict = Depends(require_teacher)):
    return user


@api.put("/teachers/me/courses")
async def update_my_courses(payload: UpdateCourses, user: dict = Depends(require_teacher)):
    courses = [c.strip() for c in payload.courses if c.strip()]
    await db.teachers.update_one(
        {"id": user["id"]},
        {"$set": {"courses": courses,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "courses": courses}


@api.post("/sessions")
async def create_session(payload: SessionCreate, user: dict = Depends(require_teacher)):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid,
        "teacher_id": user["id"], "teacher_name": user["name"],
        "semester": payload.semester, "division": payload.division,
        "lecture": payload.lecture, "branch": payload.branch or "",
        "time_from": payload.time_from, "time_to": payload.time_to,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "status": "open", "attendance": [],
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
                if stud["id"] not in match_details or sim > match_details[stud["id"]]:
                    match_details[stud["id"]] = sim
                matched_ids.add(stud["id"])

    result = []
    for s in students:
        result.append({
            "student_id": s["id"], "name": s["name"], "usn": s["usn"],
            "roll_number": s["roll_number"],
            "status": "present" if s["id"] in matched_ids else "absent",
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
        else:
            entries.append({"student_id": e.get("student_id"), "status": e.get("status")})

    now = datetime.now(timezone.utc).isoformat()
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"attendance": entries, "status": "completed", "completed_at": now}},
    )

    await db.attendance.delete_many({"session_id": session_id})
    await db.notifications.delete_many({"session_id": session_id})

    rows, notes = [], []
    for e in entries:
        rows.append({
            "id": str(uuid.uuid4()), "session_id": session_id,
            "student_id": e["student_id"], "status": e["status"],
            "lecture": sess["lecture"], "semester": sess["semester"],
            "division": sess["division"], "date": sess["date"],
            "time_from": sess["time_from"], "time_to": sess["time_to"],
            "created_at": now,
        })
        notes.append({
            "id": str(uuid.uuid4()),
            "student_id": e["student_id"], "session_id": session_id,
            "title": f"Attendance: {sess['lecture']}",
            "message": (
                f"You were marked {e['status'].upper()} for {sess['lecture']} "
                f"on {sess['date']} ({sess['time_from']}–{sess['time_to']})"
            ),
            "status": e["status"], "read": False, "created_at": now,
        })

    if rows:
        await db.attendance.insert_many(rows)
    if notes:
        await db.notifications.insert_many(notes)
    for n in notes:
        await ws_manager.send_to_student(n["student_id"], {
            "type": "notification", "data": {k: v for k, v in n.items() if k != "_id"},
        })

    return {"ok": True, "saved": len(rows)}


@api.get("/sessions/{session_id}/export")
async def export_csv(session_id: str, user: dict = Depends(require_teacher)):
    sess = await db.sessions.find_one({"id": session_id, "teacher_id": user["id"]})
    if not sess:
        raise HTTPException(404, "Session not found")
    rows = await db.attendance.find({"session_id": session_id}, {"_id": 0}).to_list(5000)
    ids = [r["student_id"] for r in rows]
    students = await db.students.find(
        {"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "usn": 1}
    ).to_list(5000)
    smap = {s["id"]: s for s in students}

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Student Name", "USN", "Date", "Session", "Status"])
    label = f"{sess['lecture']} ({sess['time_from']}-{sess['time_to']})"
    for r in rows:
        s = smap.get(r["student_id"], {})
        w.writerow([s.get("name", ""), s.get("usn", ""), r["date"], label, r["status"].upper()])

    filename = f"attendance_{sess['lecture'].replace(' ', '_')}_{sess['date']}.csv"
    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ======================================================================
# ADMIN
# ======================================================================
@api.get("/admin/teachers")
async def admin_list_teachers(
    status: Optional[str] = Query(None), user: dict = Depends(require_admin),
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
async def admin_approve(teacher_id: str, user: dict = Depends(require_admin)):
    t = await db.teachers.find_one({"id": teacher_id})
    if not t:
        raise HTTPException(404, "Teacher not found")
    await db.teachers.update_one(
        {"id": teacher_id},
        {"$set": {
            "status": "approved",
            "password_hash": hash_pw(DEFAULT_TEACHER_PASSWORD),
            "must_change_password": True,
            "approved_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if t.get("email"):
        email_service.send_email(
            t["email"], "Your account has been approved",
            email_service.teacher_approved(t["name"], t["employee_id"], DEFAULT_TEACHER_PASSWORD),
        )
    return {"ok": True, "employee_id": t["employee_id"],
            "default_password": DEFAULT_TEACHER_PASSWORD}


@api.post("/admin/teachers/{teacher_id}/reject")
async def admin_reject(teacher_id: str, user: dict = Depends(require_admin)):
    t = await db.teachers.find_one({"id": teacher_id})
    if not t:
        raise HTTPException(404, "Teacher not found")
    await db.teachers.update_one(
        {"id": teacher_id},
        {"$set": {"status": "rejected",
                  "rejected_at": datetime.now(timezone.utc).isoformat()}},
    )
    if t.get("email"):
        email_service.send_email(
            t["email"], "Registration rejected",
            email_service.teacher_rejected(t["name"], t["employee_id"]),
        )
    return {"ok": True}


@api.delete("/admin/teachers/{teacher_id}")
async def admin_delete_teacher(teacher_id: str, user: dict = Depends(require_admin)):
    res = await db.teachers.delete_one({"id": teacher_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Teacher not found")
    return {"ok": True}


@api.get("/admin/students")
async def admin_list_students(
    semester: Optional[str] = Query(None),
    division: Optional[str] = Query(None),
    user: dict = Depends(require_admin),
):
    q: Dict = {}
    if semester: q["semester"] = semester
    if division: q["division"] = division
    cur = db.students.find(q, {"_id": 0, "password_hash": 0, "embeddings": 0}).sort("usn", 1)
    return await cur.to_list(5000)


@api.put("/admin/students/{student_id}")
async def admin_edit_student(
    student_id: str, payload: EditStudent, user: dict = Depends(require_admin),
):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    if "email" in updates:
        updates["email"] = updates["email"].lower()
    res = await db.students.update_one({"id": student_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Student not found")
    return {"ok": True, "updated": list(updates.keys())}


@api.delete("/admin/students/{student_id}")
async def admin_delete_student(student_id: str, user: dict = Depends(require_admin)):
    res = await db.students.delete_one({"id": student_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Student not found")
    return {"ok": True}


# --- WebSocket ---
@app.websocket("/api/ws/notifications")
async def ws_notifications(ws: WebSocket, token: str = Query(...)):
    try:
        payload = decode_token(token)
    except Exception:
        await ws.close(code=4401); return
    if payload.get("role") != "student":
        await ws.close(code=4403); return
    sid = payload["sub"]
    await ws_manager.connect(sid, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await ws_manager.disconnect(sid, ws)


@api.get("/")
async def root():
    return {"message": "AI Attendance System API", "status": "ok"}


@app.on_event("startup")
async def startup():
    await db.teachers.create_index("employee_id", unique=True)
    await db.teachers.create_index("email")
    await db.students.create_index("usn", unique=True)
    await db.students.create_index("email")
    await db.sessions.create_index([("teacher_id", 1), ("created_at", -1)])
    await db.attendance.create_index([("student_id", 1), ("date", -1)])
    await db.notifications.create_index([("student_id", 1), ("created_at", -1)])
    await db.password_resets.create_index([("email", 1), ("created_at", -1)])
    try:
        face_service.get_face_app()
        logger.info("InsightFace model loaded")
    except Exception as e:
        logger.exception("Face model load failed: %s", e)


app.include_router(api)
app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
