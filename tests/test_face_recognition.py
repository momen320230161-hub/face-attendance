import io
import uuid
from unittest.mock import patch
import cv2
import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import UserProfile, get_current_user, require_admin
from app.config import get_settings
from app.face import (
    FaceDetector,
    FaceEmbedder,
    FaceMatcher,
    FacePreprocessor,
    FaceRecognitionService,
    cosine_similarity,
)
from app.face.models import FaceBoundingBox, FaceDetectionResult
from app.main import app
from app.services.attendance_service import AttendanceService, _in_mem_store
from app.services.face_attendance_service import FaceAttendanceService

client = TestClient(app)

# Test User Identifiers
ADMIN_USER_ID = "00000000-0000-4000-a000-000000000001"
STUDENT_USER_ID_1 = "00000000-0000-4000-a000-000000000002"
STUDENT_USER_ID_2 = "00000000-0000-4000-a000-000000000003"


def mock_get_current_user_normal():
    return UserProfile(
        user_id=STUDENT_USER_ID_1,
        email="student1@ejust.edu.eg",
        role="user",
        full_name="Student One",
    )


def mock_get_current_user_admin():
    return UserProfile(
        user_id=ADMIN_USER_ID,
        email="admin@ejust.edu.eg",
        role="admin",
        full_name="System Admin",
    )


def create_synthetic_image_bytes(draw_faces: int = 1) -> bytes:
    """Helper creating synthetic images containing N faces for testing."""
    img = np.ones((400, 400, 3), dtype=np.uint8) * 240

    if draw_faces == 0:
        # Blank canvas (no faces drawn)
        _, encoded = cv2.imencode(".png", img)
        return encoded.tobytes()

    for i in range(draw_faces):
        center_x = 100 + i * 150
        center_y = 200
        # Draw face oval
        cv2.ellipse(img, (center_x, center_y), (40, 60), 0, 0, 360, (180, 150, 120), -1)
        # Draw eyes
        cv2.circle(img, (center_x - 15, center_y - 15), 5, (0, 0, 0), -1)
        cv2.circle(img, (center_x + 15, center_y - 15), 5, (0, 0, 0), -1)
        # Draw mouth
        cv2.ellipse(img, (center_x, center_y + 20), (15, 8), 0, 0, 180, (0, 0, 0), 2)

    _, encoded = cv2.imencode(".png", img)
    return encoded.tobytes()


@pytest.fixture(autouse=True)
def setup_test_state():
    _in_mem_store.reset()

    # Register profiles
    _in_mem_store.courses.clear()
    _in_mem_store.enrollments.clear()
    _in_mem_store.sessions.clear()
    _in_mem_store.records.clear()
    _in_mem_store.embeddings.clear()

    # Populate mock profiles
    with patch.object(
        AttendanceService,
        "get_profile_by_id",
        side_effect=lambda uid: {
            ADMIN_USER_ID: {"id": ADMIN_USER_ID, "full_name": "System Admin", "role": "admin"},
            STUDENT_USER_ID_1: {"id": STUDENT_USER_ID_1, "full_name": "Student One", "role": "user"},
            STUDENT_USER_ID_2: {"id": STUDENT_USER_ID_2, "full_name": "Student Two", "role": "user"},
        }.get(uid),
    ):
        yield


# ------------------------------------------------------------------
# UNIT & INTEGRATION TESTS
# ------------------------------------------------------------------


def test_1_no_face_detected_rejected():
    blank_bytes = create_synthetic_image_bytes(draw_faces=0)
    preprocessor = FacePreprocessor()
    img = preprocessor.validate_image(blank_bytes)

    with pytest.raises(HTTPException) as exc:
        preprocessor.preprocess(img, single_face_only=True)
    assert exc.value.status_code == 422
    assert "No face detected" in exc.value.detail


def test_2_invalid_image_rejected():
    invalid_bytes = b"not_an_image_file_content_12345"
    preprocessor = FacePreprocessor()

    with pytest.raises(HTTPException) as exc:
        preprocessor.validate_image(invalid_bytes)
    assert exc.value.status_code == 422
    assert "not a valid image" in exc.value.detail


def test_3_multiple_faces_rejected():
    multi_bytes = create_synthetic_image_bytes(draw_faces=2)
    preprocessor = FacePreprocessor()

    # Mock detector to simulate two faces detected
    mock_box = FaceBoundingBox(x=10, y=10, width=50, height=50)
    mock_faces = [
        FaceDetectionResult(bounding_box=mock_box, confidence=0.9, cropped_face=np.zeros((50, 50, 3), dtype=np.uint8)),
        FaceDetectionResult(bounding_box=mock_box, confidence=0.9, cropped_face=np.zeros((50, 50, 3), dtype=np.uint8)),
    ]

    with patch.object(FaceDetector, "detect", return_value=mock_faces):
        img = preprocessor.validate_image(multi_bytes)
        with pytest.raises(HTTPException) as exc:
            preprocessor.preprocess(img, single_face_only=True)
        assert exc.value.status_code == 422
        assert "Multiple faces detected" in exc.value.detail


