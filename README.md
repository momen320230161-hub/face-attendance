# Face Recognition Attendance System

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-005571?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

A production-ready, full-stack biometric attendance system built on deep learning facial recognition. Staff members are identified in real time through a camera feed — no manual check-ins required.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Security](#security)

---

## Overview

This system combines a **FastAPI** backend with a **Next.js** dashboard, backed by **Supabase PostgreSQL** and the `pgvector` extension for high-performance facial vector similarity search.

Each staff member is enrolled by submitting 3–5 face images. The InsightFace model extracts a 512-dimensional embedding that is stored in PostgreSQL. When a check-in image arrives from a kiosk device, the same pipeline runs and the resulting vector is matched against all stored embeddings using cosine similarity. A match below the configured threshold records an attendance entry.

---

## Architecture

```
+-----------------------------+        +-----------------------------+
|     Next.js Dashboard       |        |      Camera Kiosk Device    |
|  (Admin / Staff Interface)  |        |  (Hardware or Webcam App)   |
+-------------+---------------+        +---------------+-------------+
              |  Supabase JWT                          |  X-Device-Key
              v                                        v
+----------------------------------------------------------------------------+
|                            FastAPI Backend                                 |
|                                                                            |
|   auth router          attendance router          face engine              |
|   /api/v1/auth/*       /check-in, /enroll         InsightFace + ONNX      |
|                                                   512-d embedding          |
+-------------------------------------+--------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------+
|                         Supabase (PostgreSQL 15)                           |
|                                                                            |
|   staff_profiles          face_embeddings          attendance_logs         |
|   Auth + RBAC             pgvector index           daily records           |
+----------------------------------------------------------------------------+
```

---

## Tech Stack

| Layer          | Technology                  | Role                                      |
|:---------------|:----------------------------|:------------------------------------------|
| AI / ML        | InsightFace + ONNX Runtime  | Face feature extraction (512-d vectors)   |
| Backend        | FastAPI (Python 3.11+)      | Async REST API                            |
| Frontend       | Next.js 15 + TypeScript     | Admin dashboard and staff portal          |
| Styling        | Tailwind CSS                | Responsive utility-first UI               |
| Database       | Supabase (PostgreSQL 15)    | Relational data, Auth, and RLS policies   |
| Vector Search  | pgvector                    | Cosine similarity face matching           |
| Authentication | Supabase Auth (JWT)         | Role-based access control                 |
| Deployment     | Docker + Docker Compose     | Containerized full-stack deployment       |

---

## Getting Started

### Prerequisites

- Python 3.11 or 3.12
- Node.js 18+ and npm
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

Open `.env` and fill in the values. All required variables are listed in `.env.example`:

```env
# Supabase (backend)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_JWT_SECRET=optional-jwt-secret

# Frontend
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_REDIRECT_URL=http://localhost:3000

# Kiosk device secret — sent as the X-Device-Key request header
DEVICE_API_KEY=replace-with-a-long-random-secret

# Recognition tuning
MATCH_THRESHOLD=0.60
DEBOUNCE_MINUTES=20
INSIGHTFACE_CTX_ID=-1
```

### 3. Apply the Database Schema

Execute [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor to provision all tables, vector indexes, and RLS policies.

### 4. Run the Backend

```bash
# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Start the development server
uvicorn app.main:app --reload
```

- API base URL: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 5. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard available at: `http://localhost:3000`

### Docker (Full Stack)

```bash
docker-compose up --build
```

| Service          | Port   |
|:-----------------|:-------|
| FastAPI Backend  | `8000` |
| Next.js Frontend | `3000` |

---

## API Reference

### Authentication

| Method | Endpoint                    | Auth       | Description                      |
|:------:|:----------------------------|:----------:|:---------------------------------|
| GET    | `/health`                   | None       | API health check                 |
| GET    | `/api/v1/auth/me`           | Bearer JWT | Get current user profile and role |
| GET    | `/api/v1/auth/admin-check`  | Admin JWT  | Verify admin role authorization  |

### Enrollment and Recognition

| Method | Endpoint    | Auth          | Description                            |
|:------:|:------------|:-------------:|:---------------------------------------|
| POST   | `/enroll`   | Staff JWT     | Enroll a new person with 3–5 images    |
| POST   | `/check-in` | X-Device-Key  | Kiosk face recognition check-in        |

### Attendance

| Method | Endpoint                 | Auth      | Description                        |
|:------:|:-------------------------|:---------:|:-----------------------------------|
| GET    | `/attendance/today`      | Staff JWT | Retrieve today's attendance records |
| GET    | `/attendance/today.csv`  | Staff JWT | Export today's attendance as CSV   |

### Courses and Reports

| Method | Endpoint              | Auth      | Description                   |
|:------:|:----------------------|:---------:|:------------------------------|
| GET    | `/api/v1/courses`     | Staff JWT | List all courses              |
| GET    | `/api/v1/reports/...` | Admin JWT | Generate attendance reports   |

---

## Project Structure

```
face-recognition-attendance-system/
|
+-- app/                          # FastAPI backend
|   +-- main.py                   # Application entry point and middleware
|   +-- config.py                 # Environment configuration
|   +-- face_engine.py            # InsightFace model initialization
|   +-- matcher.py                # Vector similarity logic
|   +-- routers/
|   |   +-- attendance.py
|   |   +-- courses.py
|   |   +-- recognition.py
|   |   +-- reports.py
|   |   +-- admin.py
|   +-- services/
|       +-- attendance_service.py
|       +-- face_attendance_service.py
|
+-- frontend/                     # Next.js 15 dashboard
|   +-- src/
|       +-- app/                  # Pages (App Router)
|       |   +-- login/
|       |   +-- signup/
|       |   +-- dashboard/
|       |   +-- attendance/
|       |   +-- admin/
|       +-- components/           # Reusable UI components
|       +-- context/              # Auth and global state
|       +-- lib/                  # API client and utilities
|
+-- supabase/
|   +-- schema.sql                # Full schema with RLS policies
|
+-- tests/                        # Backend test suite
+-- docs/                         # Additional documentation
+-- docker-compose.yml
+-- Dockerfile
+-- requirements.txt
+-- .env.example
```

---

## Security

**Biometric data handling:**  
Face embeddings are stored as abstract 512-dimensional floating-point vectors. Raw images are never persisted. It is not computationally feasible to reconstruct a face from a stored embedding.

**Access control:**  
All database operations are governed by Supabase Row-Level Security policies. Staff accounts can only read and write their own records. Admin-scoped endpoints require an additional role check enforced at the API layer.

**Compliance:**  
Deployers are responsible for obtaining explicit user consent before enrollment and for complying with applicable biometric data privacy regulations in their jurisdiction (e.g., GDPR, PDPA).

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
