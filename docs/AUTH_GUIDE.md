# 🔐 Phase 3 — Authentication & Authorization Guide

This document details the authentication and role-based authorization architecture implemented for the **Face Attendance & Verification System**.

---

## 🏗️ Architecture Overview

```text
Next.js Frontend (App Router)
       │
       ▼
Supabase Auth (Source of Truth)
       │
       ▼  JWT Access Token (HS256)
FastAPI Backend
       │
       ├── 1. Verify Cryptographic JWT Signature (SUPABASE_JWT_SECRET)
       ├── 2. Extract Authenticated User ID (sub claim)
       └── 3. Authorize Role against DB (`public.profiles.role`)
```

---

## 🛡️ Security Boundaries & Rules

1. **Supabase Auth** is the sole source of truth for passwords, credentials, and user identities. No passwords or sensitive auth tokens are stored in application tables.
2. **`public.profiles`** is the application-level role table (`id`, `role`, `full_name`).
3. **Role Enforcement**:
   - Newly created users are **always** assigned `role = 'user'` via Phase 2 database triggers (`handle_new_user`).
   - Clients cannot specify or override their role during signup.
   - FastAPI verifies roles from `public.profiles` in PostgreSQL and denies unauthorized requests (`HTTP 403 Forbidden`).
4. **Secrets Separation**:
   - `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` remain strictly on the backend.
   - Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are exposed to the frontend.

---

## ⚙️ Environment Variables Setup

### Backend Environment (`.env`)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-backend-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
DEVICE_API_KEY=your-hardware-kiosk-api-key
MATCH_THRESHOLD=0.60
DEBOUNCE_MINUTES=20
INSIGHTFACE_CTX_ID=-1
```

### Frontend Environment (`frontend/.env.local`)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

---

## 🚀 Running the Services Locally

### 1. Start the FastAPI Backend
```bash
# From workspace root
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```
Backend runs at: `http://127.0.0.1:8000` (Swagger docs: `http://127.0.0.1:8000/docs`)

### 2. Start the Next.js Frontend
```bash
# From frontend directory
cd frontend
npm run dev
```
Frontend runs at: `http://localhost:3000`

---

## 🧪 Manual Testing Instructions

### Step 1: User Signup (`/signup`)
1. Open `http://localhost:3000/signup`.
2. Enter Full Name, Email, and Password (minimum 6 characters).
3. Click **Create Account**.
4. Supabase Auth creates the user, and the `handle_new_user` database trigger automatically provisions a row in `public.profiles` with `role = 'user'`.

### Step 2: User Login & Dashboard (`/login` & `/dashboard`)
1. Log in at `http://localhost:3000/login` using your credentials.
2. Upon successful login, you are redirected to `/dashboard`.
3. Click **Call `/api/v1/auth/me`**.
4. The dashboard issues an HTTP GET to `http://127.0.0.1:8000/api/v1/auth/me` with `Authorization: Bearer <token>`.
5. FastAPI verifies the JWT and returns:
```json
{
  "user_id": "<uuid>",
  "email": "user@example.com",
  "role": "user",
  "full_name": "Jane Doe"
}
```

### Step 3: Verify Admin Authorization Restriction (`/admin`)
1. Navigate to `http://localhost:3000/admin` as a normal user (`role = 'user'`).
2. The UI renders **"⛔ Access Denied: Your current database role is user"**.
3. Direct API call to `http://127.0.0.1:8000/api/v1/auth/admin-check` with a normal user token returns `HTTP 403 Forbidden` (`{"detail": "Admin authorization required"}`).

### Step 4: Promote a User to Admin Safely
To test admin features, promote a test user to `admin` directly via Supabase SQL Editor:
```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'admin@example.com'
);
```

### Step 5: Test Admin Privileges (`/admin`)
1. Log in with the promoted admin user.
2. Navigate to `http://localhost:3000/admin`.
3. Click **Call `/api/v1/auth/admin-check`**.
4. Response returns HTTP 200:
```json
{
  "status": "authorized",
  "user_id": "<uuid>",
  "role": "admin"
}
```

---

## 🧪 Running Automated Backend Tests

```bash
$env:PYTHONPATH="."
.venv\Scripts\python.exe -m pytest tests/test_auth.py
```
Checks:
- Missing authorization header → `401 Unauthorized`
- Malformed header → `401 Unauthorized`
- Invalid token signature → `401 Unauthorized`
- Valid user token → `200 OK` on `/api/v1/auth/me`
- Normal user accessing admin endpoint → `403 Forbidden`
- Admin user accessing admin endpoint → `200 OK` on `/api/v1/auth/admin-check`
