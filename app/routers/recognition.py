from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.auth import UserProfile, get_current_user, require_admin
from app.services.face_attendance_service import FaceAttendanceService

router = APIRouter(prefix="/api/v1/recognition", tags=["recognition"])


@router.post("/enroll", status_code=status.HTTP_201_CREATED)
async def enroll_student_face(
    student_id: Annotated[UUID, Form(description="UUID of student to enroll")],
    image: Annotated[UploadFile, File(description="Enrollment image containing single face")],
    admin_user: Annotated[UserProfile, Depends(require_admin)],
) -> dict:
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Empty image file uploaded",
        )

    result = FaceAttendanceService.enroll_student_face(
        student_id=str(student_id),
        image_bytes=image_bytes,
    )
    return result


@router.post("/recognize", status_code=status.HTTP_200_OK)
async def recognize_face_check_in(
    session_id: Annotated[UUID, Form(description="UUID of active attendance session")],
    image: Annotated[UploadFile, File(description="Check-in image containing student face")],
    current_user: Annotated[UserProfile, Depends(get_current_user)],
) -> dict:
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Empty image file uploaded",
        )

    result = FaceAttendanceService.process_recognition_check_in(
        session_id=str(session_id),
        image_bytes=image_bytes,
    )
    return result
