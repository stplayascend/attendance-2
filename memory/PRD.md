# AI Attendance System — PRD

## Overview
Mobile + backend system where students register with face data and teachers take attendance using face recognition.

## Stack
- Frontend: React Native (Expo SDK 54) with expo-router
- Backend: FastAPI (Python) + Motor/MongoDB
- Face AI: InsightFace (`buffalo_l` = RetinaFace + ArcFace r50), 512-d normalized embeddings
- Auth: JWT Bearer (AsyncStorage on mobile)
- Matching: Cosine similarity (default threshold 0.40, tunable per request)

## User Roles
- **Teacher**: register/login, create sessions, capture classroom images, run recognition, edit & save attendance.
- **Student**: register (Name, USN, Roll, Semester, Division, password), upload face selfie(s), view attendance % & history, receive in-app notifications.

## Face Recognition Pipeline
1. Student selfie → base64 → RetinaFace detection → 5-point alignment → ArcFace 112×112 → 512-d embedding (stored in Mongo).
2. Teacher captures up to 5 classroom photos (gallery or camera) → backend `/sessions/{id}/recognize` runs detect+embed on each → cosine-similarity match against enrolled students (same sem+div, face_registered=true).
3. Teacher reviews auto-marked list, toggles any errors, taps Save → attendance rows persisted, notifications pushed to each student's in-app feed.

## Screens
- `/` role selection (teacher / student)
- `/teacher/{login, register, dashboard, create-session, session/[id]}`
- `/student/{register, face-capture, login, dashboard}`

## MongoDB Collections
- `teachers { id, name, email*, subject, password_hash }` (unique email)
- `students { id, name, usn*, roll_number, semester, division, password_hash, embeddings[], face_registered }` (unique USN)
- `sessions { id, teacher_id, semester, division, lecture, time_from, time_to, date, status, attendance[] }`
- `attendance { id, session_id, student_id, status, lecture, date, ... }`
- `notifications { id, student_id, session_id, title, message, status, read }`

## Smart Enhancement
**Class-scoped recognition** — matching is constrained to the target semester+division cohort (not the whole DB), slashing false positives and inference time by orders of magnitude, while multi-selfie enrollment (stackable embeddings) raises recall on partial-visibility edge cases.

## Out of scope (v1)
- Push notifications, email alerts
- Per-teacher subject/class management beyond session-level fields
