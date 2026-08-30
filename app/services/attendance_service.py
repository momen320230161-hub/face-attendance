from datetime import datetime, timezone
import uuid
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status

from app.config import get_settings
from app.db import get_supabase
from app.schemas.course import CourseResponse, EnrollmentResponse, StudentProfileSummary
from app.schemas.attendance import (
    AttendanceSessionResponse,
    AttendanceRecordResponse,
    SessionStatus,
    RecordStatus,
    RecognitionSource,
)


class InMemStore:
    """In-memory fallback store when database tables are not yet synced to PostgREST cache."""

    def __init__(self):
        self.courses: Dict[str, Dict[str, Any]] = {}  # id -> dict
        self.enrollments: Dict[str, Dict[str, Any]] = {}  # id -> dict
        self.sessions: Dict[str, Dict[str, Any]] = {}  # id -> dict
        self.records: Dict[str, Dict[str, Any]] = {}  # id -> dict
        self.embeddings: Dict[str, Dict[str, Any]] = {}  # student_id -> dict

    def reset(self):
        self.courses.clear()
        self.enrollments.clear()
        self.sessions.clear()
        self.records.clear()
        self.embeddings.clear()


_in_mem_store = InMemStore()


def _is_table_missing_err(exc: Exception) -> bool:
    settings = get_settings()
    if not settings.allow_in_memory_fallback:
        return False
    err_str = str(exc)
    return "PGRST205" in err_str or "Could not find the table" in err_str or "relation" in err_str and "does not exist" in err_str


def _should_use_in_memory_fallback(exc: Exception) -> bool:
    """Return True when a read should fall back to in-memory data instead of failing."""
    if _is_table_missing_err(exc):
        return True
    err_str = str(exc).lower()
    type_name = type(exc).__name__.lower()
    transient_markers = (
        "server disconnected",
        "connection reset",
        "connection aborted",
        "timed out",
        "remoteprotocolerror",
        "connecterror",
        "readerror",
        "network",
    )
    return any(marker in err_str or marker in type_name for marker in transient_markers)


