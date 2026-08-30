from typing import Annotated, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import UserProfile, get_current_user, require_admin
from app.schemas.attendance import (
    AttendanceRecordResponse,
    AttendanceSessionCreate,
    AttendanceSessionResponse,
)
from app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])


@router.post("/sessions", response_model=AttendanceSessionResponse, status_code=status.HTTP_201_CREATED)
def create_attendance_session(
    data: AttendanceSessionCreate,
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> AttendanceSessionResponse:
    row = AttendanceService.create_session(
        course_id=str(data.course_id),
        started_at=data.started_at,
        session_status=data.status.value,
        created_by=admin_user.user_id,
    )
    return AttendanceSessionResponse.model_validate(row)


@router.post("/sessions/{session_id}/close", response_model=AttendanceSessionResponse)
def close_attendance_session(
    session_id: UUID,
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> AttendanceSessionResponse:
    row = AttendanceService.close_session(str(session_id))
    return AttendanceSessionResponse.model_validate(row)


@router.get("/sessions", response_model=List[AttendanceSessionResponse])
def list_attendance_sessions(
    current_user: Annotated[UserProfile, Depends(get_current_user)],
    course_id: Optional[UUID] = Query(None, description="Optional course filter"),
) -> List[AttendanceSessionResponse]:
    cid_str = str(course_id) if course_id else None
    if current_user.role == "admin":
        rows = AttendanceService.list_sessions(course_id=cid_str)
    else:
        rows = AttendanceService.list_user_sessions(student_id=current_user.user_id, course_id=cid_str)
    return [AttendanceSessionResponse.model_validate(r) for r in rows]


@router.get("/sessions/{session_id}", response_model=AttendanceSessionResponse)
def get_attendance_session(
    session_id: UUID,
    current_user: Annotated[UserProfile, Depends(get_current_user)],
) -> AttendanceSessionResponse:
    sid = str(session_id)
    session = AttendanceService.get_session_by_id(sid)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance session '{sid}' not found",
        )

    if current_user.role != "admin":
        if not AttendanceService.is_student_enrolled(session["course_id"], current_user.user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not enrolled in the course for this session",
            )

    return AttendanceSessionResponse.model_validate(session)


# ------------------------------------------------------------------
# ATTENDANCE RECORDS ENDPOINTS
# ------------------------------------------------------------------


@router.get("/sessions/{session_id}/records", response_model=List[AttendanceRecordResponse])
def list_session_records(
    session_id: UUID,
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> List[AttendanceRecordResponse]:
    sid = str(session_id)
    session = AttendanceService.get_session_by_id(sid)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance session '{sid}' not found",
        )

    rows = AttendanceService.list_records_by_session(sid)
    return [AttendanceRecordResponse.model_validate(r) for r in rows]


@router.get("/my-records", response_model=List[AttendanceRecordResponse])
def get_my_attendance_records(
    current_user: Annotated[UserProfile, Depends(get_current_user)],
    course_id: Optional[UUID] = Query(None, description="Optional course filter"),
) -> List[AttendanceRecordResponse]:
    cid_str = str(course_id) if course_id else None
    rows = AttendanceService.list_student_records(student_id=current_user.user_id, course_id=cid_str)
    return [AttendanceRecordResponse.model_validate(r) for r in rows]
