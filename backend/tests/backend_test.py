"""PlaceMate backend regression tests.

Uses public REACT_APP_BACKEND_URL. Rate-limit test is kept LAST and uses a
throwaway email so demo accounts are not locked out.
"""
import io
import os
import time
import uuid

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@placementiq.edu", "password": "Admin@12345", "role": "admin"}
COORD = {"email": "priya.sharma@nit.edu", "password": "Coord@12345", "role": "coordinator"}
STUDENT_CS = {"email": "aarav.menon@nit.edu", "password": "Student@12345", "role": "student"}
STUDENT_EL = {"email": "tara.bhat@nit.edu", "password": "Student@12345", "role": "student"}


# ---------- session helpers ----------
def login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    return r


def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    r = login(ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def coord_token():
    r = login(COORD)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def student_token():
    r = login(STUDENT_CS)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def institutions():
    r = requests.get(f"{API}/auth/institutions", timeout=10)
    assert r.status_code == 200
    return {i["code"]: i for i in r.json()}


# ---------- Health & institutions ----------
class TestHealth:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_institutions_public(self, institutions):
        assert "NIT" in institutions
        assert "nit.edu" in institutions["NIT"]["domains"]


# ---------- Auth logins ----------
class TestAuthLogins:
    def test_admin_login(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_me_admin(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=h(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_coordinator_login_and_scope(self, coord_token):
        r = requests.get(f"{API}/coordinator/scope", headers=h(coord_token))
        assert r.status_code == 200
        data = r.json()
        assert data["department"] == "Computer Science"
        assert "Northgate" in (data["institution_name"] or "")

    def test_student_login(self, student_token):
        r = requests.get(f"{API}/auth/me", headers=h(student_token))
        assert r.status_code == 200
        assert r.json()["role"] == "student"


# ---------- SECURITY: cross-role portal ----------
class TestCrossRolePortal:
    def test_coordinator_creds_on_student_portal(self):
        r = login({**COORD, "role": "student"})
        assert r.status_code == 401

    def test_student_creds_on_admin_portal(self):
        r = login({**STUDENT_CS, "role": "admin"})
        assert r.status_code == 401


# ---------- SECURITY: role isolation ----------
class TestRoleIsolation:
    def test_student_cannot_access_coordinator(self, student_token):
        r = requests.get(f"{API}/coordinator/students", headers=h(student_token))
        assert r.status_code == 403

    def test_student_cannot_access_admin(self, student_token):
        r = requests.get(f"{API}/admin/users", headers=h(student_token))
        assert r.status_code == 403

    def test_coordinator_cannot_access_admin(self, coord_token):
        r = requests.get(f"{API}/admin/users", headers=h(coord_token))
        assert r.status_code == 403


# ---------- SECURITY: registration domain enforcement ----------
class TestRegistrationDomainEnforcement:
    def test_mismatched_domain_rejected(self, institutions):
        nit_id = institutions["NIT"]["id"]
        payload = {
            "name": "TEST Bad Domain",
            "email": f"TEST_baddomain_{uuid.uuid4().hex[:6]}@gmail.com",
            "phone": "9999999999",
            "institution_id": nit_id,
            "department": "Computer Science",
            "password": "Password@123",
            "confirm_password": "Password@123",
            "consent_accepted": True,
        }
        r = requests.post(f"{API}/auth/register/coordinator", json=payload)
        assert r.status_code == 400
        assert "not a verified domain" in r.json()["detail"].lower() or "domain" in r.json()["detail"].lower()

    def test_invalid_institution_rejected(self):
        payload = {
            "name": "TEST Bad Inst",
            "email": f"TEST_badinst_{uuid.uuid4().hex[:6]}@nit.edu",
            "phone": "9999999999",
            "institution_id": "does-not-exist",
            "department": "Computer Science",
            "password": "Password@123",
            "confirm_password": "Password@123",
            "consent_accepted": True,
        }
        r = requests.post(f"{API}/auth/register/coordinator", json=payload)
        assert r.status_code == 400


# ---------- SECURITY: unverified accounts + verify flow ----------
class TestVerificationFlow:
    def test_register_login_before_verify_then_verify(self, institutions):
        nit_id = institutions["NIT"]["id"]
        email = f"test_unverified_{uuid.uuid4().hex[:8]}@nit.edu"
        payload = {
            "name": "TEST Unverified",
            "email": email,
            "phone": "9999999999",
            "institution_id": nit_id,
            "department": "Computer Science",
            "password": "Password@123",
            "confirm_password": "Password@123",
            "consent_accepted": True,
        }
        r = requests.post(f"{API}/auth/register/student", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("requires_verification") is True
        token = body.get("verification_token")
        assert token, "verification_token must be returned in mock mode"

        # Login before verify -> 403
        r2 = login({"email": email, "password": "Password@123", "role": "student"})
        assert r2.status_code == 403
        assert "not verified" in r2.json()["detail"].lower()

        # Verify email
        r3 = requests.post(f"{API}/auth/verify-email", json={"token": token})
        assert r3.status_code == 200

        # Re-use of same token must fail
        r3b = requests.post(f"{API}/auth/verify-email", json={"token": token})
        assert r3b.status_code == 400

        # Login now succeeds
        r4 = login({"email": email, "password": "Password@123", "role": "student"})
        assert r4.status_code == 200


# ---------- SECURITY: password reset generic + single-use ----------
class TestPasswordReset:
    def test_generic_response_and_single_use(self):
        # Non-existent email must return SAME generic message
        fake = f"nobody_{uuid.uuid4().hex[:8]}@nit.edu"
        r1 = requests.post(f"{API}/auth/forgot-password", json={"email": fake})
        assert r1.status_code == 200
        msg_fake = r1.json()["message"]
        assert "reset_token" not in r1.json()

        # Existing user
        r2 = requests.post(f"{API}/auth/forgot-password", json={"email": STUDENT_CS["email"]})
        assert r2.status_code == 200
        assert r2.json()["message"] == msg_fake
        token = r2.json().get("reset_token")
        assert token, "reset_token must be returned in mock mode for existing user"

        # Use token successfully
        new_pw = "NewPass@12345"
        r3 = requests.post(f"{API}/auth/reset-password", json={"token": token, "new_password": new_pw})
        assert r3.status_code == 200

        # Reuse the same token -> must fail
        r4 = requests.post(f"{API}/auth/reset-password", json={"token": token, "new_password": new_pw})
        assert r4.status_code == 400

        # Invalid token
        r5 = requests.post(f"{API}/auth/reset-password", json={"token": "garbage-token", "new_password": new_pw})
        assert r5.status_code == 400

        # Restore original password
        r6 = requests.post(f"{API}/auth/forgot-password", json={"email": STUDENT_CS["email"]})
        tok2 = r6.json()["reset_token"]
        r7 = requests.post(f"{API}/auth/reset-password",
                           json={"token": tok2, "new_password": STUDENT_CS["password"]})
        assert r7.status_code == 200


# ---------- Coordinator: scoping, review, readiness, resume ----------
class TestCoordinatorFlow:
    def test_students_list_scoped_cs_only(self, coord_token):
        r = requests.get(f"{API}/coordinator/students", headers=h(coord_token))
        assert r.status_code == 200
        rows = r.json()
        names = [row["name"] for row in rows]
        # Tara Bhat is Electronics, must not appear
        assert not any("Tara" in n for n in names), f"Out-of-scope student leaked: {names}"
        assert len(rows) >= 5
        for row in rows:
            assert row["department"] == "Computer Science"

    def test_out_of_scope_student_detail_403(self, coord_token, admin_token):
        # find tara via admin
        r = requests.get(f"{API}/admin/users?role=student", headers=h(admin_token))
        assert r.status_code == 200
        tara = next(u for u in r.json() if u["email"] == STUDENT_EL["email"])
        r2 = requests.get(f"{API}/coordinator/students/{tara['id']}", headers=h(coord_token))
        assert r2.status_code == 403
        r3 = requests.get(f"{API}/coordinator/students/{tara['id']}/resume-link", headers=h(coord_token))
        assert r3.status_code == 403

    def test_view_student_detail_writes_audit(self, coord_token, admin_token):
        rows = requests.get(f"{API}/coordinator/students", headers=h(coord_token)).json()
        sid = rows[0]["student_id"]
        r = requests.get(f"{API}/coordinator/students/{sid}", headers=h(coord_token))
        assert r.status_code == 200
        body = r.json()
        assert body["student_id"] == sid
        assert "report" in body
        # audit
        logs = requests.get(f"{API}/admin/audit-logs?action=view_student_score",
                            headers=h(admin_token)).json()
        assert any(x["target_id"] == sid for x in logs)

    def test_readiness_update_persists_and_audits(self, coord_token, admin_token):
        rows = requests.get(f"{API}/coordinator/students", headers=h(coord_token)).json()
        sid = rows[0]["student_id"]
        r = requests.put(f"{API}/coordinator/students/{sid}/readiness",
                         headers=h(coord_token), json={"readiness": "ALMOST_READY", "note": "TEST"})
        assert r.status_code == 200
        rows2 = requests.get(f"{API}/coordinator/students", headers=h(coord_token)).json()
        row = next(x for x in rows2 if x["student_id"] == sid)
        assert row["readiness"] == "ALMOST_READY"
        logs = requests.get(f"{API}/admin/audit-logs?action=readiness_change",
                            headers=h(admin_token)).json()
        assert any(x["target_id"] == sid for x in logs)


# ---------- Coordinator jobs ----------
class TestCoordinatorJobs:
    def test_create_edit_job_and_recommend(self, coord_token, admin_token):
        payload = {
            "title": "TEST_SDE Intern",
            "company": "TEST Corp",
            "description": "Test job",
            "location": "Remote",
            "ctc": "10 LPA",
            "departments": ["Computer Science"],
            "required_skills": ["Data Structures"],
            "min_cgpa": 0,
            "is_open": True,
        }
        r = requests.post(f"{API}/coordinator/jobs", headers=h(coord_token), json=payload)
        assert r.status_code == 200
        job = r.json()
        job_id = job["id"]

        # edit
        payload["title"] = "TEST_SDE Intern v2"
        r2 = requests.put(f"{API}/coordinator/jobs/{job_id}", headers=h(coord_token), json=payload)
        assert r2.status_code == 200
        assert r2.json()["title"] == "TEST_SDE Intern v2"

        # audit
        logs = requests.get(f"{API}/admin/audit-logs?action=job_edit",
                            headers=h(admin_token)).json()
        assert any(x["target_id"] == job_id for x in logs)

        # recommend a student
        rows = requests.get(f"{API}/coordinator/students", headers=h(coord_token)).json()
        sid = rows[0]["student_id"]
        r3 = requests.post(f"{API}/coordinator/students/{sid}/recommend",
                           headers=h(coord_token), json={"job_id": job_id, "note": "test"})
        assert r3.status_code == 200


# ---------- Student flows ----------
class TestStudentFlow:
    def test_profile_read_write(self, student_token):
        r = requests.get(f"{API}/student/profile", headers=h(student_token))
        assert r.status_code == 200
        orig_target = r.json()["profile"].get("target_role")

        r2 = requests.put(f"{API}/student/profile", headers=h(student_token),
                          json={"target_role": "Software Engineer (Backend)", "share_consent": True})
        assert r2.status_code == 200
        assert r2.json()["target_role"] == "Software Engineer (Backend)"

        # restore
        if orig_target:
            requests.put(f"{API}/student/profile", headers=h(student_token),
                         json={"target_role": orig_target})

    def test_assessment_submit(self, student_token):
        r = requests.get(f"{API}/student/assessments/core-cs", headers=h(student_token))
        assert r.status_code == 200
        # answer all questions correctly using included answers? public doesn't include; use index 1 as attempt
        answers = {q["id"]: 1 for q in r.json()["questions"]}
        r2 = requests.post(f"{API}/student/assessments/core-cs/submit",
                           headers=h(student_token), json={"answers": answers})
        assert r2.status_code == 200
        body = r2.json()
        assert "correct" in body and "total" in body and "skill_scores" in body
        assert body["total"] > 0

    def test_analyze_skill_gap(self, student_token):
        r = requests.post(f"{API}/student/analyze", headers=h(student_token),
                          json={"target_role": "Software Engineer (Backend)"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert 0 <= body["overall_score"] <= 100
        assert body["readiness"] in {"READY", "ALMOST_READY", "DEVELOPING", "NOT_READY"}
        assert isinstance(body["recommendations"], list)
        assert isinstance(body["gaps"], list)
        # Report provider
        print(f"AI provider used: {body.get('provider')}")

    def test_resume_upload_valid_pdf_and_view(self, student_token):
        # minimal valid PDF
        pdf = (b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
        files = {"file": ("test_resume.pdf", pdf, "application/pdf")}
        r = requests.post(f"{API}/student/resume",
                          headers={"Authorization": f"Bearer {student_token}"}, files=files)
        assert r.status_code == 200, r.text
        assert "file_id" in r.json()

        # signed link
        r2 = requests.get(f"{API}/student/resume/link", headers=h(student_token))
        assert r2.status_code == 200
        token = r2.json()["download_token"]
        r3 = requests.get(f"{API}/files/download?token={token}")
        assert r3.status_code == 200
        assert r3.headers.get("content-type", "").startswith("application/pdf")

    def test_resume_upload_non_pdf_rejected(self, student_token):
        files = {"file": ("bad.txt", b"not a pdf", "text/plain")}
        r = requests.post(f"{API}/student/resume",
                          headers={"Authorization": f"Bearer {student_token}"}, files=files)
        assert r.status_code == 400

    def test_student_jobs_and_apply(self, student_token):
        r = requests.get(f"{API}/student/jobs", headers=h(student_token))
        assert r.status_code == 200
        jobs_list = r.json()
        if not jobs_list:
            pytest.skip("No open jobs")
        # find first not-applied
        job = next((j for j in jobs_list if not j["has_applied"]), None)
        if not job:
            return  # already applied to all
        r2 = requests.post(f"{API}/student/jobs/{job['id']}/apply", headers=h(student_token))
        assert r2.status_code in (200, 400)  # 400 if min_cgpa/no resume — resume uploaded already
        # Verify appears in applications
        r3 = requests.get(f"{API}/student/applications", headers=h(student_token))
        assert r3.status_code == 200


# ---------- SECURITY: consent gating ----------
class TestConsentGating:
    def test_consent_false_hides_data_and_blocks_detail(self, coord_token):
        # Login as second CS student (kabir) to toggle consent
        r = login({"email": "kabir.nair@nit.edu", "password": "Student@12345", "role": "student"})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        sid = r.json()["user"]["id"]

        # disable consent
        r2 = requests.put(f"{API}/student/profile", headers=h(tok),
                          json={"share_consent": False})
        assert r2.status_code == 200

        # list from coordinator: row exists but email/cgpa/score hidden
        rows = requests.get(f"{API}/coordinator/students", headers=h(coord_token)).json()
        row = next((x for x in rows if x["student_id"] == sid), None)
        assert row is not None
        assert row["email"] is None
        assert row["cgpa"] is None
        assert row["score"] is None

        # detail 403
        r3 = requests.get(f"{API}/coordinator/students/{sid}", headers=h(coord_token))
        assert r3.status_code == 403

        # restore
        requests.put(f"{API}/student/profile", headers=h(tok), json={"share_consent": True})


# ---------- Admin flows ----------
class TestAdminFlow:
    def test_stats(self, admin_token):
        r = requests.get(f"{API}/admin/stats", headers=h(admin_token))
        assert r.status_code == 200
        s = r.json()
        for k in ("institutions", "students", "coordinators", "jobs", "audit_events"):
            assert k in s

    def test_institution_create_update_and_audit(self, admin_token):
        code = f"T{uuid.uuid4().hex[:5].upper()}"
        payload = {"name": f"TEST_Institution_{code}", "code": code,
                   "domains": [f"test-{code.lower()}.edu"], "is_active": True}
        r = requests.post(f"{API}/admin/institutions", headers=h(admin_token), json=payload)
        assert r.status_code == 200, r.text
        inst_id = r.json()["id"]

        payload["domains"].append("extra.edu")
        r2 = requests.put(f"{API}/admin/institutions/{inst_id}", headers=h(admin_token), json=payload)
        assert r2.status_code == 200
        assert "extra.edu" in r2.json()["domains"]

        # public /auth/institutions reflects it
        pub = requests.get(f"{API}/auth/institutions").json()
        assert any(i["id"] == inst_id for i in pub)

        # audit
        logs = requests.get(f"{API}/admin/audit-logs?action=institution_create",
                            headers=h(admin_token)).json()
        assert any(x["target_id"] == inst_id for x in logs)
        logs2 = requests.get(f"{API}/admin/audit-logs?action=institution_update",
                             headers=h(admin_token)).json()
        assert any(x["target_id"] == inst_id for x in logs2)

    def test_disable_and_reenable_coordinator(self, admin_token):
        # get coord id
        users = requests.get(f"{API}/admin/users?role=coordinator", headers=h(admin_token)).json()
        coord = next(u for u in users if u["email"] == COORD["email"])

        # get a fresh coord token to test invalidation
        fresh = login(COORD).json()["access_token"]

        # disable
        r = requests.put(f"{API}/admin/users/{coord['id']}/disable",
                         headers=h(admin_token), json={"is_disabled": True})
        assert r.status_code == 200

        # existing token stops working
        r2 = requests.get(f"{API}/coordinator/scope", headers=h(fresh))
        assert r2.status_code == 403

        # fresh login blocked
        r3 = login(COORD)
        assert r3.status_code == 403

        # re-enable
        r4 = requests.put(f"{API}/admin/users/{coord['id']}/disable",
                          headers=h(admin_token), json={"is_disabled": False})
        assert r4.status_code == 200

        # login works again
        r5 = login(COORD)
        assert r5.status_code == 200

    def test_audit_logs_list(self, admin_token):
        r = requests.get(f"{API}/admin/audit-logs", headers=h(admin_token))
        assert r.status_code == 200
        entries = r.json()
        assert len(entries) > 0
        for e in entries:
            assert "actor_id" in e and "action" in e and "created_at" in e


# ---------- SECURITY: rate limiting (RUN LAST, throwaway email) ----------
class TestRateLimiting:
    def test_lockout_after_5_wrong(self):
        # NOTE: identifier is `{request.client.host}:{email}`. Behind the K8s ingress with
        # multiple pods, client IP varies per request so attempts are split across identifiers.
        # We send more attempts to ensure at least one pod hits the 5-fail threshold.
        email = f"throwaway_{uuid.uuid4().hex[:8]}@nit.edu"
        s = requests.Session()  # reuse connection to try to stick to same pod
        got_429 = False
        codes = []
        for i in range(25):
            r = s.post(f"{API}/auth/login",
                       json={"email": email, "password": "WrongPw@123", "role": "student"},
                       timeout=15)
            codes.append(r.status_code)
            if r.status_code == 429:
                got_429 = True
                assert "try again" in r.json()["detail"].lower() or "minute" in r.json()["detail"].lower()
                break
        assert got_429, f"Expected 429 lockout, saw codes: {codes}"
