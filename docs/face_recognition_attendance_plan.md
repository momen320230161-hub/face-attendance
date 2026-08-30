# Face Recognition Attendance System — Full Project Plan (A to Z)

**Type:** Attendance / Check-in System
**Level:** Advanced
**Timeline:** ~3–4 days

---

## 1. Project Overview

Build a real-time face recognition attendance system: people enroll once, then get automatically recognized and logged (with timestamp) whenever they appear in front of a camera.

**Pipeline:**
```
Camera/Webcam → Face Detection → Alignment → Embedding → Match against DB → Log attendance
```

Keep each stage (detection, embedding, matching) modular and swappable — makes debugging and tuning far easier than one monolithic function.

---

## 2. Tech Stack

| Component | Choice | Why |
|---|---|---|
| Detection + embedding | `insightface` (ArcFace, `buffalo_l` model pack) | Much more accurate than dlib/`face_recognition`, still simple to use, works CPU or GPU |
| Backend | FastAPI | Async, easy to expose enrollment/check-in endpoints |
| Database | **Supabase (Postgres + `pgvector`)** | Managed Postgres, native vector similarity search, generous free tier |
| Vector matching | **`pgvector` cosine distance (`<=>` operator), in-DB query** | No need to pull all embeddings into Python — Postgres does the nearest-neighbor search |
| Auth | **Supabase Auth (email/password or magic link)** | Protects enrollment + reporting endpoints; issues JWTs FastAPI can verify |
| Capture UI | OpenCV loop (kiosk-style) or browser `getUserMedia` → POST to FastAPI | Pick based on deployment context |
| Dashboard | Streamlit | Fastest way to get a usable internal UI |
| Liveness (optional) | Blink detection / frame-difference check | Lightweight anti-spoofing, not full liveness ML |

---

## 3. Environment Setup

```bash
# Create environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Core dependencies
pip install insightface onnxruntime opencv-python fastapi uvicorn numpy
pip install supabase python-jose[cryptography] python-multipart

# Optional
pip install streamlit
```

> Use `onnxruntime-gpu` instead of `onnxruntime` if you have a CUDA-capable GPU — big speed win for real-time video.

