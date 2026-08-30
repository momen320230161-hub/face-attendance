from typing import Any, Dict, Optional
from fastapi import HTTPException, status

from app.face import get_face_recognition_service
from app.services.attendance_service import AttendanceService


class FaceAttendanceService:
    """Service connecting face recognition pipeline to course attendance management."""

    @classmethod
    def enroll_student_face(cls, student_id: str, image_bytes: bytes) -> Dict[str, Any]:
        # 1. Validate student profile exists
        profile = AttendanceService.get_profile_by_id(student_id)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Student profile '{student_id}' not found",
            )

        # 2. Process image, detect 1 face, generate embedding
        rec_service = get_face_recognition_service()
        embedding_result = rec_service.generate_embedding_from_bytes(image_bytes)

        # 3. Persist embedding securely in database
        saved_row = AttendanceService.save_face_embedding(
            student_id=student_id,
            embedding=embedding_result.embedding,
            model_name=embedding_result.model_name,
            model_version=embedding_result.model_version,
        )

        # 4. Return safe non-biometric confirmation (NEVER return raw embedding)
        return {
            "status": "enrolled",
            "student_id": student_id,
            "model_name": saved_row.get("model_name", embedding_result.model_name),
            "model_version": saved_row.get("model_version", embedding_result.model_version),
        }

    @classmethod
    def process_recognition_check_in(
        cls,
        session_id: str,
        image_bytes: bytes,
        threshold: Optional[float] = None,
    ) -> Dict[str, Any]:
        # 1. Validate session existence and open status
        session = AttendanceService.get_session_by_id(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Attendance session '{session_id}' not found",
            )

        if session.get("status") != "open":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Attendance session '{session_id}' is closed or cancelled",
            )

        course_id = session["course_id"]

        # 2. Get students enrolled in course
        enrolled_students = AttendanceService.list_course_students(course_id)
        student_ids = [s["id"] for s in enrolled_students]

        if not student_ids:
            return {
                "matched": False,
                "similarity": 0.0,
                "message": "No students are enrolled in this course",
            }

        # 3. Fetch face embeddings for enrolled course students
        enrolled_embeddings = AttendanceService.get_face_embeddings_for_students(student_ids)
        if not enrolled_embeddings:
            return {
                "matched": False,
                "similarity": 0.0,
                "message": "No face embeddings registered for enrolled course students",
            }

        # 4. Process image and run similarity matching against authorized enrolled embeddings
        rec_service = get_face_recognition_service()
        match_result = rec_service.match_face_from_bytes(
            image_bytes=image_bytes,
            enrolled_embeddings=enrolled_embeddings,
            threshold=threshold,
        )

        if not match_result.matched or not match_result.student_id:
            return {
                "matched": False,
                "similarity": match_result.similarity,
            }

        matched_student_id = match_result.student_id

        # 5. Verify student is enrolled in the course
        if not AttendanceService.is_student_enrolled(course_id, matched_student_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Recognized student is not enrolled in this course",
            )

        # 6. Check for duplicate attendance record in session
        existing_records = AttendanceService.list_records_by_session(session_id)
        already_marked = any(r["student_id"] == matched_student_id for r in existing_records)

        if already_marked:
            return {
                "matched": True,
                "student_id": matched_student_id,
                "similarity": match_result.similarity,
                "status": "already_marked",
                "message": "Attendance already recorded for this student in session",
            }

        # 7. Create attendance record
        record = AttendanceService.create_record(
            session_id=session_id,
            student_id=matched_student_id,
            record_status="present",
            confidence=match_result.similarity,
            recognition_source="face_recognition",
        )

        return {
            "matched": True,
            "student_id": matched_student_id,
            "similarity": match_result.similarity,
            "attendance_record_id": record["id"],
            "status": "present",
        }
