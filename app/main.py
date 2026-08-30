import csv
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .attendance import record_check_in
from .auth import UserProfile, get_current_user, require_admin, require_device, require_staff, require_user
from .db import get_supabase
from .face_engine import average_embeddings, decode_image, get_face_embeddings, get_single_embedding
from .matcher import match_face
from .routers import admin_router, attendance_router, courses_router, recognition_router, reports_router

app = FastAPI(title="Face Attendance API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Enable CORS for local dev / Next.js frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(courses_router)
app.include_router(attendance_router)
app.include_router(recognition_router)
app.include_router(admin_router)
app.include_router(reports_router)



if (Path(__file__).parent / "static").exists():
    app.mount("/dashboard", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="dashboard")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Phase 3 Auth Verification Endpoints
@app.get("/api/v1/auth/me")
def get_me(user: Annotated[UserProfile, Depends(get_current_user)]) -> dict:
    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role,
        "full_name": user.full_name,
    }


@app.get("/api/v1/auth/admin-check")
def admin_check(admin_user: Annotated[UserProfile, Depends(require_admin)]) -> dict:
    return {
        "status": "authorized",
        "user_id": admin_user.user_id,
        "role": admin_user.role,
    }


@app.get("/api/v1/auth/admin-test", tags=["dev"])
def admin_test(admin_user: Annotated[UserProfile, Depends(require_admin)]) -> dict:
    """[DEV] RBAC test endpoint. 401 = no/invalid token. 403 = authenticated but role != admin. 200 = admin."""
    return {
        "status": "authorized",
        "message": "You have admin access.",
        "user_id": admin_user.user_id,
        "role": admin_user.role,
    }


@app.post("/enroll", dependencies=[Depends(require_staff)])
async def enroll_person(
    name: Annotated[str, Form(min_length=1, max_length=150)],
    images: Annotated[list[UploadFile], File()],
    user: Annotated[UserProfile, Depends(get_current_user)],
) -> dict:
    if not 3 <= len(images) <= 5:
        raise HTTPException(status_code=422, detail="Provide 3 to 5 enrollment images")
    embeddings = [get_single_embedding(decode_image(await image.read())) for image in images]
    result = get_supabase().table("people").insert(
        {"name": name.strip(), "embedding": average_embeddings(embeddings), "created_by": user.user_id}
    ).execute()
    return {"person": result.data[0], "images_used": len(images)}


@app.post("/check-in", dependencies=[Depends(require_device)])
async def check_in(image: Annotated[UploadFile, File()]) -> dict:
    embeddings = get_face_embeddings(decode_image(await image.read()))
    if not embeddings:
        return {"faces": [], "message": "No face detected"}

    faces = []
    for embedding in embeddings:
        match = match_face(embedding)
        if not match:
            faces.append({"status": "unknown"})
            continue
        logged = record_check_in(match["id"], float(match["similarity"]))
        faces.append({"status": "recognized", "person": match, "attendance_logged": logged})
    return {"faces": faces}


def _today_rows() -> list[dict]:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    return (
        get_supabase()
        .table("attendance_log")
        .select("id,timestamp,confidence,people(id,name)")
        .gte("timestamp", today_start)
        .order("timestamp", desc=True)
        .execute()
        .data
    )


@app.get("/attendance/today", dependencies=[Depends(require_staff)])
def today_attendance() -> dict:
    return {"records": _today_rows()}


@app.get("/attendance/today.csv", dependencies=[Depends(require_staff)])
def export_today_attendance() -> StreamingResponse:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["person_id", "name", "timestamp", "confidence"])
    for row in _today_rows():
        person = row.get("people") or {}
        writer.writerow([person.get("id"), person.get("name"), row["timestamp"], row["confidence"]])
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=attendance-today.csv"},
    )
