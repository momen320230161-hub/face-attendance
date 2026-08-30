import uuid
from unittest.mock import patch
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import UserProfile, get_current_user
from app.main import app
from app.services.attendance_service import AttendanceService, _in_mem_store

client = TestClient(app)

# Dummy test user profiles
USER_ID_1 = str(uuid.uuid4())
USER_ID_2 = str(uuid.uuid4())
ADMIN_ID = str(uuid.uuid4())

normal_user_1 = UserProfile(user_id=USER_ID_1, email="user1@example.com", role="user", full_name="Student One")
normal_user_2 = UserProfile(user_id=USER_ID_2, email="user2@example.com", role="user", full_name="Student Two")
admin_user = UserProfile(user_id=ADMIN_ID, email="admin@example.com", role="admin", full_name="Admin User")


@pytest.fixture(autouse=True)
def reset_stores():
    _in_mem_store.reset()
    # Add dummy profiles into in-mem store
    _in_mem_store.courses.clear()
    _in_mem_store.enrollments.clear()
    _in_mem_store.sessions.clear()
    _in_mem_store.records.clear()


# =====================================================================
# AUTH TESTS (1 - 4)
# =====================================================================


def test_1_no_token_returns_401():
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_2_invalid_token_returns_401():
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid_token_123"})
    assert response.status_code == 401


def test_3_normal_user_authenticated_successfully():
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == USER_ID_1
        assert data["role"] == "user"
    finally:
        app.dependency_overrides.clear()


def test_4_admin_user_authenticated_successfully():
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == ADMIN_ID
        assert data["role"] == "admin"
    finally:
        app.dependency_overrides.clear()


# =====================================================================
# COURSES TESTS (5 - 7)
# =====================================================================


