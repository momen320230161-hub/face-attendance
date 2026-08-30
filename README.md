# Face Recognition Attendance System

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)

A full-stack biometric attendance system that identifies staff members through a camera feed using deep learning facial recognition, eliminating the need for manual check-ins.

---

## How It Works

Staff are enrolled by submitting 3–5 face images. The **InsightFace** model extracts a 512-dimensional embedding per person and stores it in **Supabase PostgreSQL** via the `pgvector` extension. When a check-in image arrives from a kiosk device, the same pipeline runs and the resulting vector is matched against all stored embeddings using cosine similarity. A confident match records an attendance entry and applies a debounce window to prevent duplicate records.

The system exposes a **FastAPI** REST API consumed by a **Next.js** dashboard that allows administrators to manage staff, review attendance logs, and export reports.

---

## Stack

| Layer          | Technology                              |
|:---------------|:----------------------------------------|
| AI / ML        | InsightFace + ONNX Runtime (512-d face embeddings) |
| Backend        | FastAPI — Python 3.11+                  |
| Frontend       | Next.js 15 + TypeScript + Tailwind CSS  |
| Database       | Supabase (PostgreSQL 15 + pgvector)     |
| Auth           | Supabase Auth with JWT and RBAC         |
| Deployment     | Docker + Docker Compose                 |

---

## Setup

```bash
# 1. Copy environment variables
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, and DEVICE_API_KEY

# 2. Apply the database schema
# Run supabase/schema.sql in the Supabase SQL Editor

# 3. Start the backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# 4. Start the frontend
cd frontend && npm install && npm run dev
```

API docs available at `http://localhost:8000/docs`.

---

## Security

Face embeddings are stored as abstract floating-point vectors — raw images are never persisted and a face cannot be reconstructed from stored data. All database access is governed by Row-Level Security policies enforced at the Supabase layer. Ensure compliance with applicable biometric data regulations before deploying.
