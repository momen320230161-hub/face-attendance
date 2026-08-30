"""
Test suite for Phase 9 - Active Liveness & Backend Trust Boundary
"""

import pytest
from fastapi.testclient import TestClient

from app.auth import UserProfile, get_current_user
from app.main import app
from app.schemas.attendance import AttendanceRecordResponse, RecordStatus, RecognitionSource
import uuid
from datetime import datetime

client = TestClient(app)


def test_similarity_terminology_field():
    """Verify that AttendanceRecordResponse exposes similarity alongside confidence."""
    now = datetime.now()
    record_id = uuid.uuid4()
    session_id = uuid.uuid4()
    student_id = uuid.uuid4()

    resp = AttendanceRecordResponse(
        id=record_id,
        session_id=session_id,
        student_id=student_id,
        status=RecordStatus.PRESENT,
        confidence=0.88,
        recognition_source=RecognitionSource.FACE_RECOGNITION,
        created_at=now,
    )

    data = resp.model_dump()
    assert data["confidence"] == 0.88
    assert data["similarity"] == 0.88


def test_backend_trust_boundary_unauthenticated():
    """Backend must reject unauthenticated requests regardless of any liveness claim."""
    response = client.post("/api/v1/recognition/recognize")
    assert response.status_code == 401
