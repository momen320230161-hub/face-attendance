import csv
import io
from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status

from app.auth import UserProfile, require_admin
from app.services.attendance_service import AttendanceService, _in_mem_store, get_supabase, _is_table_missing_err

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


def _fetch_all_raw_records() -> List[Dict[str, Any]]:
    try:
        sb = get_supabase()
        res = sb.table("attendance_records").select("*").execute()
        if res.data is not None:
            # Merge with in-mem store records
            db_ids = {r["id"] for r in res.data}
            in_mem = [r for r_id, r in _in_mem_store.records.items() if r_id not in db_ids]
            return res.data + in_mem
    except Exception:
        pass
    return list(_in_mem_store.records.values())


def _fetch_all_raw_sessions() -> List[Dict[str, Any]]:
    try:
        return AttendanceService.list_sessions()
    except Exception:
        return list(_in_mem_store.sessions.values())



def _fetch_all_raw_courses() -> List[Dict[str, Any]]:
    try:
        return AttendanceService.list_all_courses()
    except Exception:
        return list(_in_mem_store.courses.values())


def _fetch_all_raw_enrollments() -> List[Dict[str, Any]]:
    try:
        sb = get_supabase()
        res = sb.table("course_enrollments").select("*").execute()
        if res.data is not None:
            db_ids = {e["id"] for e in res.data}
            in_mem = [e for e_id, e in _in_mem_store.enrollments.items() if e_id not in db_ids]
            return res.data + in_mem
    except Exception:
        pass
    return list(_in_mem_store.enrollments.values())


def _parse_iso_dt(dt_str: str) -> Optional[datetime]:
    try:
        cleaned = dt_str.strip().replace(" ", "+")
        return datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except Exception:
        return None


def _filter_and_enrich_records(
    course_id: Optional[UUID] = None,
    student_id: Optional[UUID] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    record_status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    raw_records = _fetch_all_raw_records()
    raw_sessions = {s["id"]: s for s in _fetch_all_raw_sessions()}
    raw_courses = {c["id"]: c for c in _fetch_all_raw_courses()}
    raw_students = {s["id"]: s for s in AttendanceService.list_all_students()}

    start_dt = _parse_iso_dt(start_date) if start_date else None
    end_dt = _parse_iso_dt(end_date) if end_date else None

    enriched = []
    for r in raw_records:
        sess = raw_sessions.get(str(r.get("session_id")), {})
        c_id = str(sess.get("course_id", ""))
        c_obj = raw_courses.get(c_id, {})
        st_obj = raw_students.get(str(r.get("student_id")), {})

        # Filters
        if course_id and c_id != str(course_id):
            continue

        if student_id and str(r.get("student_id")) != str(student_id):
            continue

        if record_status and str(r.get("status")).lower() != record_status.lower():
            continue

        rec_time_str = r.get("recognized_at") or r.get("created_at")
        if rec_time_str:
            rec_dt = _parse_iso_dt(str(rec_time_str))
            if rec_dt:
                if start_dt and rec_dt < start_dt:
                    continue
                if end_dt and rec_dt > end_dt:
                    continue

        conf = r.get("confidence")
        item = {
            "id": r.get("id"),
            "session_id": r.get("session_id"),
            "student_id": r.get("student_id"),
            "student_name": st_obj.get("full_name") or "Unnamed Student",
            "student_email": st_obj.get("email") or "",
            "course_id": c_id,
            "course_code": c_obj.get("code") or "UNKNOWN",
            "course_name": c_obj.get("name") or "Unknown Course",
            "session_date": sess.get("started_at") or r.get("created_at"),
            "status": r.get("status"),
            "confidence": conf,
            "similarity": conf,
            "recognition_source": r.get("recognition_source"),
            "recognized_at": r.get("recognized_at"),
            "created_at": r.get("created_at"),
        }
        enriched.append(item)

    return enriched


@router.get("/attendance", status_code=status.HTTP_200_OK)
def get_attendance_report(
    admin_user: Annotated[UserProfile, Depends(require_admin)],
    course_id: Optional[UUID] = Query(None),
    student_id: Optional[UUID] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    record_status: Optional[str] = Query(None, alias="status"),
) -> List[Dict[str, Any]]:
    """Admin-only endpoint returning filtered, safe attendance report entries."""
    return _filter_and_enrich_records(
        course_id=course_id,
        student_id=student_id,
        start_date=start_date,
        end_date=end_date,
        record_status=record_status,
    )


@router.get("/attendance.csv", status_code=status.HTTP_200_OK)
def export_attendance_csv(
    admin_user: Annotated[UserProfile, Depends(require_admin)],
    course_id: Optional[UUID] = Query(None),
    student_id: Optional[UUID] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    record_status: Optional[str] = Query(None, alias="status"),
) -> Response:
    """Admin-only endpoint generating a downloadable CSV report."""
    records = _filter_and_enrich_records(
        course_id=course_id,
        student_id=student_id,
        start_date=start_date,
        end_date=end_date,
        record_status=record_status,
    )

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Header
    writer.writerow([
        "Student ID",
        "Student Name",
        "Email",
        "Course Code",
        "Course Name",
        "Session Date",
        "Status",
        "Similarity",
        "Recognition Source",
        "Timestamp",
    ])

    for r in records:
        sim_val = f"{r['similarity']:.4f}" if isinstance(r.get('similarity'), (int, float)) else "N/A"
        writer.writerow([
            r.get("student_id", ""),
            r.get("student_name", ""),
            r.get("student_email", ""),
            r.get("course_code", ""),
            r.get("course_name", ""),
            r.get("session_date", ""),
            r.get("status", ""),
            sim_val,
            r.get("recognition_source", ""),
            r.get("recognized_at") or r.get("created_at") or "",
        ])

    csv_data = output.getvalue()
    filename = f"attendance_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/analytics/summary", status_code=status.HTTP_200_OK)
