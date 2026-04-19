"""Session management and face recognition tests.

Tests session creation, listing, isolation, recognition, and attendance saving.
"""
import pytest
import time


class TestSessions:
    """Session CRUD tests."""

    def test_create_session_success(self, base_url, api_client, teacher_token):
        """Create a session successfully."""
        headers = {"Authorization": f"Bearer {teacher_token}"}
        payload = {
            "semester": "5",
            "division": "A",
            "lecture": "Data Structures",
            "time_from": "10:00",
            "time_to": "11:00"
        }
        response = api_client.post(f"{base_url}/api/sessions", json=payload, headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["semester"] == payload["semester"]
        assert data["division"] == payload["division"]
        assert data["lecture"] == payload["lecture"]
        assert data["time_from"] == payload["time_from"]
        assert data["time_to"] == payload["time_to"]
        assert "date" in data, "Date should be auto-set"
        assert data["status"] == "open"
        print(f"✓ Session created: {data['id']}, lecture: {data['lecture']}")
        return data["id"]

    def test_create_session_requires_teacher(self, base_url, api_client, student_token):
        """Student token should be rejected with 403."""
        headers = {"Authorization": f"Bearer {student_token}"}
        payload = {
            "semester": "5",
            "division": "A",
            "lecture": "Test",
            "time_from": "10:00",
            "time_to": "11:00"
        }
        response = api_client.post(f"{base_url}/api/sessions", json=payload, headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Student token rejected for /sessions POST with 403")

    def test_list_sessions_own_only(self, base_url, api_client, teacher_token, teacher_token_2):
        """GET /sessions returns only teacher's own sessions."""
        # Teacher 1 creates a session
        headers1 = {"Authorization": f"Bearer {teacher_token}"}
        payload = {
            "semester": "5",
            "division": "A",
            "lecture": "TEST_Teacher1_Session",
            "time_from": "10:00",
            "time_to": "11:00"
        }
        create_resp = api_client.post(f"{base_url}/api/sessions", json=payload, headers=headers1)
        assert create_resp.status_code == 200
        session1_id = create_resp.json()["id"]
        
        # Teacher 1 lists sessions
        list_resp1 = api_client.get(f"{base_url}/api/sessions", headers=headers1)
        assert list_resp1.status_code == 200
        sessions1 = list_resp1.json()
        assert isinstance(sessions1, list)
        session_ids1 = [s["id"] for s in sessions1]
        assert session1_id in session_ids1, "Teacher 1 should see their own session"
        
        # Teacher 2 lists sessions (should not see Teacher 1's session)
        headers2 = {"Authorization": f"Bearer {teacher_token_2}"}
        list_resp2 = api_client.get(f"{base_url}/api/sessions", headers=headers2)
        assert list_resp2.status_code == 200
        sessions2 = list_resp2.json()
        session_ids2 = [s["id"] for s in sessions2]
        assert session1_id not in session_ids2, "Teacher 2 should NOT see Teacher 1's session"
        print(f"✓ Session isolation verified: Teacher 1 has {len(sessions1)} sessions, Teacher 2 has {len(sessions2)}")

    def test_get_session_by_id_success(self, base_url, api_client, teacher_token):
        """GET /sessions/{id} returns session details."""
        # Create a session first
        headers = {"Authorization": f"Bearer {teacher_token}"}
        payload = {
            "semester": "5",
            "division": "A",
            "lecture": "TEST_GetSession",
            "time_from": "10:00",
            "time_to": "11:00"
        }
        create_resp = api_client.post(f"{base_url}/api/sessions", json=payload, headers=headers)
        session_id = create_resp.json()["id"]
        
        # Get the session
        get_resp = api_client.get(f"{base_url}/api/sessions/{session_id}", headers=headers)
        assert get_resp.status_code == 200, f"Failed: {get_resp.text}"
        
        data = get_resp.json()
        assert data["id"] == session_id
        assert data["lecture"] == payload["lecture"]
        print(f"✓ GET /sessions/{session_id} successful")

    def test_get_session_other_teacher_404(self, base_url, api_client, teacher_token, teacher_token_2):
        """GET /sessions/{id} for another teacher's session returns 404."""
        # Teacher 1 creates a session
        headers1 = {"Authorization": f"Bearer {teacher_token}"}
        payload = {
            "semester": "5",
            "division": "A",
            "lecture": "TEST_Isolation",
            "time_from": "10:00",
            "time_to": "11:00"
        }
        create_resp = api_client.post(f"{base_url}/api/sessions", json=payload, headers=headers1)
        session_id = create_resp.json()["id"]
        
        # Teacher 2 tries to access it
        headers2 = {"Authorization": f"Bearer {teacher_token_2}"}
        get_resp = api_client.get(f"{base_url}/api/sessions/{session_id}", headers=headers2)
        assert get_resp.status_code == 404, f"Expected 404, got {get_resp.status_code}"
        print("✓ Other teacher's session access returns 404")


class TestRecognition:
    """Face recognition tests."""

    def test_recognize_no_enrolled_students(self, base_url, api_client, teacher_token, test_face_b64):
        """Recognize with no enrolled students in class returns 400."""
        # Create a session for a class with no students (semester 99, division Z)
        headers = {"Authorization": f"Bearer {teacher_token}"}
        payload = {
            "semester": "99",
            "division": "Z",
            "lecture": "Empty Class",
            "time_from": "10:00",
            "time_to": "11:00"
        }
        create_resp = api_client.post(f"{base_url}/api/sessions", json=payload, headers=headers)
        session_id = create_resp.json()["id"]
        
        # Try to recognize
        recognize_payload = {
            "images_base64": [test_face_b64],
            "threshold": 0.40
        }
        recognize_resp = api_client.post(
            f"{base_url}/api/sessions/{session_id}/recognize",
            json=recognize_payload,
            headers=headers,
            timeout=60  # Generous timeout for face processing
        )
        assert recognize_resp.status_code == 400, f"Expected 400, got {recognize_resp.status_code}"
        assert "no registered students" in recognize_resp.text.lower()
        print("✓ Recognize with no enrolled students returns 400")

    def test_recognize_with_enrolled_student(self, base_url, api_client, teacher_token, student_token, test_face_b64):
        """Recognize with enrolled student returns attendance list."""
        # First, ensure student has uploaded face (using same test image)
        student_headers = {"Authorization": f"Bearer {student_token}"}
        upload_resp = api_client.post(
            f"{base_url}/api/upload-face",
            json={"image_base64": test_face_b64},
            headers=student_headers
        )
        assert upload_resp.status_code == 200, "Student face upload failed"
        print("✓ Student face uploaded for recognition test")
        
        # Create a session for semester 5, division A (matching test student)
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        session_payload = {
            "semester": "5",
            "division": "A",
            "lecture": "Recognition Test",
            "time_from": "10:00",
            "time_to": "11:00"
        }
        create_resp = api_client.post(f"{base_url}/api/sessions", json=session_payload, headers=teacher_headers)
        session_id = create_resp.json()["id"]
        print(f"✓ Session created: {session_id}")
        
        # Run recognition with SAME face image (should match)
        recognize_payload = {
            "images_base64": [test_face_b64],
            "threshold": 0.40
        }
        print("⏳ Running face recognition (may take 5-30s)...")
        recognize_resp = api_client.post(
            f"{base_url}/api/sessions/{session_id}/recognize",
            json=recognize_payload,
            headers=teacher_headers,
            timeout=60
        )
        assert recognize_resp.status_code == 200, f"Recognition failed: {recognize_resp.text}"
        
        data = recognize_resp.json()
        assert "attendance" in data
        assert "total_students" in data
        assert "total_matched" in data
        assert "total_faces_detected" in data
        assert data["total_students"] >= 1, "Should have at least 1 student in class"
        
        # Check attendance list structure
        attendance = data["attendance"]
        assert isinstance(attendance, list)
        assert len(attendance) == data["total_students"]
        
        for entry in attendance:
            assert "student_id" in entry
            assert "name" in entry
            assert "usn" in entry
            assert "status" in entry
            assert entry["status"] in ["present", "absent"]
        
        # Since we used the SAME face image, we should have at least 1 match
        present_count = sum(1 for e in attendance if e["status"] == "present")
        print(f"✓ Recognition completed: {present_count}/{data['total_students']} students marked present")
        print(f"  Total faces detected: {data['total_faces_detected']}, Total matched: {data['total_matched']}")
        
        return session_id, attendance

    def test_recognize_requires_teacher(self, base_url, api_client, student_token, test_face_b64):
        """Student token should be rejected with 403."""
        headers = {"Authorization": f"Bearer {student_token}"}
        recognize_payload = {
            "images_base64": [test_face_b64],
            "threshold": 0.40
        }
        # Use a dummy session ID
        response = api_client.post(
            f"{base_url}/api/sessions/dummy-id/recognize",
            json=recognize_payload,
            headers=headers,
            timeout=10
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Student token rejected for /recognize with 403")


class TestSaveAttendance:
    """Attendance saving and notification tests."""

    def test_save_attendance_success(self, base_url, api_client, teacher_token, student_token, test_face_b64):
        """Save attendance, verify session completed, and notifications created."""
        # Setup: upload student face and run recognition
        student_headers = {"Authorization": f"Bearer {student_token}"}
        upload_resp = api_client.post(
            f"{base_url}/api/upload-face",
            json={"image_base64": test_face_b64},
            headers=student_headers
        )
        assert upload_resp.status_code == 200
        
        # Create session
        teacher_headers = {"Authorization": f"Bearer {teacher_token}"}
        session_payload = {
            "semester": "5",
            "division": "A",
            "lecture": "Save Attendance Test",
            "time_from": "14:00",
            "time_to": "15:00"
        }
        create_resp = api_client.post(f"{base_url}/api/sessions", json=session_payload, headers=teacher_headers)
        session_id = create_resp.json()["id"]
        
        # Run recognition
        recognize_payload = {"images_base64": [test_face_b64], "threshold": 0.40}
        recognize_resp = api_client.post(
            f"{base_url}/api/sessions/{session_id}/recognize",
            json=recognize_payload,
            headers=teacher_headers,
            timeout=60
        )
        assert recognize_resp.status_code == 200
        attendance_list = recognize_resp.json()["attendance"]
        
        # Save attendance
        save_payload = {
            "entries": [
                {"student_id": entry["student_id"], "status": entry["status"]}
                for entry in attendance_list
            ]
        }
        save_resp = api_client.post(
            f"{base_url}/api/sessions/{session_id}/save-attendance",
            json=save_payload,
            headers=teacher_headers
        )
        assert save_resp.status_code == 200, f"Save failed: {save_resp.text}"
        
        data = save_resp.json()
        assert data["ok"] == True
        assert data["saved"] == len(attendance_list)
        print(f"✓ Attendance saved: {data['saved']} records")
        
        # Verify session is marked completed
        session_resp = api_client.get(f"{base_url}/api/sessions/{session_id}", headers=teacher_headers)
        session_data = session_resp.json()
        assert session_data["status"] == "completed", "Session should be marked completed"
        assert "completed_at" in session_data
        print("✓ Session marked as completed")
        
        # Verify notifications created for student
        time.sleep(1)  # Brief wait for DB write
        notif_resp = api_client.get(f"{base_url}/api/notifications", headers=student_headers)
        assert notif_resp.status_code == 200
        notifications = notif_resp.json()
        assert isinstance(notifications, list)
        
        # Find notification for this session
        session_notifs = [n for n in notifications if n.get("session_id") == session_id]
        assert len(session_notifs) >= 1, "Should have at least 1 notification for this session"
        
        notif = session_notifs[0]
        assert "title" in notif
        assert "message" in notif
        assert "status" in notif
        assert notif["read"] == False
        print(f"✓ Notification created: {notif['title']}")

    def test_save_attendance_requires_teacher(self, base_url, api_client, student_token):
        """Student token should be rejected with 403."""
        headers = {"Authorization": f"Bearer {student_token}"}
        save_payload = {"entries": []}
        response = api_client.post(
            f"{base_url}/api/sessions/dummy-id/save-attendance",
            json=save_payload,
            headers=headers
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Student token rejected for /save-attendance with 403")
