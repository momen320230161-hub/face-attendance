from typing import Annotated, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import UserProfile, get_current_user, require_admin
from app.schemas.course import CourseCreate, CourseResponse, CourseUpdate, EnrollmentCreate, EnrollmentResponse, StudentProfileSummary
from app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
def create_course(
    data: CourseCreate,
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> CourseResponse:
    row = AttendanceService.create_course(
        code=data.code,
        name=data.name,
        description=data.description,
        created_by=admin_user.user_id,
    )
    return CourseResponse.model_validate(row)


@router.patch("/{course_id}", response_model=CourseResponse)
def update_course(
    course_id: UUID,
    data: CourseUpdate,
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> CourseResponse:
    row = AttendanceService.update_course(
        course_id=str(course_id),
        code=data.code,
        name=data.name,
        description=data.description,
    )
    return CourseResponse.model_validate(row)


@router.delete("/{course_id}", status_code=status.HTTP_200_OK)
def delete_course(
    course_id: UUID,
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> dict:
    AttendanceService.delete_course(str(course_id))
    return {"status": "deleted", "course_id": str(course_id)}


@router.get("", response_model=List[CourseResponse])
def list_courses(
    current_user: Annotated[UserProfile, Depends(get_current_user)],
) -> List[CourseResponse]:
    if current_user.role == "admin":
        rows = AttendanceService.list_all_courses()
    else:
        rows = AttendanceService.list_courses_for_student(current_user.user_id)
    return [CourseResponse.model_validate(r) for r in rows]


@router.get("/{course_id}", response_model=CourseResponse)
def get_course(
    course_id: UUID,
    current_user: Annotated[UserProfile, Depends(get_current_user)],
) -> CourseResponse:
    cid = str(course_id)
    course = AttendanceService.get_course_by_id(cid)
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course '{cid}' not found",
        )

    if current_user.role != "admin":
        if not AttendanceService.is_student_enrolled(cid, current_user.user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not enrolled in this course",
            )

    return CourseResponse.model_validate(course)


# ------------------------------------------------------------------
# ENROLLMENT ENDPOINTS
# ------------------------------------------------------------------


@router.post("/{course_id}/enrollments", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
def enroll_student(
    course_id: UUID,
    data: EnrollmentCreate,
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> EnrollmentResponse:
    row = AttendanceService.enroll_student(
        course_id=str(course_id),
        student_id=str(data.student_id),
    )
    return EnrollmentResponse.model_validate(row)


@router.delete("/{course_id}/enrollments/{student_id}", status_code=status.HTTP_200_OK)
def remove_enrollment(
    course_id: UUID,
    student_id: UUID,
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> dict:
    AttendanceService.remove_enrollment(
        course_id=str(course_id),
        student_id=str(student_id),
    )
    return {"status": "unenrolled", "course_id": str(course_id), "student_id": str(student_id)}


@router.get("/{course_id}/students", response_model=List[StudentProfileSummary])
def list_course_students(
    course_id: UUID,
    current_user: Annotated[UserProfile, Depends(get_current_user)],
) -> List[StudentProfileSummary]:
    cid = str(course_id)
    # Check if student is allowed
    if current_user.role != "admin":
        if not AttendanceService.is_student_enrolled(cid, current_user.user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not enrolled in this course",
            )

    students = AttendanceService.list_course_students(cid)
    return [StudentProfileSummary.model_validate(s) for s in students]
