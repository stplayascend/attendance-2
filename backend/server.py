"""AI Attendance System backend.

FastAPI + MongoDB + InsightFace (ArcFace 512-d).
JWT Bearer auth (mobile-friendly). Endpoints under /api.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

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


async def get_current(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    if creds is None:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    user_id = payload["sub"]
    role = payload["role"]
    coll = db.teachers if role == "teacher" else db.students
    user = await coll.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
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


# --- Models ---
class TeacherRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    subject: Optional[str] = ""


class TeacherLogin(BaseModel):
    email: EmailStr
    password: str


class StudentRegister(BaseModel):
    name: str
    usn: str
    roll_number: str
    semester: str
    division: str
    password: str


class StudentLogin(BaseModel):
    usn: str
    password: str


class FaceUpload(BaseModel):
    image_base64: str


class SessionCreate(BaseModel):
    semester: str
    division: str
    lecture: str
    time_from: str  # "HH:MM"
    time_to: str


class RecognizeRequest(BaseModel):
    images_base64: List[str]
    threshold: float = 0.40


class AttendanceEntry(BaseModel):
    student_id: str
    status: Literal["present", "absent"]


class SaveAttendance(BaseModel):
    entries: List[AttendanceEntry]


# --- Auth: Teacher ---
@api.post("/auth/register-teacher")
async def register_teacher(payload: TeacherRegister):
    email = payload.email.lower()
    if await db.teachers.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    tid = str(uuid.uuid4())
    await db.teachers.insert_one({
        "id": tid,
        "name": payload.name,
        "email": email,
        "subject": payload.subject or "",
        "password_hash": hash_pw(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    token = make_token(tid, "teacher")
    return {
        "token": token,
        "user": {"id": tid, "name": payload.name, "email": email,
                 "subject": payload.subject or "", "role": "teacher"},
    }


@api.post("/auth/login-teacher")
async def login_teacher(payload: TeacherLogin):
    email = payload.email.lower()
    t = await db.teachers.find_one({"email": email})
    if not t or not verify_pw(payload.password, t["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(t["id"], "teacher")
    return {
        "token": token,
        "user": {"id": t["id"], "name": t["name"], "email": t["email"],
                 "subject": t.get("subject", ""), "role": "teacher"},
    }


# --- Auth: Student ---
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
            "roll_number": payload.roll_number, "semester": payload.semester,
            "division": payload.division, "face_registered": False,
            "role": "student",
        },
    }


@api.post("/auth/login-student")
async def login_student(payload: StudentLogin):
    usn = payload.usn.upper().strip()
    s = await db.students.find_one({"usn": usn})
    if not s or not verify_pw(payload.password, s["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(s["id"], "student")
    return {
        "token": token,
        "user": {
            "id": s["id"], "name": s["name"], "usn": s["usn"],
            "roll_number": s["roll_number"], "semester": s["semester"],
            "division": s["division"],
            "face_registered": bool(s.get("face_registered")),
            "role": "student",
        },
    }


@api.get("/auth/me")
async def me(user: dict = Depends(get_current)):
    return user


# --- Student: Face upload ---
@api.post("/upload-face")
async def upload_face(payload: FaceUpload, user: dict = Depends(require_student)):
    try:
        emb = face_service.extract_single_embedding(payload.image_base64)
    except Exception as e:
        raise HTTPException(400, f"Invalid image: {e}")
    if emb is None:
        raise HTTPException(
            400,
            "No face detected. Please retake the photo with good lighting and face centered.",
        )
    await db.students.update_one(
        {"id": user["id"]},
        {"$push": {"embeddings": emb},
         "$set": {"face_registered": True,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    count = await db.students.find_one(
        {"id": user["id"]}, {"_id": 0, "embeddings": 1}
    )
    return {"ok": True, "embeddings_count": len(count.get("embeddings", []))}


@api.get("/students/me")
async def student_me(user: dict = Depends(require_student)):
    s = await db.students.find_one(
        {"id": user["id"]}, {"_id": 0, "password_hash": 0, "embeddings": 0}
    )
    if not s:
        raise HTTPException(404, "Not found")
    return s


# --- Sessions ---
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
        "time_from": payload.time_from,
        "time_to": payload.time_to,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "status": "open",  # open | completed
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


@api.post("/sessions/{session_id}/recognize")
async def recognize(
    session_id: str, payload: RecognizeRequest,
    user: dict = Depends(require_teacher),
):
    sess = await db.sessions.find_one({"id": session_id, "teacher_id": user["id"]})
    if not sess:
        raise HTTPException(404, "Session not found")

    # Load eligible students (same semester + division) with face embeddings
    cursor = db.students.find(
        {"semester": sess["semester"], "division": sess["division"],
         "face_registered": True},
        {"_id": 0, "password_hash": 0},
    )
    students = await cursor.to_list(5000)
    if not students:
        raise HTTPException(400, "No registered students with face data for this class.")

    # Run detection on each image, then match
    matched_ids = set()
    match_details = {}  # student_id -> best_sim
    total_detected = 0
    for b64 in payload.images_base64:
        try:
            faces = face_service.detect_and_embed(b64)
        except Exception as e:
            logging.exception("detect_and_embed failed")
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

    # Build response: all students in class with status
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

    # Normalize entries to dicts (handles both Pydantic models and dicts).
    raw = payload.entries
    entries = []
    for e in raw:
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
        {"$set": {"attendance": entries, "status": "completed",
                  "completed_at": now}},
    )

    # Also write to attendance collection for per-student history
    await db.attendance.delete_many({"session_id": session_id})
    rows = []
    for e in entries:
        rows.append({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "student_id": e["student_id"],
            "status": e["status"],
            "lecture": sess["lecture"],
            "semester": sess["semester"],
            "division": sess["division"],
            "date": sess["date"],
            "time_from": sess["time_from"],
            "time_to": sess["time_to"],
            "created_at": now,
        })
    if rows:
        await db.attendance.insert_many(rows)

    # Create in-app notifications
    notes = []
    for e in entries:
        title = f"Attendance: {sess['lecture']}"
        msg = (
            f"You were marked {e['status'].upper()} for {sess['lecture']} "
            f"on {sess['date']} ({sess['time_from']}–{sess['time_to']})"
        )
        notes.append({
            "id": str(uuid.uuid4()),
            "student_id": e["student_id"],
            "session_id": session_id,
            "title": title,
            "message": msg,
            "status": e["status"],
            "read": False,
            "created_at": now,
        })
    if notes:
        await db.notifications.insert_many(notes)

    return {"ok": True, "saved": len(rows)}


# --- Student views ---
@api.get("/attendance/student")
async def my_attendance(user: dict = Depends(require_student)):
    cur = db.attendance.find({"student_id": user["id"]}, {"_id": 0}).sort("date", -1)
    rows = await cur.to_list(1000)
    total = len(rows)
    present = sum(1 for r in rows if r["status"] == "present")
    pct = round((present / total) * 100, 1) if total else 0.0
    return {
        "total": total,
        "present": present,
        "absent": total - present,
        "percentage": pct,
        "records": rows,
    }


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


# --- Health ---
@api.get("/")
async def root():
    return {"message": "AI Attendance System API", "status": "ok"}


# --- Indexes + startup ---
@app.on_event("startup")
async def startup():
    await db.teachers.create_index("email", unique=True)
    await db.students.create_index("usn", unique=True)
    await db.sessions.create_index([("teacher_id", 1), ("created_at", -1)])
    await db.attendance.create_index([("student_id", 1), ("date", -1)])
    await db.notifications.create_index([("student_id", 1), ("created_at", -1)])
    # Warm up face model in background (non-blocking)
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("attendance")


@app.on_event("shutdown")
async def shutdown():
    client.close()