def test_4_valid_face_embedding_generated():
    img_array = np.ones((100, 100, 3), dtype=np.uint8) * 150
    embedder = FaceEmbedder()
    res = embedder.encode(img_array)

    assert len(res.embedding) == 512
    assert res.dimension == 512
    assert res.model_name == "ArcFace-buffalo_l"

    # L2 Norm check ||vector||_2 == 1.0
    norm = np.linalg.norm(np.array(res.embedding))
    assert abs(norm - 1.0) < 1e-4


def test_5_similarity_above_threshold_matched():
    vec_a = [1.0 / np.sqrt(512)] * 512
    vec_b = [1.0 / np.sqrt(512)] * 512  # Identical vector -> similarity = 1.0

    enrolled = {STUDENT_USER_ID_1: vec_b}
    matcher = FaceMatcher(default_threshold=0.60)
    res = matcher.match(vec_a, enrolled)

    assert res.matched is True
    assert res.student_id == STUDENT_USER_ID_1
    assert res.similarity >= 0.60


def test_6_similarity_below_threshold_not_matched():
    # Orthogonal vectors -> similarity ~ 0.0
    vec_a = [1.0 if i == 0 else 0.0 for i in range(512)]
    vec_b = [1.0 if i == 1 else 0.0 for i in range(512)]

    enrolled = {STUDENT_USER_ID_1: vec_b}
    matcher = FaceMatcher(default_threshold=0.60)
    res = matcher.match(vec_a, enrolled)

    assert res.matched is False
    assert res.student_id is None
    assert res.similarity < 0.60


def test_7_valid_match_open_session_enrollment_creates_attendance():
    # Setup Course, Enrollment, Session, and Face Embedding
    course = AttendanceService.create_course(code="CS501", name="Computer Vision")
    AttendanceService.enroll_student(course_id=course["id"], student_id=STUDENT_USER_ID_1)
    session = AttendanceService.create_session(course_id=course["id"], session_status="open")

    sample_vec = [1.0 / np.sqrt(512)] * 512
    AttendanceService.save_face_embedding(student_id=STUDENT_USER_ID_1, embedding=sample_vec)

    single_face_bytes = create_synthetic_image_bytes(draw_faces=1)

    # Mock embedder output to match enrolled sample_vec
    with patch.object(
        FaceRecognitionService,
        "generate_embedding_from_bytes",
        return_value=FaceEmbedder().encode(np.ones((100, 100, 3), dtype=np.uint8)),
    ):
        with patch.object(
            FaceMatcher,
            "match",
            return_value=pytest.importorskip("app.face.models").MatchResult(
                matched=True, student_id=STUDENT_USER_ID_1, similarity=0.95, threshold=0.60
            ),
        ):
            res = FaceAttendanceService.process_recognition_check_in(
                session_id=session["id"],
                image_bytes=single_face_bytes,
            )

    assert res["matched"] is True
    assert res["student_id"] == STUDENT_USER_ID_1
    assert res["status"] == "present"
    assert "attendance_record_id" in res

    # Verify record in store
    records = AttendanceService.list_records_by_session(session["id"])
    assert len(records) == 1
    assert records[0]["student_id"] == STUDENT_USER_ID_1
    assert records[0]["status"] == "present"
    assert records[0]["recognition_source"] == "face_recognition"


def test_8_valid_match_closed_session_rejected():
    course = AttendanceService.create_course(code="CS502", name="Deep Learning")
    session = AttendanceService.create_session(course_id=course["id"], session_status="closed")
    single_face_bytes = create_synthetic_image_bytes(draw_faces=1)

    with pytest.raises(HTTPException) as exc:
        FaceAttendanceService.process_recognition_check_in(
            session_id=session["id"],
            image_bytes=single_face_bytes,
        )
    assert exc.value.status_code == 400
    assert "closed or cancelled" in exc.value.detail


def test_9_valid_match_student_not_enrolled_rejected():
    course = AttendanceService.create_course(code="CS503", name="AI Ethics")
    # Enroll Student 2 only
    AttendanceService.enroll_student(course_id=course["id"], student_id=STUDENT_USER_ID_2)
    session = AttendanceService.create_session(course_id=course["id"], session_status="open")

    sample_vec = [1.0 / np.sqrt(512)] * 512
    # Save embedding for Student 1 (who is NOT enrolled in CS503)
    AttendanceService.save_face_embedding(student_id=STUDENT_USER_ID_1, embedding=sample_vec)

    single_face_bytes = create_synthetic_image_bytes(draw_faces=1)

    # Process check-in for non-enrolled student's face
    res = FaceAttendanceService.process_recognition_check_in(
        session_id=session["id"],
        image_bytes=single_face_bytes,
    )

    # Because matching only searches enrolled students, non-enrolled face returns matched=False
    assert res["matched"] is False
    assert "attendance_record_id" not in res