**Supabase project setup:**
1. Create a project at [supabase.com](https://supabase.com)
2. In the SQL Editor, enable the vector extension: `create extension if not exists vector;`
3. Grab from Project Settings → API: `SUPABASE_URL`, `anon` public key (frontend/dashboard login), and `service_role` key (backend only — **never expose this to the client**)
4. Grab from Project Settings → API → JWT Settings: the JWT secret (needed for FastAPI to verify Supabase-issued tokens)

---

## 4. Database Schema

```sql
-- enable pgvector (run once)
create extension if not exists vector;

-- people table (the enrolled faces)
create table people (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    embedding vector(512) not null,   -- ArcFace embeddings are 512-dim
    created_at timestamptz default now(),
    created_by uuid references auth.users(id)   -- which staff member enrolled them
);

-- attendance_log table
create table attendance_log (
    id uuid primary key default gen_random_uuid(),
    person_id uuid not null references people(id),
    "timestamp" timestamptz default now(),
    confidence real not null
);

-- staff table — links Supabase Auth users to app-level roles
create table staff (
    user_id uuid primary key references auth.users(id),
    role text not null default 'staff' check (role in ('admin', 'staff')),
    created_at timestamptz default now()
);

-- index for fast nearest-neighbor search
create index on people using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Row Level Security (defense in depth — your FastAPI backend will use the
-- service_role key which bypasses RLS, but enable this if anything ever
-- talks to Supabase directly from a client)
alter table people enable row level security;
alter table attendance_log enable row level security;

create policy "staff can read people" on people
    for select using (exists (select 1 from staff where user_id = auth.uid()));

create policy "staff can insert people" on people
    for insert with check (exists (select 1 from staff where user_id = auth.uid()));

create policy "staff can read attendance" on attendance_log
    for select using (exists (select 1 from staff where user_id = auth.uid()));
```

**Notes:**
- Store embeddings, not raw face images, where possible — better for privacy and sufficient for matching.
- `ivfflat` index needs a decent number of rows to be effective (its docs recommend building it after you have real data, or accept a slower sequential scan while the table is small — fine for a few-days project).
- The `staff` table is what makes auth meaningful: a person can log in via Supabase Auth, but only rows in `staff` can actually enroll people or view logs.

---

## 5. Project Structure

```
face-attendance/
├── venv/
├── app/
│   ├── main.py              # FastAPI app entrypoint
│   ├── db.py                  # Supabase client init
│   ├── auth.py                 # JWT verification + role-check dependency
│   ├── face_engine.py         # detection + embedding wrapper around insightface
│   ├── matcher.py             # pgvector similarity query
│   ├── enrollment.py          # enrollment endpoint logic (protected)
│   ├── attendance.py          # check-in logic + debounce
│   └── config.py              # thresholds, keys, constants
├── dashboard/
│   └── streamlit_app.py       # login + live feed + today's check-ins
├── .env                        # SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET
├── requirements.txt
└── README.md
```

---

## 6. Day-by-Day Build Plan

### Day 1 — Core Pipeline
- [ ] Create Supabase project, enable `pgvector`, run schema + `match_person` function
- [ ] Add one staff user manually (sign up via Supabase Auth, then insert their `user_id` into `staff` with `role = 'admin'`) so you have a login to test with
- [ ] Set up `insightface` with `buffalo_l` model pack
- [ ] Build **enrollment flow**: capture 3–5 images per person → generate embeddings → average them → store in Supabase (`people` table), protected by `require_staff`
- [ ] Build **matching function**: query `match_person` RPC → return best match + similarity
- [ ] Set initial threshold: start around **0.5–0.6 cosine similarity** for ArcFace, tune later
- [ ] Wire up FastAPI auth dependency (`get_current_user` / `require_staff`) and confirm unauthenticated requests are rejected

### Day 2 — Attendance Logic
- [ ] Real-time capture loop (webcam or RTSP stream)
- [ ] On match: log `{person_id, timestamp, confidence}` to `attendance_log`
- [ ] **Debounce logic**: don't re-log the same person repeatedly (e.g., 1 check-in per 15–30 min window)
- [ ] Handle multi-face frames (e.g., classroom/office entry with several people at once)
- [ ] Reject/flag low-confidence matches instead of silently logging them as "unknown → present"

### Day 3 — Robustness + Reporting
- [ ] Test under real conditions: varying lighting, angles, glasses, masks
- [ ] Tune threshold based on false-accept vs. false-reject tradeoff (see Section 8)
- [ ] Add basic liveness check if spoofing is a concern (blink detection or frame-diff is enough — skip full anti-spoofing models unless this is security-critical)
- [ ] Build attendance report export (CSV / daily summary)

### Day 4 (Buffer) — Polish
- [ ] Streamlit dashboard: login screen (Supabase Auth) + live feed + today's check-ins list
- [ ] Edge case handling: no face detected, multiple people at once, poor lighting warning
- [ ] Final threshold pass + demo run-through

---

## 7. Core Logic Snippets

**Supabase client (`db.py`):**

```python
import os
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]  # backend only, never expose to frontend

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
```

**Embedding extraction (`face_engine.py`):**

```python
from insightface.app import FaceAnalysis

face_app = FaceAnalysis(name="buffalo_l")
face_app.prepare(ctx_id=0, det_size=(640, 640))  # ctx_id=-1 for CPU-only

def get_embedding(image):
    faces = face_app.get(image)
    if not faces:
        return None
    return faces[0].embedding.tolist()  # 512-d vector, as plain list for Supabase
```

**Matching via pgvector (`matcher.py`)** — the similarity search now happens *inside* Postgres instead of looping in Python:

```python
def match_face(query_embedding: list[float], threshold: float = 0.55):
    # <=> is cosine distance in pgvector; similarity = 1 - distance
    result = supabase.rpc(
        "match_person",
        {"query_embedding": query_embedding, "match_threshold": threshold}
    ).execute()
    if result.data:
        return result.data[0]["id"], result.data[0]["similarity"]
    return None, 0.0
```

Corresponding Postgres function (create once in the SQL Editor):

```sql
create or replace function match_person(query_embedding vector(512), match_threshold float)
returns table (id uuid, name text, similarity float)
language sql stable
as $$
    select id, name, 1 - (embedding <=> query_embedding) as similarity
    from people
    where 1 - (embedding <=> query_embedding) >= match_threshold
    order by embedding <=> query_embedding
    limit 1;
$$;
```

**Auth dependency (`auth.py`)** — verifies the Supabase JWT and checks the `staff` table:

```python
from fastapi import Depends, HTTPException, Header
from jose import jwt, JWTError
import os

SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]

def get_current_user(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        return payload["sub"]  # user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def require_staff(user_id: str = Depends(get_current_user)):
    result = supabase.table("staff").select("role").eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=403, detail="Not authorized")
    return result.data[0]["role"]
```

Then protect endpoints like:

```python
@app.post("/enroll")
def enroll_person(name: str, role: str = Depends(require_staff)):
    ...
```

**Debounce logic (conceptual):**

```python
from datetime import datetime, timedelta

DEBOUNCE_MINUTES = 15

def should_log_attendance(person_id, last_seen: dict) -> bool:
    now = datetime.now()
    last = last_seen.get(person_id)
    if last is None or now - last > timedelta(minutes=DEBOUNCE_MINUTES):
        last_seen[person_id] = now
        return True
    return False
```

---

## 8. Key Decisions & Tuning Notes

- **Threshold bias:** For attendance, a false accept (wrong person marked present) is usually worse than a false reject (person just retries). Bias toward a **stricter** threshold.
- **Enrollment quality matters more than model choice.** Capture multiple angles and lighting conditions per person at enrollment time — this has a bigger real-world accuracy impact than swapping models.
- **Privacy:** store embeddings, not raw images, wherever the use case allows. Document a retention/deletion policy if this touches real people's data (this matters even for internal/company use).
- **Multi-face frames:** decide upfront whether you process all faces per frame or just the largest/closest one — affects both logic and UX.
- **Who needs to log in vs. who doesn't:** staff need to authenticate to enroll people or view/export logs — the camera/check-in loop itself is *identifying* people, not authenticating them, so it doesn't need interactive login. If the check-in device is unattended, protect its endpoint with a long-lived API key or device credential instead of a user login.
- **Never ship the `service_role` key to any client-side code** (browser, kiosk app, mobile app) — it bypasses RLS entirely. It belongs only in the FastAPI backend's environment variables. The `anon` key is what the Streamlit dashboard/login screen should use.

---

## 9. Testing Checklist

- [ ] Correct match under normal lighting
- [ ] Correct match with glasses / hat / partial occlusion
- [ ] Correct rejection of unenrolled faces (no false accept)
- [ ] Multiple people in frame simultaneously
- [ ] Low light / backlit conditions
- [ ] Debounce works (no duplicate logs within window)
- [ ] Report export produces correct CSV
- [ ] Enrollment/reporting endpoints reject requests with no token or an invalid/expired token
- [ ] A logged-in user who isn't in the `staff` table gets a 403, not access
- [ ] `service_role` key never appears in any frontend/browser-facing code or bundle

---

## 10. Stretch Goals (if time allows)

- Liveness detection (blink/movement check) to prevent photo spoofing
- Email/Slack notification on check-in
- Admin panel for enrolling/removing people without touching the DB directly
- Role-based permissions: `admin` can manage staff/delete people, `staff` can only enroll/view
- Magic-link login instead of password (Supabase Auth supports this natively)
- Docker Compose setup for a deployable version

---

## 11. Quick Reference — Commands

```bash
# Run backend
uvicorn app.main:app --reload

# Run dashboard
streamlit run dashboard/streamlit_app.py
```