def test_5_admin_can_create_course():
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        payload = {"code": "CS101", "name": "Introduction to CS", "description": "Basics of Programming"}
        response = client.post("/api/v1/courses", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["code"] == "CS101"
        assert data["name"] == "Introduction to CS"
        assert "id" in data
    finally:
        app.dependency_overrides.clear()


def test_6_normal_user_cannot_create_course_returns_403():
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        payload = {"code": "CS102", "name": "Data Structures", "description": "Arrays and Trees"}
        response = client.post("/api/v1/courses", json=payload)
        assert response.status_code == 403
        assert "Admin authorization required" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_7_authenticated_user_can_retrieve_allowed_courses():
    # Admin creates 2 courses
    course1 = AttendanceService.create_course("MATH101", "Calculus I", created_by=ADMIN_ID)
    course2 = AttendanceService.create_course("PHYS101", "Physics I", created_by=ADMIN_ID)

    # Enroll normal_user_1 in course1 only
    # Mock profile lookup for enrollment
    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.enroll_student(course1["id"], USER_ID_1)

    # 1. Normal user sees only enrolled course (MATH101)
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        res = client.get("/api/v1/courses")
        assert res.status_code == 200
        codes = [c["code"] for c in res.json()]
        assert "MATH101" in codes
        assert "PHYS101" not in codes
    finally:
        app.dependency_overrides.clear()

    # 2. Admin sees all courses
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        res = client.get("/api/v1/courses")
        assert res.status_code == 200
        codes = [c["code"] for c in res.json()]
        assert "MATH101" in codes
        assert "PHYS101" in codes
    finally:
        app.dependency_overrides.clear()


# =====================================================================
# ENROLLMENT TESTS (8 - 10)
# =====================================================================


def test_8_admin_can_enroll_student():
    course = AttendanceService.create_course("ENG101", "English Literature")
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
            res = client.post(f"/api/v1/courses/{course['id']}/enrollments", json={"student_id": USER_ID_1})
            assert res.status_code == 201
            data = res.json()
            assert data["course_id"] == course["id"]
            assert data["student_id"] == USER_ID_1
    finally:
        app.dependency_overrides.clear()


def test_9_duplicate_enrollment_returns_409():
    course = AttendanceService.create_course("ENG102", "Advanced Composition")
    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.enroll_student(course["id"], USER_ID_1)

        app.dependency_overrides[get_current_user] = lambda: admin_user
        try:
            res = client.post(f"/api/v1/courses/{course['id']}/enrollments", json={"student_id": USER_ID_1})
            assert res.status_code == 409
            assert "already enrolled" in res.json()["detail"]
        finally:
            app.dependency_overrides.clear()


def test_10_normal_user_cannot_modify_enrollment_returns_403():
    course = AttendanceService.create_course("CHEM101", "Chemistry I")
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        # POST enrollment
        res = client.post(f"/api/v1/courses/{course['id']}/enrollments", json={"student_id": USER_ID_1})
        assert res.status_code == 403

        # DELETE enrollment
        res_del = client.delete(f"/api/v1/courses/{course['id']}/enrollments/{USER_ID_1}")
        assert res_del.status_code == 403
    finally:
        app.dependency_overrides.clear()


# =====================================================================
# SESSION TESTS (11 - 13)
# =====================================================================


def test_11_admin_can_create_attendance_session():
    course = AttendanceService.create_course("BIO101", "Biology I")
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        payload = {"course_id": course["id"], "status": "open"}
        res = client.post("/api/v1/attendance/sessions", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["course_id"] == course["id"]
        assert data["status"] == "open"
    finally:
        app.dependency_overrides.clear()


def test_12_normal_user_cannot_create_session_returns_403():
    course = AttendanceService.create_course("BIO102", "Genetics")
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        payload = {"course_id": course["id"], "status": "open"}
        res = client.post("/api/v1/attendance/sessions", json=payload)
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_13_admin_can_close_session():
    course = AttendanceService.create_course("BIO103", "Microbiology")
    sess = AttendanceService.create_session(course["id"], session_status="open")

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        res = client.post(f"/api/v1/attendance/sessions/{sess['id']}/close")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "closed"
        assert data["ended_at"] is not None
    finally:
        app.dependency_overrides.clear()


# =====================================================================
# ATTENDANCE RECORD TESTS (14 - 17)
# =====================================================================


def test_14_student_can_retrieve_own_attendance():
    course = AttendanceService.create_course("CS201", "Algorithms")
    sess = AttendanceService.create_session(course["id"])
    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.enroll_student(course["id"], USER_ID_1)
        rec = AttendanceService.create_record(
            session_id=sess["id"],
            student_id=USER_ID_1,
            record_status="present",
            confidence=0.95,
            recognition_source="face_recognition",
        )

    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        res = client.get("/api/v1/attendance/my-records")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["id"] == rec["id"]
        assert data[0]["student_id"] == USER_ID_1
    finally:
        app.dependency_overrides.clear()


def test_15_student_cannot_modify_attendance():
    # Verify no POST/PATCH endpoints for students to create/modify attendance records directly
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        dummy_session_id = str(uuid.uuid4())
        # Attempting POST to my-records returns 405 Method Not Allowed
        res_post = client.post("/api/v1/attendance/my-records", json={"status": "present"})
        assert res_post.status_code == 405

        # Attempting POST to session records returns 405 Method Not Allowed
        res_sess_post = client.post(f"/api/v1/attendance/sessions/{dummy_session_id}/records", json={"student_id": USER_ID_1})
        assert res_sess_post.status_code == 405
    finally:
        app.dependency_overrides.clear()


def test_16_student_cannot_access_another_students_session_records():
    course = AttendanceService.create_course("CS202", "OS")
    sess = AttendanceService.create_session(course["id"])

    # Attempting to fetch session records as a normal user returns 403
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        res = client.get(f"/api/v1/attendance/sessions/{sess['id']}/records")
        assert res.status_code == 403
        assert "Admin authorization required" in res.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_17_duplicate_attendance_record_returns_409():
    course = AttendanceService.create_course("CS203", "Networks")
    sess = AttendanceService.create_session(course["id"])
    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.create_record(session_id=sess["id"], student_id=USER_ID_1, record_status="present")

        # Second record for same (session_id, student_id) throws 409
        with pytest.raises(HTTPException) as exc_info:
            AttendanceService.create_record(session_id=sess["id"], student_id=USER_ID_1, record_status="present")
        assert exc_info.value.status_code == 409
        assert "already exists" in exc_info.value.detail


# =====================================================================
# RLS / SECURITY TESTS (18)
# =====================================================================


def test_18_student_cannot_access_unauthorized_course_students_or_sessions():
    course1 = AttendanceService.create_course("HIST101", "World History")
    course2 = AttendanceService.create_course("HIST102", "Modern History")

    # Enroll user1 in course1 only
    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.enroll_student(course1["id"], USER_ID_1)

    sess2 = AttendanceService.create_session(course2["id"])

    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        # 1. Accessing students list for course2 (not enrolled) -> 403
        res_stu = client.get(f"/api/v1/courses/{course2['id']}/students")
        assert res_stu.status_code == 403
        assert "not enrolled" in res_stu.json()["detail"]

        # 2. Accessing course2 details -> 403
        res_c2 = client.get(f"/api/v1/courses/{course2['id']}")
        assert res_c2.status_code == 403

        # 3. Accessing session details for course2 -> 403
        res_s2 = client.get(f"/api/v1/attendance/sessions/{sess2['id']}")
        assert res_s2.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_19_admin_list_students_endpoint():
    # 1. No token -> 401
    res_no_auth = client.get("/api/v1/admin/students")
    assert res_no_auth.status_code == 401

    # 2. Normal user -> 403
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        res_user = client.get("/api/v1/admin/students")
        assert res_user.status_code == 403
    finally:
        app.dependency_overrides.clear()

    # 3. Admin user -> 200
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        with patch.object(AttendanceService, "list_all_students", return_value=[
            {"id": USER_ID_1, "full_name": "Student One", "role": "user", "email": "user1@example.com"}
        ]):
            res_admin = client.get("/api/v1/admin/students")
            assert res_admin.status_code == 200
            data = res_admin.json()
            assert len(data) == 1
            assert data[0]["id"] == USER_ID_1
            assert data[0]["role"] == "user"
    finally:
        app.dependency_overrides.clear()