def get_analytics_summary(
    admin_user: Annotated[UserProfile, Depends(require_admin)],
    course_id: Optional[UUID] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
) -> Dict[str, Any]:

    """Admin-only endpoint providing aggregated attendance & recognition statistics."""
    records = _filter_and_enrich_records(
        course_id=course_id,
        start_date=start_date,
        end_date=end_date,
    )

    courses = _fetch_all_raw_courses()
    students = AttendanceService.list_all_students()
    enrollments = _fetch_all_raw_enrollments()
    sessions = _fetch_all_raw_sessions()

    if course_id:
        sessions = [s for s in sessions if str(s.get("course_id")) == str(course_id)]
        enrollments = [e for e in enrollments if str(e.get("course_id")) == str(course_id)]

    total_courses = len(courses)
    total_students = len(students)
    total_enrollments = len(enrollments)
    total_sessions = len(sessions)

    open_sessions = len([s for s in sessions if s.get("status") == "open"])
    closed_sessions = len([s for s in sessions if s.get("status") == "closed"])

    total_records = len(records)
    present_count = len([r for r in records if r.get("status") == "present"])
    late_count = len([r for r in records if r.get("status") == "late"])
    absent_count = len([r for r in records if r.get("status") == "absent"])
    excused_count = len([r for r in records if r.get("status") == "excused"])

    # Formula: (present + late) / total_expected_attendance * 100
    # Expected attendance = total_enrollments * total_sessions
    total_expected = total_enrollments * total_sessions if (total_enrollments and total_sessions) else total_records
    attendance_rate = (
        ((present_count + late_count) / total_expected) * 100.0 if total_expected > 0 else 0.0
    )

    face_rec_records = [r for r in records if r.get("recognition_source") == "face_recognition"]
    manual_records = [r for r in records if r.get("recognition_source") == "manual"]
    system_records = [r for r in records if r.get("recognition_source") == "system"]

    similarities = [
        float(r["similarity"])
        for r in face_rec_records
        if isinstance(r.get("similarity"), (int, float))
    ]

    avg_sim = sum(similarities) / len(similarities) if similarities else None
    min_sim = min(similarities) if similarities else None
    max_sim = max(similarities) if similarities else None

    return {
        "total_courses": total_courses,
        "total_students": total_students,
        "total_enrollments": total_enrollments,
        "total_sessions": total_sessions,
        "open_sessions": open_sessions,
        "closed_sessions": closed_sessions,
        "total_records": total_records,
        "present_count": present_count,
        "late_count": late_count,
        "absent_count": absent_count,
        "excused_count": excused_count,
        "attendance_rate": round(attendance_rate, 2),
        "face_recognition_count": len(face_rec_records),
        "manual_count": len(manual_records),
        "system_count": len(system_records),
        "average_similarity": round(avg_sim, 4) if avg_sim is not None else None,
        "min_similarity": round(min_sim, 4) if min_sim is not None else None,
        "max_similarity": round(max_sim, 4) if max_sim is not None else None,
    }
