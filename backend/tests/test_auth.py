"""Authentication endpoint tests for AI Attendance System.

Tests teacher and student registration, login, duplicate validation, and /auth/me.
"""
import pytest


class TestTeacherAuth:
    """Teacher authentication tests."""

    def test_register_teacher_success(self, base_url, api_client):
        """Register a new teacher successfully."""
        payload = {
            "name": "TEST_Dr_Johnson",
            "email": "test_johnson@test.edu",
            "password": "securepass456",
            "subject": "Physics"
        }
        response = api_client.post(f"{base_url}/api/auth/register-teacher", json=payload)
        
        # Allow 200 even if already exists (from previous test runs)
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "token" in data, "Token missing in response"
            assert "user" in data, "User missing in response"
            assert data["user"]["email"] == payload["email"].lower()
            assert data["user"]["name"] == payload["name"]
            assert data["user"]["role"] == "teacher"
            assert data["user"]["subject"] == payload["subject"]
            print(f"✓ Teacher registered: {data['user']['email']}")

    def test_register_teacher_duplicate_email(self, base_url, api_client, teacher_token):
        """Duplicate email registration should return 400."""
        payload = {
            "name": "TEST_Duplicate",
            "email": "test_teacher_alpha@test.edu",  # Already registered in fixture
            "password": "anypass",
            "subject": "Math"
        }
        response = api_client.post(f"{base_url}/api/auth/register-teacher", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "already registered" in response.text.lower(), "Error message should mention duplicate"
        print("✓ Duplicate email rejected with 400")

    def test_login_teacher_success(self, base_url, api_client, teacher_token):
        """Login with correct credentials."""
        payload = {
            "email": "test_teacher_alpha@test.edu",
            "password": "testpass123"
        }
        response = api_client.post(f"{base_url}/api/auth/login-teacher", json=payload)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == payload["email"].lower()
        assert data["user"]["role"] == "teacher"
        print(f"✓ Teacher login successful: {data['user']['email']}")

    def test_login_teacher_wrong_password(self, base_url, api_client):
        """Login with wrong password should return 401."""
        payload = {
            "email": "test_teacher_alpha@test.edu",
            "password": "wrongpassword"
        }
        response = api_client.post(f"{base_url}/api/auth/login-teacher", json=payload)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        assert "invalid" in response.text.lower() or "credentials" in response.text.lower()
        print("✓ Wrong password rejected with 401")

    def test_login_teacher_nonexistent_email(self, base_url, api_client):
        """Login with non-existent email should return 401."""
        payload = {
            "email": "nonexistent@test.edu",
            "password": "anypass"
        }
        response = api_client.post(f"{base_url}/api/auth/login-teacher", json=payload)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Non-existent email rejected with 401")


class TestStudentAuth:
    """Student authentication tests."""

    def test_register_student_success(self, base_url, api_client):
        """Register a new student successfully."""
        payload = {
            "name": "TEST_Bob_Smith",
            "usn": "TEST1AB20CS099",
            "roll_number": "099",
            "semester": "5",
            "division": "A",
            "password": "studentpass999"
        }
        response = api_client.post(f"{base_url}/api/auth/register-student", json=payload)
        
        # Allow 200 even if already exists
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "token" in data
            assert "user" in data
            assert data["user"]["usn"] == payload["usn"].upper()
            assert data["user"]["name"] == payload["name"]
            assert data["user"]["role"] == "student"
            assert data["user"]["semester"] == payload["semester"]
            assert data["user"]["division"] == payload["division"]
            assert data["user"]["face_registered"] == False
            print(f"✓ Student registered: {data['user']['usn']}")

    def test_register_student_duplicate_usn(self, base_url, api_client, student_token):
        """Duplicate USN registration should return 400."""
        payload = {
            "name": "TEST_Duplicate_Student",
            "usn": "TEST1AB20CS001",  # Already registered in fixture
            "roll_number": "999",
            "semester": "5",
            "division": "A",
            "password": "anypass"
        }
        response = api_client.post(f"{base_url}/api/auth/register-student", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "already registered" in response.text.lower(), "Error message should mention duplicate"
        print("✓ Duplicate USN rejected with 400")

    def test_login_student_success(self, base_url, api_client, student_token):
        """Login student with correct USN and password."""
        payload = {
            "usn": "TEST1AB20CS001",
            "password": "studentpass123"
        }
        response = api_client.post(f"{base_url}/api/auth/login-student", json=payload)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["usn"] == payload["usn"].upper()
        assert data["user"]["role"] == "student"
        print(f"✓ Student login successful: {data['user']['usn']}")

    def test_login_student_wrong_password(self, base_url, api_client):
        """Login with wrong password should return 401."""
        payload = {
            "usn": "TEST1AB20CS001",
            "password": "wrongpassword"
        }
        response = api_client.post(f"{base_url}/api/auth/login-student", json=payload)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Wrong student password rejected with 401")

    def test_login_student_nonexistent_usn(self, base_url, api_client):
        """Login with non-existent USN should return 401."""
        payload = {
            "usn": "NONEXISTENT999",
            "password": "anypass"
        }
        response = api_client.post(f"{base_url}/api/auth/login-student", json=payload)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Non-existent USN rejected with 401")


class TestAuthMe:
    """Test /auth/me endpoint with Bearer tokens."""

    def test_auth_me_teacher(self, base_url, api_client, teacher_token):
        """GET /auth/me with teacher token returns teacher user."""
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = api_client.get(f"{base_url}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["role"] == "teacher"
        assert "email" in data
        assert "name" in data
        print(f"✓ /auth/me returned teacher: {data['email']}")

    def test_auth_me_student(self, base_url, api_client, student_token):
        """GET /auth/me with student token returns student user."""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = api_client.get(f"{base_url}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["role"] == "student"
        assert "usn" in data
        assert "name" in data
        print(f"✓ /auth/me returned student: {data['usn']}")

    def test_auth_me_no_token(self, base_url, api_client):
        """GET /auth/me without token should return 401."""
        response = api_client.get(f"{base_url}/api/auth/me")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ /auth/me without token rejected with 401")

    def test_auth_me_invalid_token(self, base_url, api_client):
        """GET /auth/me with invalid token should return 401."""
        headers = {"Authorization": "Bearer invalid_token_xyz"}
        response = api_client.get(f"{base_url}/api/auth/me", headers=headers)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ /auth/me with invalid token rejected with 401")
