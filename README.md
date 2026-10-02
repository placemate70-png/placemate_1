# PlaceMate

**Find your gap. Find your career.**

AI-based skill-gap analysis and placement readiness ecosystem for college students and
placement coordinators.

---

## What it does

| Capability | How |
|---|---|
| Resume & profile analysis | `pypdf` text extraction + spaCy entity/skill extraction |
| Role-based skill-gap identification | Deterministic requirement matching + ChromaDB vector similarity |
| Personalized preparation roadmap | Google Gemini, validated, with curated learning resources |
| Assessment & progress tracking | Per-skill `progress_logs`; recommendations refresh after every assessment |
| Suitable-role recommendation | Hybrid ranking: 65% deterministic skill-match + 35% semantic similarity |
| Coordinator analytics | Batch readiness, common skill deficiencies, student x skill heatmap |

Three separate portals — `/student/login`, `/coordinator/login`, `/admin/login` — with
server-side institution/department scoping, student consent gating, and a full audit trail.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + **Vite** + Tailwind + shadcn/ui + recharts |
| Backend | FastAPI (all routes under `/api`) |
| Database | Supabase / PostgreSQL via SQLAlchemy 2.0 (async, asyncpg) |
| Vector store | ChromaDB (local persistent, `all-MiniLM-L6-v2` embeddings) |
| NLP | spaCy `en_core_web_sm` + pypdf |
| LLM | Google Gemini (`gemini-flash-latest`) |
| Auth | bcrypt + JWT (Bearer token + httpOnly cookie) |

## Setup

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

Create `backend/.env`:

```ini
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
JWT_SECRET="<a long random string>"
ADMIN_EMAIL="admin@placemate.edu"
ADMIN_PASSWORD="<strong password>"
GEMINI_API_KEY="<your Google AI Studio key>"
EMAIL_MODE="mock"
SEED_DEMO_DATA="true"
CORS_ORIGINS="*"
```

**Connection string gotchas** (all handled by `database.py`, but worth knowing):

- Supabase's dashboard shows `[YOUR-PASSWORD]` — the **square brackets are placeholders**.
  Do not keep them.
- Passwords containing `@ [ ] #` must be percent-encoded (`@` → `%40`).
- Use the **pooler** host (port `6543`). The direct host `db.<ref>.supabase.co` is
  **IPv6-only** and will fail on IPv4-only hosts such as Render's free tier.
- `sslmode=require` means *encrypt without verifying*; Supabase uses its own CA, so full
  verification fails.

Run it:

```bash
cd backend && uvicorn server:app --reload --port 8001
```

### 2. Frontend

```bash
cd frontend
yarn install
```

Create `frontend/.env`:

```ini
VITE_BACKEND_URL=http://localhost:8001
```

```bash
yarn dev        # dev server on :3000
yarn build      # production bundle -> frontend/build
```

## Database

Schema is created automatically on startup (`init_db`). Tables:

`institutions`, `users`, `students`, `files`, `jobs`, `applications`, `recommendations`,
`assessment_attempts`, `skill_gap_reports`, `audit_logs`, `email_tokens`, `login_attempts`,
`progress_logs`, `skill_gaps`, `roadmaps`

### Migrating from the old jsonb schema

An earlier version stored every collection as `(id text, data jsonb)`. To convert:

```bash
cd backend
python migrate_jsonb_to_relational.py --status     # inspect
python migrate_jsonb_to_relational.py              # migrate (renames old tables to *_legacy)
python migrate_jsonb_to_relational.py --rollback   # undo
```

Nothing is dropped — the originals are preserved as `<name>_legacy`.

## API

Auth: `POST /api/auth/{login,logout,register/student,register/coordinator,verify-email,
resend-verification,forgot-password,reset-password}`, `GET /api/auth/{me,institutions}`

Student: `GET/PUT /api/student/profile`, `POST /api/student/resume`,
`GET /api/student/resume/link`, `GET /api/student/assessments`,
`POST /api/student/assessments/{id}/submit`, `POST /api/student/analyze`,
`GET /api/student/role-recommendations`, `GET/POST /api/student/roadmap`,
`GET /api/student/progress`, `PUT /api/student/progress/{skill}`,
`GET /api/student/{jobs,applications,recommendations,reports,meta}`

Coordinator: `GET /api/coordinator/{scope,overview,analytics,students,jobs}`,
`GET /api/coordinator/students/{id}`, `PUT /api/coordinator/students/{id}/readiness`,
`POST /api/coordinator/students/{id}/recommend`, `POST/PUT /api/coordinator/jobs`

Admin: `GET /api/admin/{stats,institutions,users,audit-logs}`,
`PUT /api/admin/users/{id}/{disable,verify}`

## Design notes

- **Deterministic scoring is the source of truth.** Gemini only writes narrative,
  recommendations and roadmap prose, and everything it returns is validated (roadmap steps
  citing skills outside the role's requirements are discarded). Any provider failure or
  quota exhaustion falls back to deterministic output — readiness scores never depend on
  the LLM being available. This is what makes the scoring explainable.
- **Rate-limit state lives outside the request transaction.** A failed login raises an
  exception that rolls the request back; if the counter shared that transaction the
  increment would be undone and lockout could never trigger.
- **Skill gaps are stored twice on purpose** — authoritative JSON in `skill_gap_reports`,
  flattened rows in `skill_gaps` so coordinator analytics can aggregate in SQL.

## Known follow-ups

- `google-generativeai` is deprecated upstream; migrate to the `google-genai` SDK.
- Email is mocked (`EMAIL_MODE=mock`): verification and reset tokens are returned by the
  API and rendered as links instead of being sent. Wire a real provider before production.
- Resume download tokens are not bound to the requesting user (5-minute TTL only).
- ChromaDB is a local persistent store; it needs a shared volume or hosted vector DB when
  running more than one backend instance.
