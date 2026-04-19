"""Shared pytest fixtures for AI Attendance System backend tests."""
import os
import base64
import pytest
import requests


@pytest.fixture(scope="session")
def base_url():
    """Get base URL from environment."""
    url = os.environ.get("EXPO_BACKEND_URL")
    if not url:
        pytest.fail("EXPO_BACKEND_URL not set in environment")
    return url.rstrip("/")


@pytest.fixture(scope="session")
def api_client():
    """Shared requests session."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def test_face_b64():
    """Load test face image as base64."""
    with open("/tmp/test_face.jpg", "rb") as f:
        return base64.b64encode(f.read()).decode()


@pytest.fixture(scope="session")
def teacher_token(base_url, api_client):
    """Register a test teacher and return token."""
    payload = {
        "name": "TEST_Teacher_Alpha",
        "email": "test_teacher_alpha@test.edu",
        "password": "testpass123",
        "subject": "Computer Science"
    }
    response = api_client.post(f"{base_url}/api/auth/register-teacher", json=payload)
    if response.status_code == 400 and "already registered" in response.text.lower():
        # Already exists, login instead
        login_payload = {"email": payload["email"], "password": payload["password"]}
        response = api_client.post(f"{base_url}/api/auth/login-teacher", json=login_payload)
    
    assert response.status_code == 200, f"Teacher auth failed: {response.text}"
    data = response.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="session")
def teacher_token_2(base_url, api_client):
    """Register a second test teacher for isolation tests."""
    payload = {
        "name": "TEST_Teacher_Beta",
        "email": "test_teacher_beta@test.edu",
        "password": "testpass456",
        "subject": "Mathematics"
    }
    response = api_client.post(f"{base_url}/api/auth/register-teacher", json=payload)
    if response.status_code == 400 and "already registered" in response.text.lower():
        login_payload = {"email": payload["email"], "password": payload["password"]}
        response = api_client.post(f"{base_url}/api/auth/login-teacher", json=login_payload)
    
    assert response.status_code == 200, f"Teacher2 auth failed: {response.text}"
    data = response.json()
    return data["token"]


@pytest.fixture(scope="session")
def student_token(base_url, api_client):
    """Register a test student and return token."""
    payload = {
        "name": "TEST_Student_Alice",
        "usn": "TEST1AB20CS001",
        "roll_number": "001",
        "semester": "5",
        "division": "A",
        "password": "studentpass123"
    }
    response = api_client.post(f"{base_url}/api/auth/register-student", json=payload)
    if response.status_code == 400 and "already registered" in response.text.lower():
        login_payload = {"usn": payload["usn"], "password": payload["password"]}
        response = api_client.post(f"{base_url}/api/auth/login-student", json=login_payload)
    
    assert response.status_code == 200, f"Student auth failed: {response.text}"
    data = response.json()
    assert "token" in data
    return data["token"]
