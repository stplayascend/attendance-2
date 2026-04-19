"""Face upload and recognition tests.

Tests student face upload, no-face rejection, embeddings count, and role guards.
"""
import pytest
import base64


class TestFaceUpload:
    """Student face upload tests."""

    def test_upload_face_success(self, base_url, api_client, student_token, test_face_b64):
        """Upload a real face image successfully."""
        headers = {"Authorization": f"Bearer {student_token}"}
        payload = {"image_base64": test_face_b64}
        
        response = api_client.post(f"{base_url}/api/upload-face", json=payload, headers=headers)
        assert response.status_code == 200, f"Upload failed: {response.text}"
        
        data = response.json()
        assert data["ok"] == True
        assert "embeddings_count" in data
        assert data["embeddings_count"] >= 1
        print(f"✓ Face uploaded successfully, embeddings_count: {data['embeddings_count']}")

    def test_upload_face_increment_count(self, base_url, api_client, student_token, test_face_b64):
        """Upload same face again, embeddings_count should increment."""
        headers = {"Authorization": f"Bearer {student_token}"}
        payload = {"image_base64": test_face_b64}
        
        # First upload
        response1 = api_client.post(f"{base_url}/api/upload-face", json=payload, headers=headers)
        assert response1.status_code == 200
        count1 = response1.json()["embeddings_count"]
        
        # Second upload
        response2 = api_client.post(f"{base_url}/api/upload-face", json=payload, headers=headers)
        assert response2.status_code == 200
        count2 = response2.json()["embeddings_count"]
        
        assert count2 > count1, f"Count should increment: {count1} -> {count2}"
        print(f"✓ Embeddings count incremented: {count1} -> {count2}")

    def test_upload_face_no_face_detected(self, base_url, api_client, student_token):
        """Upload image with no face should return 400."""
        headers = {"Authorization": f"Bearer {student_token}"}
        # Create a solid color image (no face)
        from PIL import Image
        import io
        img = Image.new('RGB', (100, 100), color='blue')
        buf = io.BytesIO()
        img.save(buf, format='JPEG')
        no_face_b64 = base64.b64encode(buf.getvalue()).decode()
        
        payload = {"image_base64": no_face_b64}
        response = api_client.post(f"{base_url}/api/upload-face", json=payload, headers=headers)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "no face" in response.text.lower() or "invalid" in response.text.lower()
        print("✓ No-face image rejected with 400")

    def test_upload_face_requires_student_token(self, base_url, api_client, teacher_token, test_face_b64):
        """Teacher token should be rejected with 403."""
        headers = {"Authorization": f"Bearer {teacher_token}"}
        payload = {"image_base64": test_face_b64}
        
        response = api_client.post(f"{base_url}/api/upload-face", json=payload, headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Teacher token rejected for /upload-face with 403")

    def test_upload_face_no_token(self, base_url, api_client, test_face_b64):
        """No token should return 401."""
        payload = {"image_base64": test_face_b64}
        response = api_client.post(f"{base_url}/api/upload-face", json=payload)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ /upload-face without token rejected with 401")


class TestStudentMe:
    """Test /students/me endpoint."""

    def test_student_me_success(self, base_url, api_client, student_token):
        """GET /students/me returns student data without embeddings."""
        headers = {"Authorization": f"Bearer {student_token}"}
        response = api_client.get(f"{base_url}/api/students/me", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "usn" in data
        assert "name" in data
        assert "embeddings" not in data, "Embeddings should be excluded"
        assert "password_hash" not in data, "Password hash should be excluded"
        print(f"✓ /students/me returned: {data['usn']}")

    def test_student_me_requires_student_token(self, base_url, api_client, teacher_token):
        """Teacher token should be rejected with 403."""
        headers = {"Authorization": f"Bearer {teacher_token}"}
        response = api_client.get(f"{base_url}/api/students/me", headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Teacher token rejected for /students/me with 403")