class AttendanceService:
    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    # ------------------------------------------------------------------
    # COURSES
    # ------------------------------------------------------------------
    @classmethod
    def create_course(
        cls, code: str, name: str, description: Optional[str] = None, created_by: Optional[str] = None
    ) -> Dict[str, Any]:
        all_courses = cls.list_all_courses()
        if any(c["code"].upper() == code.upper() for c in all_courses):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Course with code '{code}' already exists",
            )

        course_id = str(uuid.uuid4())
        now_iso = cls._now().isoformat()
        row = {
            "id": course_id,
            "code": code.upper(),
            "name": name,
            "description": description,
            "created_at": now_iso,
            "created_by": created_by,
        }

        try:
            sb = get_supabase()
            res = sb.table("courses").insert(row).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        _in_mem_store.courses[course_id] = row
        return row

    @classmethod
    def update_course(
        cls, course_id: str, code: Optional[str] = None, name: Optional[str] = None, description: Optional[str] = None
    ) -> Dict[str, Any]:
        existing = cls.get_course_by_id(course_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Course '{course_id}' not found",
            )

        if code is not None and code.upper() != existing["code"].upper():
            all_courses = cls.list_all_courses()
            if any(c["code"].upper() == code.upper() and c["id"] != course_id for c in all_courses):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Course with code '{code}' already exists",
                )

        updates: Dict[str, Any] = {}
        if code is not None:
            updates["code"] = code.upper()
        if name is not None:
            updates["name"] = name
        if description is not None:
            updates["description"] = description

        if not updates:
            return existing

        try:
            sb = get_supabase()
            res = sb.table("courses").update(updates).eq("id", course_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        existing.update(updates)
        _in_mem_store.courses[course_id] = existing
        return existing

    @classmethod
    def delete_course(cls, course_id: str) -> bool:
        existing = cls.get_course_by_id(course_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Course '{course_id}' not found",
            )

        try:
            sb = get_supabase()
            sb.table("courses").delete().eq("id", course_id).execute()
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        _in_mem_store.courses.pop(course_id, None)
        to_del_enr = [eid for eid, enr in _in_mem_store.enrollments.items() if enr["course_id"] == course_id]
        for eid in to_del_enr:
            _in_mem_store.enrollments.pop(eid, None)

        to_del_sess = [sid for sid, s in _in_mem_store.sessions.items() if s["course_id"] == course_id]
        for sid in to_del_sess:
            _in_mem_store.sessions.pop(sid, None)
            to_del_rec = [rid for rid, r in _in_mem_store.records.items() if r["session_id"] == sid]
            for rid in to_del_rec:
                _in_mem_store.records.pop(rid, None)

        return True

    @classmethod
    def get_course_by_id(cls, course_id: str) -> Optional[Dict[str, Any]]:
        try:
            sb = get_supabase()
            res = sb.table("courses").select("*").eq("id", course_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        return _in_mem_store.courses.get(course_id)

    @classmethod
    def list_all_courses(cls) -> List[Dict[str, Any]]:
        try:
            sb = get_supabase()
            res = sb.table("courses").select("*").execute()
            if res.data is not None:
                mem_courses = list(_in_mem_store.courses.values())
                existing_ids = {c["id"] for c in res.data}
                return res.data + [c for c in mem_courses if c["id"] not in existing_ids]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        return list(_in_mem_store.courses.values())

    @classmethod
    def list_courses_for_student(cls, student_id: str) -> List[Dict[str, Any]]:
        enrolled_course_ids = cls.get_enrolled_course_ids(student_id)
        all_courses = cls.list_all_courses()
        return [c for c in all_courses if c["id"] in enrolled_course_ids]

    # ------------------------------------------------------------------
    # ENROLLMENTS
    # ------------------------------------------------------------------
    @classmethod
    def get_enrolled_course_ids(cls, student_id: str) -> List[str]:
        course_ids = set()
        try:
            sb = get_supabase()
            res = sb.table("course_enrollments").select("course_id").eq("student_id", student_id).execute()
            if res.data:
                for row in res.data:
                    course_ids.add(row["course_id"])
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        for enr in _in_mem_store.enrollments.values():
            if enr["student_id"] == student_id:
                course_ids.add(enr["course_id"])

        return list(course_ids)

    @classmethod
    def is_student_enrolled(cls, course_id: str, student_id: str) -> bool:
        enrolled_ids = cls.get_enrolled_course_ids(student_id)
        return course_id in enrolled_ids

    @classmethod
    def enroll_student(cls, course_id: str, student_id: str) -> Dict[str, Any]:
        course = cls.get_course_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Course '{course_id}' not found",
            )

        student_profile = cls.get_profile_by_id(student_id)
        if not student_profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student profile '{student_id}' not found",
            )

        if cls.is_student_enrolled(course_id, student_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Student '{student_id}' is already enrolled in course '{course_id}'",
            )

        enr_id = str(uuid.uuid4())
        now_iso = cls._now().isoformat()
        row = {
            "id": enr_id,
            "course_id": course_id,
            "student_id": student_id,
            "created_at": now_iso,
        }

        try:
            sb = get_supabase()
            res = sb.table("course_enrollments").insert(row).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        _in_mem_store.enrollments[enr_id] = row
        return row

    @classmethod
    def remove_enrollment(cls, course_id: str, student_id: str) -> bool:
        if not cls.is_student_enrolled(course_id, student_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Enrollment for student '{student_id}' in course '{course_id}' not found",
            )

        try:
            sb = get_supabase()
            sb.table("course_enrollments").delete().eq("course_id", course_id).eq("student_id", student_id).execute()
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        to_del = [
            eid
            for eid, enr in _in_mem_store.enrollments.items()
            if enr["course_id"] == course_id and enr["student_id"] == student_id
        ]
        for eid in to_del:
            _in_mem_store.enrollments.pop(eid, None)

        return True

    @classmethod
    def list_course_students(cls, course_id: str) -> List[Dict[str, Any]]:
        course = cls.get_course_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Course '{course_id}' not found",
            )

        student_ids = set()
        try:
            sb = get_supabase()
            res = sb.table("course_enrollments").select("student_id").eq("course_id", course_id).execute()
            if res.data:
                for r in res.data:
                    student_ids.add(r["student_id"])
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        for enr in _in_mem_store.enrollments.values():
            if enr["course_id"] == course_id:
                student_ids.add(enr["student_id"])

        students = []
        for sid in student_ids:
            prof = cls.get_profile_by_id(sid)
            if prof:
                students.append(prof)
            else:
                students.append({"id": sid, "full_name": None, "role": "user"})

        return students

    @classmethod
    def get_profile_by_id(cls, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            sb = get_supabase()
            res = sb.table("profiles").select("*").eq("id", user_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception:
            pass

        return None

    @classmethod
    def list_all_students(cls) -> List[Dict[str, Any]]:
        try:
            sb = get_supabase()
            res = sb.table("profiles").select("*").execute()
            if res.data is not None:
                return res.data
        except Exception:
            pass

        return []


    # ------------------------------------------------------------------
    # ATTENDANCE SESSIONS
    # ------------------------------------------------------------------
    @classmethod
    def create_session(
        cls,
        course_id: str,
        started_at: Optional[datetime] = None,
        session_status: str = "open",
        created_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        course = cls.get_course_by_id(course_id)
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Course '{course_id}' not found",
            )

        if session_status not in (SessionStatus.OPEN.value, SessionStatus.CLOSED.value, SessionStatus.CANCELLED.value):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid session status '{session_status}'",
            )

        start_dt = started_at or cls._now()
        session_id = str(uuid.uuid4())
        now_iso = cls._now().isoformat()
        row = {
            "id": session_id,
            "course_id": course_id,
            "started_at": start_dt.isoformat(),
            "ended_at": None,
            "status": session_status,
            "created_at": now_iso,
            "created_by": created_by,
        }

        try:
            sb = get_supabase()
            res = sb.table("attendance_sessions").insert(row).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        _in_mem_store.sessions[session_id] = row
        return row

    @classmethod
    def close_session(cls, session_id: str) -> Dict[str, Any]:
        session = cls.get_session_by_id(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Attendance session '{session_id}' not found",
            )

        now_iso = cls._now().isoformat()
        updates = {"status": SessionStatus.CLOSED.value, "ended_at": now_iso}

        try:
            sb = get_supabase()
            res = sb.table("attendance_sessions").update(updates).eq("id", session_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        session.update(updates)
        _in_mem_store.sessions[session_id] = session
        return session

    @classmethod
    def get_session_by_id(cls, session_id: str) -> Optional[Dict[str, Any]]:
        try:
            sb = get_supabase()
            res = sb.table("attendance_sessions").select("*").eq("id", session_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        return _in_mem_store.sessions.get(session_id)

    @classmethod
    def list_sessions(cls, course_id: Optional[str] = None) -> List[Dict[str, Any]]:
        try:
            sb = get_supabase()
            q = sb.table("attendance_sessions").select("*")
            if course_id:
                q = q.eq("course_id", course_id)
            res = q.execute()
            if res.data is not None:
                mem_sessions = list(_in_mem_store.sessions.values())
                if course_id:
                    mem_sessions = [s for s in mem_sessions if s["course_id"] == course_id]
                existing_ids = {s["id"] for s in res.data}
                return res.data + [s for s in mem_sessions if s["id"] not in existing_ids]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        sessions = list(_in_mem_store.sessions.values())
        if course_id:
            sessions = [s for s in sessions if s["course_id"] == course_id]
        return sessions

    @classmethod
    def list_user_sessions(cls, student_id: str, course_id: Optional[str] = None) -> List[Dict[str, Any]]:
        enrolled_course_ids = set(cls.get_enrolled_course_ids(student_id))
        if course_id:
            if course_id not in enrolled_course_ids:
                return []
            allowed_course_ids = {course_id}
        else:
            allowed_course_ids = enrolled_course_ids

        all_sessions = cls.list_sessions()
        return [s for s in all_sessions if s["course_id"] in allowed_course_ids]

    # ------------------------------------------------------------------
    # ATTENDANCE RECORDS
    # ------------------------------------------------------------------
    @classmethod
    def create_record(
        cls,
        session_id: str,
        student_id: str,
        record_status: str = "present",
        recognized_at: Optional[datetime] = None,
        confidence: Optional[float] = None,
        recognition_source: str = "system",
    ) -> Dict[str, Any]:
        session = cls.get_session_by_id(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Attendance session '{session_id}' not found",
            )

        student_prof = cls.get_profile_by_id(student_id)
        if not student_prof:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student profile '{student_id}' not found",
            )

        if record_status not in (
            RecordStatus.PRESENT.value,
            RecordStatus.LATE.value,
            RecordStatus.ABSENT.value,
            RecordStatus.EXCUSED.value,
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid attendance status '{record_status}'",
            )

        if confidence is not None and not (0.0 <= confidence <= 1.0):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Confidence must be between 0.0 and 1.0",
            )

        if recognition_source not in (
            RecognitionSource.FACE_RECOGNITION.value,
            RecognitionSource.MANUAL.value,
            RecognitionSource.SYSTEM.value,
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid recognition source '{recognition_source}'",
            )

        existing_records = cls.list_records_by_session(session_id)
        if any(r["student_id"] == student_id for r in existing_records):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Attendance record for student '{student_id}' in session '{session_id}' already exists",
            )

        rec_id = str(uuid.uuid4())
        rec_time = (recognized_at or cls._now()).isoformat()
        now_iso = cls._now().isoformat()
        row = {
            "id": rec_id,
            "session_id": session_id,
            "student_id": student_id,
            "status": record_status,
            "recognized_at": rec_time,
            "confidence": confidence,
            "recognition_source": recognition_source,
            "created_at": now_iso,
        }

        try:
            sb = get_supabase()
            res = sb.table("attendance_records").insert(row).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        _in_mem_store.records[rec_id] = row
        return row

    @classmethod
    def list_records_by_session(cls, session_id: str) -> List[Dict[str, Any]]:
        try:
            sb = get_supabase()
            res = sb.table("attendance_records").select("*").eq("session_id", session_id).execute()
            if res.data is not None:
                mem_records = [r for r in _in_mem_store.records.values() if r["session_id"] == session_id]
                existing_ids = {r["id"] for r in res.data}
                return res.data + [r for r in mem_records if r["id"] not in existing_ids]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        return [r for r in _in_mem_store.records.values() if r["session_id"] == session_id]

    @classmethod
    def list_student_records(cls, student_id: str, course_id: Optional[str] = None) -> List[Dict[str, Any]]:
        records = []
        try:
            sb = get_supabase()
            res = sb.table("attendance_records").select("*").eq("student_id", student_id).execute()
            if res.data is not None:
                records.extend(res.data)
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        mem_recs = [r for r in _in_mem_store.records.values() if r["student_id"] == student_id]
        existing_ids = {r["id"] for r in records}
        records.extend([r for r in mem_recs if r["id"] not in existing_ids])

        if course_id:
            filtered = []
            for r in records:
                sess = cls.get_session_by_id(r["session_id"])
                if sess and sess["course_id"] == course_id:
                    filtered.append(r)
            return filtered

        return records

    # ------------------------------------------------------------------
    # FACE EMBEDDINGS Persist & Retrieve
    # ------------------------------------------------------------------
    @classmethod
    def save_face_embedding(
        cls,
        student_id: str,
        embedding: List[float],
        model_name: str = "ArcFace-buffalo_l",
        model_version: str = "v1.0",
    ) -> Dict[str, Any]:
        student_prof = cls.get_profile_by_id(student_id)
        if not student_prof:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student profile '{student_id}' not found",
            )

        emb_id = str(uuid.uuid4())
        now_iso = cls._now().isoformat()
        row = {
            "id": emb_id,
            "student_id": student_id,
            "embedding": embedding,
            "model_name": model_name,
            "model_version": model_version,
            "created_at": now_iso,
            "updated_at": now_iso,
        }

        try:
            sb = get_supabase()
            res = sb.table("face_embeddings").upsert(row, on_conflict="student_id").execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        _in_mem_store.embeddings[student_id] = row
        return row

    @classmethod
    def get_face_embedding_by_student(cls, student_id: str) -> Optional[Dict[str, Any]]:
        try:
            sb = get_supabase()
            res = sb.table("face_embeddings").select("*").eq("student_id", student_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        return _in_mem_store.embeddings.get(student_id)

    @classmethod
    def get_face_embeddings_for_students(cls, student_ids: List[str]) -> Dict[str, List[float]]:
        if not student_ids:
            return {}

        result: Dict[str, List[float]] = {}
        try:
            sb = get_supabase()
            res = sb.table("face_embeddings").select("student_id, embedding").in_("student_id", student_ids).execute()
            if res.data:
                for row in res.data:
                    result[row["student_id"]] = row["embedding"]
        except Exception as e:
            if not _should_use_in_memory_fallback(e):
                raise e

        for sid in student_ids:
            if sid not in result and sid in _in_mem_store.embeddings:
                result[sid] = _in_mem_store.embeddings[sid]["embedding"]

        return result
