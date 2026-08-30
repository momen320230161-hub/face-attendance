# 👤 Face Recognition Attendance System

<div align="center">

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-005571?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

**A production-ready, full-stack biometric attendance platform powered by deep learning facial recognition.**

[Features](#-features) · [Architecture](#-architecture) · [Quick Start](#-quick-start) · [API Reference](#-api-reference) · [Deployment](#-deployment)

</div>

---

## 📌 Overview

This project is a **full-stack face recognition attendance system** that eliminates manual check-ins by identifying staff members through a live camera feed. It combines a high-performance **FastAPI** backend with a modern **Next.js** dashboard, backed by **Supabase PostgreSQL** with `pgvector` for sub-millisecond facial vector search.

> **Use Case:** Universities, offices, or any organization that needs an automated, tamper-proof attendance tracking solution.

---

## ✨ Features

### 🤖 AI & Recognition Engine
- **Multi-angle Facial Enrollment** — Register staff with 3–5 images to build a robust 512-dimensional biometric embedding using **InsightFace + ONNX Runtime**.
- **Real-time Vector Search** — Cosine similarity matching via `pgvector` directly in PostgreSQL with sub-100ms response times.
- **Anti-spoofing Debounce** — In-memory cache engine prevents duplicate check-in records within configurable time windows.

### 🔐 Security
- **Dual-Layer Authentication**:
  - Staff/Admin endpoints protected by **Supabase Auth JWTs** with Role-Based Access Control (RBAC).
  - Kiosk endpoints protected by dedicated **Hardware Device API Keys** (`X-Device-Key` header).
- **Row-Level Security (RLS)** — All Supabase tables enforce RLS policies; staff can only access their own data.
- **Privacy Compliant** — Face embeddings are stored as abstract vectors, not images, minimizing biometric data exposure.

### 📊 Dashboard & Reporting
- **Next.js Admin Dashboard** — Manage staff, view live attendance logs, and track course-level statistics.
- **CSV Export** — One-click export of daily attendance records.
- **Course Management** — Assign students/staff to courses and track per-course attendance rates.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│                                                                  │
│   ┌─────────────────────┐      ┌─────────────────────────────┐  │
│   │   Next.js Dashboard │      │      Camera Kiosk Device    │  │
│   │  (Admin / Staff UI) │      │    (Hardware / Webcam App)  │  │
│   └──────────┬──────────┘      └──────────────┬──────────────┘  │
└──────────────┼──────────────────────────────── ┼ ───────────────┘
               │  Supabase JWT Auth              │  X-Device-Key
               ▼                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      FASTAPI BACKEND                             │
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│   │  Auth Router│  │ Attendance  │  │   Face Engine          │  │
│   │  /api/v1/   │  │  Router     │  │ InsightFace + ONNX     │  │
│   │  auth/*     │  │ /check-in   │  │ 512-d Embedding Extrac.│  │
│   └─────────────┘  └─────────────┘  └────────────────────────┘  │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SUPABASE (PostgreSQL)                        │
│                                                                  │
│   ┌─────────────────┐   ┌──────────────────┐   ┌─────────────┐  │
│   │  staff_profiles │   │  face_embeddings │   │  attendance │  │
│   │  (Auth + RBAC)  │   │  (pgvector index)│   │    _logs    │  │
│   └─────────────────┘   └──────────────────┘   └─────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| **AI / ML** | InsightFace + ONNX Runtime | Facial feature extraction (512-d embeddings) |
| **Backend** | FastAPI (Python 3.11+) | High-performance async REST API |
| **Frontend** | Next.js 15 + TypeScript | Admin dashboard & staff portal |
| **Styling** | Tailwind CSS | Utility-first responsive UI |
| **Database** | Supabase (PostgreSQL 15) | Relational data + Auth + RLS |
| **Vector Search** | pgvector | Cosine similarity face matching |
| **Auth** | Supabase Auth (JWT) | Role-based access control |
| **Deployment** | Docker + Docker Compose | Containerized full-stack deployment |

---

## 🚀 Quick Start

### Prerequisites

- Python **3.11** or **3.12**
- Node.js **18+** and npm
- A [Supabase](https://supabase.com/) project with `pgvector` extension enabled

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/face-recognition-attendance-system.git
cd face-recognition-attendance-system
```

### 2. Configure Environment Variables

```bash
# Copy the example env file
cp .env.example .env
```

Open `.env` and fill in your Supabase credentials:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEVICE_API_KEY=your-kiosk-device-key
```

### 3. Apply Database Schema

Run [`supabase/schema.sql`](supabase/schema.sql) in your **Supabase SQL Editor** to create all tables, `pgvector` indexes, and RLS policies.

### 4. Run the Backend

```bash
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn app.main:app --reload
```

Backend available at: `http://localhost:8000`  
Interactive API docs: `http://localhost:8000/docs`

### 5. Run the Frontend

```bash
cd frontend

# Install Node dependencies
npm install

# Start the development server
npm run dev
```

Frontend available at: `http://localhost:3000`

---

## 🐳 Docker Deployment

Run the entire stack (backend + frontend) with a single command:

```bash
docker-compose up --build
```

| Service | Port |
|:---|:---|
| FastAPI Backend | `8000` |
| Next.js Frontend | `3000` |

---

## 📡 API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|:---:|:---|:---:|:---|
| `GET` | `/health` | None | API health check |
| `GET` | `/api/v1/auth/me` | Bearer JWT | Get current user profile & role |
| `GET` | `/api/v1/auth/admin-check` | Admin JWT | Verify admin authorization |

### Face Enrollment & Recognition

| Method | Endpoint | Auth | Description |
|:---:|:---|:---:|:---|
| `POST` | `/enroll` | Staff JWT | Enroll a new person with 3–5 face images |
| `POST` | `/check-in` | `X-Device-Key` | Kiosk face recognition check-in |

### Attendance

| Method | Endpoint | Auth | Description |
|:---:|:---|:---:|:---|
| `GET` | `/attendance/today` | Staff JWT | Get today's attendance records |
| `GET` | `/attendance/today.csv` | Staff JWT | Export today's attendance as CSV |

### Courses & Reports

| Method | Endpoint | Auth | Description |
|:---:|:---|:---:|:---|
| `GET` | `/api/v1/courses` | Staff JWT | List all available courses |
| `GET` | `/api/v1/reports/...` | Admin JWT | Generate attendance reports |

> 📖 Full interactive documentation available at `/docs` (Swagger UI) and `/redoc`.

---

## 📁 Project Structure

```
face-recognition-attendance-system/
│
├── app/                        # FastAPI backend
│   ├── main.py                 # App entry point & middleware
│   ├── config.py               # Environment & settings
│   ├── face_engine.py          # InsightFace model loader
│   ├── matcher.py              # Vector similarity matching
│   ├── routers/                # API route handlers
│   │   ├── attendance.py
│   │   ├── courses.py
│   │   ├── recognition.py
│   │   ├── reports.py
│   │   └── admin.py
│   └── services/               # Business logic layer
│       ├── attendance_service.py
│       └── face_attendance_service.py
│
├── frontend/                   # Next.js 15 dashboard
│   └── src/
│       ├── app/                # Pages (App Router)
│       │   ├── login/
│       │   ├── signup/
│       │   ├── dashboard/
│       │   ├── attendance/
│       │   └── admin/
│       ├── components/         # Reusable UI components
│       ├── context/            # Auth & global state
│       └── lib/                # API client & utilities
│
├── supabase/
│   └── schema.sql              # Full DB schema with RLS policies
│
├── tests/                      # Backend test suite
├── docs/                       # Additional documentation
├── docker-compose.yml          # Full-stack Docker setup
├── Dockerfile                  # Backend container image
├── requirements.txt            # Python dependencies
└── .env.example                # Environment variable template
```

---

## 🔒 Security & Privacy

- Face data is stored as **abstract 512-dimensional vectors**, not raw images — there is no way to reconstruct a face from stored data.
- All database operations are governed by **Row-Level Security** policies; no direct table access is possible without proper authorization.
- Ensure compliance with applicable **biometric data privacy regulations** (e.g., GDPR, PDPA) in your deployment region — obtain explicit user consent before enrollment.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<div align="center">

Built with ❤️ using FastAPI, InsightFace, and Supabase.

</div>
