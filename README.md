# Face Recognition Attendance System

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-005571?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20pgvector-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

A full-stack biometric attendance system that identifies students and staff through face recognition, eliminating manual check-ins. Attendance is recorded automatically when a student's face is matched against their registered embedding during an active session.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Face Recognition Pipeline](#face-recognition-pipeline)
- [Attendance Workflow](#attendance-workflow)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Docker](#docker)
- [Testing](#testing)
- [Security](#security)
- [Current Status](#current-status)
- [Planned Improvements](#planned-improvements)

---

## Overview

The system is organized around three concerns:

1. **Identity registration** — An admin uploads a face image for a student. The backend detects the face, extracts a 512-dimensional ArcFace embedding via InsightFace (`buffalo_l`), normalizes it with L2, and stores it in Supabase.

2. **Course-scoped attendance sessions** — An admin opens a session for a course. Only students enrolled in that course are eligible to have attendance recorded in that session.

3. **Face recognition check-in** — A student submits an image. The backend extracts an embedding from the image and runs cosine similarity against the embeddings of enrolled students for that session. If the best match exceeds the configured threshold, an attendance record is created.

The frontend (Next.js) provides separate interfaces for admin operations and student self-service, communicating with the FastAPI backend over authenticated REST endpoints.

---

## Features

The following features are implemented and verified in the codebase:

**Authentication and Authorization**
- Supabase Auth JWTs (ES256 and HS256 fallback) verified on every protected endpoint.
- Role-based access control with three roles: `admin`, `staff`, and `user`.
- Kiosk/device endpoints protected by a separate static API key (`X-Device-Key` header).

**Course Management**
- Admin can create, update, and delete courses.
- Admin can enroll and remove students from courses.
- Students can only view courses they are enrolled in.

**Face Enrollment**
- Admin uploads a single image per student via `POST /api/v1/recognition/enroll`.
- The pipeline rejects images containing zero faces or more than one face.
- Produced embedding is stored in Supabase; the raw image is never persisted.

**Face Recognition Check-in**
- `POST /api/v1/recognition/recognize` accepts an image and a session ID.
- Recognition is scoped to enrolled students for that session's course — the system does not compare against all registered faces globally.
- Duplicate check-in within the same session is detected and rejected.

**Attendance Sessions**
- Admin creates and closes attendance sessions per course.
- Sessions have statuses: `open`, `closed`, `cancelled`.
- Students can view sessions for courses they are enrolled in.

**Attendance Records**
- Records store: student, session, status (`present`, `late`, `absent`, `excused`), cosine similarity score, recognition source (`face_recognition`, `manual`, `system`), and timestamp.
- Students can retrieve their own attendance records.

**Reports and Analytics**
- Admin can query attendance records filtered by course, student, date range, and status.
- CSV export of filtered results.
- Aggregated analytics endpoint returning session counts, attendance rate, recognition source breakdown, and similarity statistics.

**Legacy Kiosk Mode**
- `POST /check-in` (device-key protected) runs recognition against all registered `people` records — a simpler mode independent of course sessions, with an in-memory debounce window.

**Frontend Dashboard**
- Pages: `/login`, `/signup`, `/dashboard`, `/attendance`, `/admin`.
- Admin panel includes course management, student management, session management, face enrollment, and attendance reporting.

---

## Architecture

```
+------------------------------+        +------------------------------+
|      Next.js Frontend        |        |     Camera / Kiosk Device    |
|  (Admin Dashboard + Student  |        |  (submits image for check-in)|
|   Self-Service Portal)       |        |                              |
+-------------+----------------+        +---------------+--------------+
              |                                         |
              |  Bearer JWT (ES256 / HS256)             |  X-Device-Key
              v                                         v
+-------------------------------------------------------------------------+
|                          FastAPI Backend                                |
|                                                                         |
|  /api/v1/auth/*         JWT validation, role extraction (profiles table)|
|  /api/v1/courses/*      Course CRUD, enrollment management             |
|  /api/v1/attendance/*   Session lifecycle, attendance records           |
|  /api/v1/recognition/*  Face enrollment, face recognition check-in     |
|  /api/v1/reports/*      Filtered reports, CSV export, analytics         |
|  /api/v1/admin/*        Student listing for admin discovery             |
|  /enroll                Legacy enrollment (staff JWT)                   |
|  /check-in              Legacy kiosk check-in (X-Device-Key)           |
|  /health                Health probe                                    |
|                                                                         |
|  app/face/                                                              |
|    FaceDetector   (OpenCV Haar Cascade)                                 |
|    FacePreprocessor                                                     |
|    FaceEmbedder   (InsightFace buffalo_l — ArcFace w600k_r50.onnx)     |
|    FaceMatcher    (Cosine Similarity, configurable threshold)           |
+-------------------------------------+-----------------------------------+
                                      |
                                      | Supabase Python Client (service role)
                                      v
+-------------------------------------------------------------------------+
|                    Supabase (PostgreSQL 15 + pgvector)                  |
|                                                                         |
|  auth.users            Supabase managed authentication                  |
|  public.profiles       Role + full_name per auth user                   |
|  public.courses        Course catalog                                   |
|  public.course_enrollments   Student-course membership                  |
|  public.attendance_sessions  Session lifecycle per course               |
|  public.attendance_records   Per-student per-session attendance          |
|  public.people         Legacy: face embeddings (vector(512))            |
|  public.attendance_log Legacy: check-in log per person                  |
|  public.staff          Legacy: staff role table                         |
+-------------------------------------------------------------------------+
```

---

## Technology Stack

| Layer | Technology | Version |
|:---|:---|:---|
| **Backend** | FastAPI | >=0.115, <1.0 |
| **Backend runtime** | Uvicorn | >=0.30 |
| **Frontend** | Next.js + React | 16.3.3 / 19.x |
| **Frontend language** | TypeScript | ^5 |
| **Frontend styling** | Tailwind CSS | ^4.3 |
| **Frontend auth client** | @supabase/supabase-js | ^2.112 |
| **AI — face recognition** | InsightFace (`buffalo_l`) | 1.0.1 |
| **AI — inference runtime** | ONNX Runtime | >=1.20 |
| **AI — image processing** | OpenCV | >=4.10 |
| **Numerical computing** | NumPy | >=1.26 |
| **Database** | Supabase (PostgreSQL 15) | — |
| **Vector search** | pgvector extension | — |
| **Authentication** | Supabase Auth (JWT ES256) | — |
| **JWT validation** | PyJWT + python-jose | >=2.8 / >=3.3 |
| **Config management** | pydantic-settings | >=2.6 |
| **Deployment** | Docker + Docker Compose | — |
| **Testing** | pytest + HTTPX | — |

---

## Face Recognition Pipeline

The pipeline is implemented in `app/face/` as a set of modular classes.

### Detection

`FaceDetector` uses the OpenCV Haar Cascade classifier (`haarcascade_frontalface_default.xml`) to detect faces in an uploaded image. It returns bounding boxes and cropped face regions. Multi-scale detection is applied with `scaleFactor=1.1`, `minNeighbors=5`, `minSize=(30, 30)`.

### Embedding Extraction

`FaceEmbedder` loads the InsightFace `buffalo_l` model pack, which includes the **ArcFace** recognition model (`w600k_r50.onnx`). For each face image:

1. The image is passed through `FaceAnalysis.get()` to extract a face embedding.
2. If the full pipeline does not return an embedding (e.g., cropped face input), the ArcFace ONNX model is called directly with a 112×112 resized crop.
3. The raw embedding vector has dimension **512**.
4. The vector is **L2-normalized** before storage and comparison.

ONNX Runtime runs on CPU by default (`ctx_id=-1`). GPU (`CUDAExecutionProvider`) is used if available.

### Matching

`FaceMatcher` computes **cosine similarity** between the query embedding and each enrolled student embedding. The best match is returned if it meets or exceeds the configured threshold (`MATCH_THRESHOLD`, default `0.60`).

Matching during recognition check-in is **course-scoped**: only the embeddings of students enrolled in the session's course are compared.

### Liveness Detection

There is no dedicated liveness detection model in the current implementation. The backend enforces a **trust boundary**: the recognition endpoint requires a valid authenticated JWT, and the check-in is tied to an open session. Active liveness (e.g., blink detection, challenge-response) is not implemented.

---

## Attendance Workflow

The full session-based workflow proceeds as follows:

1. **Admin creates a course** — `POST /api/v1/courses`
2. **Admin enrolls students** — `POST /api/v1/courses/{course_id}/enrollments`
3. **Admin registers student faces** — `POST /api/v1/recognition/enroll` (one image per student)
4. **Admin opens an attendance session** — `POST /api/v1/attendance/sessions`
5. **Student submits a check-in image** — `POST /api/v1/recognition/recognize` with the session ID
   - The backend validates the session is open.
   - It fetches face embeddings only for students enrolled in that course.
   - It extracts an embedding from the submitted image and runs cosine matching.
   - If a match is found and attendance is not already recorded for this student in this session, a record with status `present` and the similarity score is persisted.
6. **Admin closes the session** — `POST /api/v1/attendance/sessions/{session_id}/close`
7. **Admin reviews records and exports** — `GET /api/v1/reports/attendance` and `GET /api/v1/reports/attendance.csv`

---

## Database Schema

All tables are in the `public` schema of a Supabase PostgreSQL 15 instance. Row-Level Security is enabled on all tables.

| Table | Description |
|:---|:---|
| `profiles` | Mirrors `auth.users`. Stores `full_name` and application `role` (`admin`, `user`). |
| `courses` | Course catalog with `code`, `name`, `description`, `created_by`. |
| `course_enrollments` | Many-to-many join of `courses` and `profiles` (students). Unique per course+student pair. |
| `attendance_sessions` | A session belongs to a course. Status is `open`, `closed`, or `cancelled`. |
| `attendance_records` | One record per student per session. Stores status, confidence score, and recognition source. |
| `people` | Legacy table. Stores a person's name and their `vector(512)` face embedding. |
| `attendance_log` | Legacy table. Records each check-in event with timestamp and confidence. |
| `staff` | Legacy table. Maps auth user IDs to staff roles. |

A custom SQL function `match_person(query_embedding, match_threshold)` runs an IVFFlat cosine similarity search over `people.embedding` and returns the closest match above the threshold. This is used by the legacy `/check-in` kiosk endpoint.

---

## Project Structure

```
face-recognition-attendance-system/
|
+-- app/                              # FastAPI backend package
|   +-- main.py                       # Application entry point, CORS, route mounting
|   +-- config.py                     # Pydantic settings (reads .env)
|   +-- auth.py                       # JWT verification, JWKS client, RBAC dependencies
|   +-- db.py                         # Supabase client singleton
|   +-- attendance.py                 # Legacy debounce check-in helper
|   +-- face_engine.py                # Legacy InsightFace wrapper (used by /enroll, /check-in)
|   +-- matcher.py                    # Legacy pgvector match_person RPC wrapper
|   +-- face/                         # Modular face recognition pipeline
|   |   +-- models.py                 # Pydantic result models (detection, embedding, match)
|   |   +-- detector.py               # OpenCV Haar Cascade face detector
|   |   +-- preprocessor.py           # Face crop preprocessing
|   |   +-- embedder.py               # ArcFace embedding via InsightFace buffalo_l
|   |   +-- matcher.py                # Cosine similarity matcher
|   |   +-- service.py                # FaceRecognitionService facade
|   +-- routers/                      # API route handlers
|   |   +-- attendance.py             # Session and record endpoints
|   |   +-- courses.py                # Course and enrollment endpoints
|   |   +-- recognition.py            # Face enrollment and recognition check-in
|   |   +-- reports.py                # Attendance reports, CSV export, analytics
|   |   +-- admin.py                  # Admin student listing
|   +-- schemas/                      # Pydantic request/response models
|   +-- services/                     # Business logic
|       +-- attendance_service.py     # All database operations for courses and attendance
|       +-- face_attendance_service.py# Connects face pipeline to attendance session logic
|
+-- frontend/                         # Next.js 16 dashboard
|   +-- src/
|       +-- app/                      # App Router pages
|       |   +-- login/                # Login page
|       |   +-- signup/               # Sign-up page
|       |   +-- dashboard/            # Student attendance dashboard
|       |   +-- attendance/           # Attendance session view
|       |   +-- admin/                # Admin panel (courses, students, sessions, reports)
|       +-- components/               # Reusable UI components
|       +-- context/                  # Auth context
|       +-- lib/                      # Supabase client, API utilities
|
+-- supabase/
|   +-- schema.sql                    # Full schema: tables, indexes, RLS policies, functions
|   +-- migrations/                   # Migration files
|
+-- tests/                            # pytest test suite
|   +-- test_auth.py
|   +-- test_attendance_foundation.py
|   +-- test_face_recognition.py
|   +-- test_analytics_reports.py
|   +-- test_liveness_backend.py
|   +-- test_real_model_inference.py
|
+-- scripts/
|   +-- audit_face_recognition.py     # Offline audit script for recognition pipeline
|   +-- evaluate_face_recognition.py  # Offline evaluation script
|
+-- docs/                             # Additional documentation
+-- data/                             # Local data (not committed)
+-- Dockerfile                        # Backend container image
+-- docker-compose.yml                # Full-stack compose (backend + frontend)
+-- requirements.txt                  # Python dependencies
+-- .env.example                      # Environment variable template
```

---

## Local Development

### Prerequisites

- Python **3.11** or **3.12**
- Node.js **18+** and npm
- A [Supabase](https://supabase.com/) project with the `pgvector` extension enabled

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/face-recognition-attendance-system.git
cd face-recognition-attendance-system
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your Supabase credentials. See [Environment Variables](#environment-variables) for all required names.

### 3. Apply the Database Schema

Run `supabase/schema.sql` in the **Supabase SQL Editor** of your project to create all tables, indexes, RLS policies, and the `match_person` function.

### 4. Set Up the Backend

```bash
# Create virtual environment
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate
# Activate (macOS / Linux)
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the development server
uvicorn app.main:app --reload
```

The backend starts at `http://localhost:8000`.  
Swagger UI: `http://localhost:8000/docs`  
ReDoc: `http://localhost:8000/redoc`

### 5. Set Up the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts at `http://localhost:3000`.

---

## Environment Variables

All variable names are documented below. Do not commit real values to version control. Copy `.env.example` to `.env` and fill in your own credentials.

**Backend variables** (read by `app/config.py`):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=optional-only-needed-for-hs256-tokens

DEVICE_API_KEY=a-long-random-secret-for-kiosk-devices

MATCH_THRESHOLD=0.60
DEBOUNCE_MINUTES=20
INSIGHTFACE_CTX_ID=-1
```

**Frontend variables** (required at Next.js build time):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_REDIRECT_URL=http://localhost:3000
```

> `SUPABASE_SERVICE_ROLE_KEY` grants unrestricted database access and must never be exposed to the browser or committed to source control.

---

## Docker

The `docker-compose.yml` defines two services: `backend` (port 8000) and `frontend` (port 3000). The frontend container waits for the backend health check to pass before starting.

```bash
# Build and start both services
docker compose up --build

# Start in detached mode
docker compose up --build -d
```

| Service  | URL                        |
|:---------|:---------------------------|
| Frontend | http://localhost:3000      |
| Backend  | http://localhost:8000      |
| Health   | http://localhost:8000/health |
| API docs | http://localhost:8000/docs |

Environment variables are loaded from `.env` for the backend. Frontend `NEXT_PUBLIC_*` variables are passed as Docker build arguments from the same `.env` file (see `docker-compose.yml`).

---

## Testing

The test suite uses `pytest` and FastAPI's `TestClient`. Tests cover auth, attendance foundation, face recognition pipeline, analytics/reports, and backend trust boundaries.

```bash
# Activate the virtual environment first
.venv\Scripts\activate

# Run all tests
pytest tests/

# Run with output
pytest tests/ -v

# Run a specific file
pytest tests/test_face_recognition.py -v
```

Current result: **55 tests pass**.

Note: `test_real_model_inference.py` loads the actual InsightFace model from disk. ONNX Runtime will emit a warning if `CUDAExecutionProvider` is unavailable; tests still pass on CPU.

---

## Security

- **Secrets** — `.env` is excluded from version control via `.gitignore`. No credentials appear in the codebase.
- **JWT verification** — Every protected endpoint validates the Supabase JWT signature using JWKS (ES256). An HS256 fallback is available if `SUPABASE_JWT_SECRET` is explicitly set.
- **Role enforcement** — Admin-only endpoints check `role == 'admin'` in the `profiles` table after token validation. An authenticated non-admin user receives HTTP 403.
- **Device authentication** — Kiosk endpoints validate the `X-Device-Key` header against `DEVICE_API_KEY`. No user token is involved.
- **Row-Level Security** — RLS policies are defined for all tables. Students can only read their own enrollment and attendance records. Only admins can write to any table.
- **Biometric data handling** — Raw face images are never stored. Only the L2-normalized 512-dimensional embedding vector is persisted. The API response for enrollment never returns the embedding.
- **Recognition scope** — Face matching during a session is restricted to enrolled students for that course; the system does not compare against all registered users.

---

## Current Status

| Component | Status |
|:---|:---|
| FastAPI backend | Working locally |
| Next.js frontend | Working locally |
| Docker Compose | Working locally (backend + frontend) |
| Backend health check | Passing (`GET /health` returns `{"status": "ok"}`) |
| Test suite | 55 tests passing |
| Production deployment | Not completed |

---

## Planned Improvements

The following are not yet implemented:

- Production deployment (e.g., Railway, Fly.io, or a VPS)
- Active liveness detection (blink challenge, motion-based checks)
- CI/CD pipeline for automated testing on push
- Model/image size optimization for faster container startup
- Monitoring and structured logging
- Rate limiting on recognition endpoints
- Support for multiple face images per enrollment (averaging embeddings)

---

## Screenshots

<!-- Add admin dashboard screenshot here -->
<!-- Add attendance session view screenshot here -->
<!-- Add face enrollment flow screenshot here -->
