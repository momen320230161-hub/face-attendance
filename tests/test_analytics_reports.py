"""
Test suite for Phase 10 - Attendance Analytics, Student Dashboard & Reporting
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth import UserProfile, get_current_user
from app.main import app
from app.services.attendance_service import AttendanceService, _in_mem_store

client = TestClient(app)

USER_ID_1 = str(uuid.uuid4())
USER_ID_2 = str(uuid.uuid4())
ADMIN_ID = str(uuid.uuid4())

normal_user_1 = UserProfile(user_id=USER_ID_1, email="user1@example.com", role="user", full_name="Student One")
normal_user_2 = UserProfile(user_id=USER_ID_2, email="user2@example.com", role="user", full_name="Student Two")
admin_user = UserProfile(user_id=ADMIN_ID, email="admin@example.com", role="admin", full_name="Admin User")


@pytest.fixture(autouse=True)
def reset_stores():
    _in_mem_store.reset()


def test_1_admin_analytics_summary_success():
    course = AttendanceService.create_course("CS101", "Computer Science I")
    sess = AttendanceService.create_session(course["id"], session_status="open")

    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.enroll_student(course["id"], USER_ID_1)
        AttendanceService.create_record(
            session_id=sess["id"],
            student_id=USER_ID_1,
            record_status="present",
            confidence=0.92,
            recognition_source="face_recognition",
        )

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        response = client.get("/api/v1/reports/analytics/summary")
        assert response.status_code == 200
        data = response.json()
        assert data["total_courses"] >= 1
        assert data["total_sessions"] >= 1
        assert data["total_records"] >= 1
        assert data["present_count"] >= 1
        assert data["face_recognition_count"] >= 1
        assert data["average_similarity"] == 0.92
    finally:
        app.dependency_overrides.clear()


def test_2_normal_user_analytics_returns_403():
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        res_summary = client.get("/api/v1/reports/analytics/summary")
        assert res_summary.status_code == 403

        res_report = client.get("/api/v1/reports/attendance")
        assert res_report.status_code == 403

        res_csv = client.get("/api/v1/reports/attendance.csv")
        assert res_csv.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_3_student_sees_own_attendance():
    course = AttendanceService.create_course("MATH101", "Calculus I")
    sess = AttendanceService.create_session(course["id"])
    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.enroll_student(course["id"], USER_ID_1)
        rec = AttendanceService.create_record(
            session_id=sess["id"],
            student_id=USER_ID_1,
            record_status="present",
            confidence=0.88,
            recognition_source="face_recognition",
        )

    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        response = client.get("/api/v1/attendance/my-records")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == rec["id"]
        assert data[0]["student_id"] == USER_ID_1
    finally:
        app.dependency_overrides.clear()


def test_4_student_cannot_see_another_students_attendance():
    course = AttendanceService.create_course("PHYS101", "Physics I")
    sess = AttendanceService.create_session(course["id"])

    # Normal user attempt to fetch session records for all students -> 403
    app.dependency_overrides[get_current_user] = lambda: normal_user_1
    try:
        response = client.get(f"/api/v1/attendance/sessions/{sess['id']}/records")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_5_course_filtering():
    c1 = AttendanceService.create_course("ENG101", "English")
    c2 = AttendanceService.create_course("ENG102", "Literature")
    s1 = AttendanceService.create_session(c1["id"])
    s2 = AttendanceService.create_session(c2["id"])

    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.create_record(s1["id"], USER_ID_1, "present")
        AttendanceService.create_record(s2["id"], USER_ID_1, "late")

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        res = client.get(f"/api/v1/reports/attendance?course_id={c1['id']}")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["course_code"] == "ENG101"
    finally:
        app.dependency_overrides.clear()


def test_6_date_filtering():
    c = AttendanceService.create_course("HIST101", "History")
    s = AttendanceService.create_session(c["id"])

    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.create_record(s["id"], USER_ID_1, "present")

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        res = client.get(f"/api/v1/reports/attendance?start_date={now_iso}")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_7_status_filtering():
    c = AttendanceService.create_course("BIO101", "Biology")
    s = AttendanceService.create_session(c["id"])

    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.create_record(s["id"], USER_ID_1, "present")

    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_2, "full_name": "Student Two", "role": "user"}):
        AttendanceService.create_record(s["id"], USER_ID_2, "late")

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        res_present = client.get("/api/v1/reports/attendance?status=present")
        assert res_present.status_code == 200
        data_present = res_present.json()
        assert all(r["status"] == "present" for r in data_present)
    finally:
        app.dependency_overrides.clear()


def test_8_attendance_rate_calculation():
    c = AttendanceService.create_course("ART101", "Art History")
    s1 = AttendanceService.create_session(c["id"])
    s2 = AttendanceService.create_session(c["id"])

    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.enroll_student(c["id"], USER_ID_1)
        AttendanceService.create_record(s1["id"], USER_ID_1, "present")
        AttendanceService.create_record(s2["id"], USER_ID_1, "late")

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        res = client.get(f"/api/v1/reports/analytics/summary?course_id={c['id']}")
        assert res.status_code == 200
        data = res.json()
        # 1 student * 2 sessions = 2 expected. Present (1) + Late (1) = 2. Rate = 100.0%
        assert data["attendance_rate"] == 100.0
    finally:
        app.dependency_overrides.clear()


def test_9_csv_generation():
    c = AttendanceService.create_course("MUSIC101", "Music Theory")
    s = AttendanceService.create_session(c["id"])

    with patch.object(AttendanceService, "get_profile_by_id", return_value={"id": USER_ID_1, "full_name": "Student One", "role": "user"}):
        AttendanceService.create_record(s["id"], USER_ID_1, "present", confidence=0.95, recognition_source="face_recognition")

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        response = client.get("/api/v1/reports/attendance.csv")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
        assert "Student ID,Student Name,Email" in response.text
        assert "MUSIC101" in response.text
        assert "0.9500" in response.text
    finally:
        app.dependency_overrides.clear()


def test_10_empty_dataset_behavior():
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        res_summary = client.get("/api/v1/reports/analytics/summary")
        assert res_summary.status_code == 200
        data = res_summary.json()
        assert data["total_records"] == 0
        assert data["attendance_rate"] == 0.0

        res_report = client.get("/api/v1/reports/attendance")
        assert res_report.status_code == 200
        assert res_report.json() == []

        res_csv = client.get("/api/v1/reports/attendance.csv")
        assert res_csv.status_code == 200
        assert "Student ID,Student Name" in res_csv.text
    finally:
        app.dependency_overrides.clear()
