from typing import Annotated, List
from fastapi import APIRouter, Depends, status

from app.auth import UserProfile, require_admin
from app.schemas.course import StudentProfileSummary
from app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/students", response_model=List[StudentProfileSummary], status_code=status.HTTP_200_OK)
def list_all_students(
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> List[StudentProfileSummary]:
    """Admin-only endpoint returning safe profile fields for student discovery and enrollment."""
    profiles = AttendanceService.list_all_students()
    return [StudentProfileSummary.model_validate(p) for p in profiles]
