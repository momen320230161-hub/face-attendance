# 👤 Face Attendance API & Verification System

[![Python 3.11/3.12](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20pgvector-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
[![InsightFace](https://img.shields.io/badge/AI-InsightFace%20%2B%20ONNX-FF6F00)](https://github.com/deepinsight/insightface)

A high-performance biometric attendance and check-in API built with **FastAPI**, **InsightFace** (512-d facial embedding extraction), and **Supabase PostgreSQL** utilizing **`pgvector`** vector similarity search and Row-Level Security (RLS).

---

## 🌟 Key Features

- 📸 **Facial Enrollment**: Multi-angle enrollment API accepting 3–5 face images to build a robust biometric profile vector per staff member.
- ⚡ **Vector Search with `pgvector`**: Instant facial matching against registered embeddings using Cosine Similarity (`<->`) in PostgreSQL.
- 🛡️ **Dual-Layer Authentication**:
  - **Staff Management Endpoints**: Secured via Supabase Auth JWTs.
  - **Check-In Kiosk Endpoints**: Secured via dedicated Hardware Device API Keys (`X-Device-Key`).
- ⏱️ **Debounce Engine**: In-memory anti-duplication cache preventing double check-in records within configurable time windows.
- 📊 **Export & Reporting**: Instant query and CSV export for daily attendance logs.

---

## 🏗️ Architecture Flow

```text
┌────────────────┐      (3-5 Face Images)       ┌────────────────────────┐
│  Enrollment    │ ───────────────────────────► │  InsightFace Pipeline  │
└────────────────┘                              └────────────────────────┘
                                                            │
                                                   Extract 512-d Vector
                                                            │
                                                            ▼
┌────────────────┐      (Check-in Image)        ┌────────────────────────┐
│  Camera Kiosk  │ ───────────────────────────► │ PostgreSQL + pgvector  │
└────────────────┘                              └────────────────────────┘
                                                            │
                                                   Cosine Match < 0.60
                                                            │
                                                            ▼
                                                Record Attendance Log
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Python 3.11 or 3.12
- Active Supabase Project with `pgvector` extension enabled

### 2. Environment Setup

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

### 3. Database Migration

Run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase SQL Editor to provision tables, `pgvector` indexes, and RLS policies.

### 4. Install & Run

```bash
# Create virtual environment
python -m venv .venv

# Activate environment (Windows)
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start API Server
uvicorn app.main:app --reload
```

Server will run on `http://127.0.0.1:8000`. Access Swagger docs at `http://127.0.0.1:8000/docs`.

---

## 📡 API Endpoints Summary

| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | None | API Health Check |
| `POST` | `/enroll` | Staff JWT | Enroll new person with 3–5 face photos |
| `POST` | `/check-in` | `X-Device-Key` | Kiosk automatic face recognition check-in |
| `GET` | `/attendance/today` | Staff JWT | Retrieve today's attendance logs |
| `GET` | `/attendance/today.csv` | Staff JWT | Export today's attendance to CSV |

---

## 🔒 Security & Privacy Note

Face embeddings represent sensitive biometric metadata. Ensure compliance with local privacy regulations (obtain user consent, enforce RLS policies, and encrypt data at rest).