def test_10_duplicate_recognition_prevents_duplicate_record():
    course = AttendanceService.create_course(code="CS504", name="Data Mining")
    AttendanceService.enroll_student(course_id=course["id"], student_id=STUDENT_USER_ID_1)
    session = AttendanceService.create_session(course_id=course["id"], session_status="open")

    sample_vec = [1.0 / np.sqrt(512)] * 512
    AttendanceService.save_face_embedding(student_id=STUDENT_USER_ID_1, embedding=sample_vec)

    # First check-in
    AttendanceService.create_record(
        session_id=session["id"],
        student_id=STUDENT_USER_ID_1,
        record_status="present",
        confidence=0.91,
        recognition_source="face_recognition",
    )

    single_face_bytes = create_synthetic_image_bytes(draw_faces=1)

    with patch.object(
        FaceRecognitionService,
        "generate_embedding_from_bytes",
        return_value=FaceEmbedder().encode(np.ones((100, 100, 3), dtype=np.uint8)),
    ):
        with patch.object(
            FaceMatcher,
            "match",
            return_value=pytest.importorskip("app.face.models").MatchResult(
                matched=True, student_id=STUDENT_USER_ID_1, similarity=0.91, threshold=0.60
            ),
        ):
            res = FaceAttendanceService.process_recognition_check_in(
                session_id=session["id"],
                image_bytes=single_face_bytes,
            )

    assert res["matched"] is True
    assert res["status"] == "already_marked"
    # Ensure no second record created
    records = AttendanceService.list_records_by_session(session["id"])
    assert len(records) == 1


def test_11_normal_user_cannot_enroll_face_returns_403():
    app.dependency_overrides[get_current_user] = mock_get_current_user_normal
    app.dependency_overrides[require_admin] = lambda: (_ for _ in ()).throw(
        HTTPException(status_code=403, detail="Forbidden: Admin access required")
    )

    img_bytes = create_synthetic_image_bytes(draw_faces=1)
    resp = client.post(
        "/api/v1/recognition/enroll",
        data={"student_id": STUDENT_USER_ID_1},
        files={"image": ("face.png", img_bytes, "image/png")},
    )

    app.dependency_overrides.clear()
    assert resp.status_code == 403


def test_12_admin_can_enroll_face_success():
    app.dependency_overrides[get_current_user] = mock_get_current_user_admin
    app.dependency_overrides[require_admin] = mock_get_current_user_admin

    img_bytes = create_synthetic_image_bytes(draw_faces=1)

    with patch.object(
        AttendanceService,
        "get_profile_by_id",
        return_value={"id": STUDENT_USER_ID_1, "role": "user"},
    ):
        with patch.object(
            FaceRecognitionService,
            "generate_embedding_from_bytes",
            return_value=pytest.importorskip("app.face.models").FaceEmbeddingResult(
                embedding=[0.1] * 512,
                model_name="ArcFace-buffalo_l",
                model_version="v1.0",
                dimension=512,
            ),
        ):
            resp = client.post(
                "/api/v1/recognition/enroll",
                data={"student_id": STUDENT_USER_ID_1},
                files={"image": ("face.png", img_bytes, "image/png")},
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "enrolled"
    assert data["student_id"] == STUDENT_USER_ID_1
    assert "embedding" not in data  # Biometric privacy check


def test_13_embeddings_never_returned_by_api():
    app.dependency_overrides[get_current_user] = mock_get_current_user_admin
    app.dependency_overrides[require_admin] = mock_get_current_user_admin

    img_bytes = create_synthetic_image_bytes(draw_faces=1)

    with patch.object(
        AttendanceService,
        "get_profile_by_id",
        return_value={"id": STUDENT_USER_ID_1, "role": "user"},
    ):
        with patch.object(
            FaceRecognitionService,
            "generate_embedding_from_bytes",
            return_value=pytest.importorskip("app.face.models").FaceEmbeddingResult(
                embedding=[0.05] * 512,
                model_name="ArcFace-buffalo_l",
                model_version="v1.0",
                dimension=512,
            ),
        ):
            resp = client.post(
                "/api/v1/recognition/enroll",
                data={"student_id": STUDENT_USER_ID_1},
                files={"image": ("face.png", img_bytes, "image/png")},
            )

    app.dependency_overrides.clear()

    json_str = resp.text.lower()
    assert "vector" not in json_str
    assert "embedding" not in json_str


def test_14_unauthenticated_recognition_returns_401():
    course = AttendanceService.create_course(code="CS505", name="Machine Learning")
    session = AttendanceService.create_session(course_id=course["id"], session_status="open")
    img_bytes = create_synthetic_image_bytes(draw_faces=1)

    # Ensure no token overrides
    app.dependency_overrides.clear()
    resp = client.post(
        "/api/v1/recognition/recognize",
        data={"session_id": session["id"]},
        files={"image": ("face.png", img_bytes, "image/png")},
    )

    assert resp.status_code == 401
