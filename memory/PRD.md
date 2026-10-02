# PlaceMate — AI Skill-Gap and Placement Readiness Ecosystem

## Original problem statement
A web app where students build placement profiles and receive skill-gap/readiness insights, while
verified Placement Coordinators monitor department-level progress and publish opportunities, and
Admins manage institutions, verify/disable coordinators, manage users and review audit activity.
Separate role login pages, approved-institution + verified-domain signup enforcement, email
verification, expiring single-use password resets, rate limiting, server-side institution/department
authorization, consent-gated student data, object-storage resumes with signed links, and audit logging.

## Architecture
- **Frontend:** React (JSX) + React Router + Tailwind + shadcn/ui + recharts + sonner. Swiss/high-contrast
  design system (Outfit / IBM Plex Sans / JetBrains Mono, obsidian + volt `#C0FF00`).
- **Backend:** FastAPI, all routes under `/api`. Modules: `routes_auth`, `routes_student`,
  `routes_coordinator`, `routes_admin`, `auth`, `models`, `ai_service`, `assessments`, `storage`,
  `mailer`, `seed`.
- **Database:** MongoDB. Collections: users, students, institutions, assessment_attempts,
  skill_gap_reports, jobs, applications, recommendations, audit_logs, email_tokens, login_attempts, files.
  All documents use a `BaseDocument` model mapping `_id` <-> `id` (uuid strings).
- **Auth:** bcrypt + JWT (Bearer token in localStorage and an httpOnly cookie). `get_current_user`
  re-reads the user each request so disabled/unverified accounts lose access immediately.
- **Resumes:** Emergent Object Storage (`placementiq/resumes/{user_id}/{uuid}.pdf`); downloads only via
  `/api/files/download?token=` with a 5-minute signed JWT.
- **AI:** `ai_service.py` — deterministic gap/readiness scoring is the source of truth; Claude
  Sonnet 4.6 (Emergent LLM key) adds the narrative + recommendations and is validated, with a
  deterministic fallback on any failure. Provider/model swappable via `AI_PROVIDER` / `AI_MODEL`.
- **Email:** MOCKED (`EMAIL_MODE=mock`) — verification/reset tokens are returned by the API and
  surfaced as links in the UI.

## User personas
- **Student** — builds a profile, uploads a resume, takes assessments, runs skill-gap analysis, applies to jobs.
- **Placement Coordinator** — verified, scoped to one institution + one department; reviews resumes and
  scores, marks readiness, recommends students, publishes and edits openings.
- **Admin** — manages approved institutions and verified domains, verifies/disables accounts, reviews audit trail.

## Core requirements (static)
1. Separate `/student/login`, `/coordinator/login`, `/admin/login` with no editable role field.
2. Coordinator signup requires approved institution **and** matching verified email domain.
3. Email verification activates accounts; no dashboard access before verification.
4. Password reset links expire (60 min), are single-use, and never reveal whether an email exists.
5. Login and reset attempts are rate-limited with temporary lockout.
6. Disabled accounts cannot log in and existing sessions stop working.
7. Institution/department authorization enforced on every API request.
8. Students must consent before coordinators can see resume, email, CGPA or score.
9. Resumes live in object storage with signed, time-limited downloads.
10. Coordinator/admin actions (score views, resume views, readiness changes, job edits) are audited.

## Implemented (2026-06)
- Phase 1 — React + FastAPI + MongoDB base, JWT auth, role authorization, institution/domain models.
- Phase 2 — student & coordinator signup/login, email verification, resend, forgot/reset password,
  rate limiting with lockout, admin account disable/enable, manual verify.
- Phase 3 — student profile, PDF resume upload to object storage, 4 assessment sets (12 tracked skills),
  deterministic + AI skill-gap analysis, readiness bands (READY / ALMOST_READY / DEVELOPING / NOT_READY),
  job list and applications.
- Phase 4 — coordinator dashboard with score cards, readiness distribution, department-scoped student
  table with search/readiness/min-score filters, resume review panel with signed links, readiness
  marking, recommendations, job publish/edit and applicant lists.
- Phase 5 — admin institution/domain CRUD, user management (verify, disable, enable), audit log with
  action filter, seeded demo data, 32 backend tests passing.
- Hardening after test run 1: rate-limit identifier now uses `X-Forwarded-For` (real client IP behind
  the k8s ingress); password reset clears lockouts for the affected account only.

## Backlog
### P0
- Real email provider (Resend or SendGrid) to replace the mocked transport.
### P1
- Bind resume download tokens to the requesting user id for defence in depth.
- Coordinator bulk actions (export shortlist, bulk readiness marking).
- Application status workflow (shortlisted / interview / offer) visible to students.
### P2
- Dark mode toggle (tokens already defined).
- Resume text parsing to auto-suggest declared skills.
- Cohort trend charts over time; department-vs-department admin analytics.
- Student notification centre for recommendations and deadlines.

## Next tasks
1. Collect a Resend/SendGrid API key and switch `mailer.py` off mock mode.
2. Add application status transitions for coordinators.
3. Add resume parsing to prefill skills.
