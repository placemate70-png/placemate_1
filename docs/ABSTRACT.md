# PlaceMate — AI-Based Skill-Gap Analysis and Placement Readiness Ecosystem

**Tagline:** *Find your gap. Find your career.*
**Category:** EdTech · Applied AI/ML · Career Guidance
**Stack:** React (Vite) · FastAPI · Supabase/PostgreSQL · ChromaDB · spaCy · Google Gemini

---

## 1. Problem Statement

Indian higher education enrols roughly 44.6 million students, yet the transition from
classroom to employment remains badly broken on both sides of the market. Roughly 76% of
employers globally report difficulty finding candidates with the skills they need, while
only about 42.6% of Indian graduates are assessed as employable. The gap is not merely one
of ability but of *information*: 68% of students believe they are job-ready against only 9%
of employers who agree.

The root cause is that students prepare **blind**. They rehearse generic aptitude questions
and accumulate certificates without knowing which specific competencies a target role
actually demands, or where they personally fall short. Advice is generic, delayed, and
rarely tied to measurable evidence. Placement coordinators face the mirror image of the same
problem: responsible for entire departments, they have no instrument for seeing which
students are at risk or which deficiencies are systemic across a batch, and so intervene
late and uniformly rather than early and precisely.

Existing tools do not close this gap. Enterprise platforms such as Eightfold.ai are priced
for corporate recruiters, not students. Resume tools like Hiration paywall their useful
features and perform no gap analysis. Practice portals such as PrepInsta drill questions but
never read a resume or model a role. Crucially, every one of them is **student-only** — none
gives the coordinator a view, so the institution remains blind.

## 2. Proposed Solution

PlaceMate is a placement-readiness ecosystem that converts a student's real evidence —
resume, declared skills, assessment performance, projects and internships — into a
quantified readiness score, an explicit list of skill gaps, and a personalised preparation
roadmap that updates automatically after every assessment. The same data powers a
department-level analytics view for the placement coordinator, making it the only
free platform in its class offering **dual student and coordinator perspectives** over one
shared, auditable dataset.

The design principle throughout is **transparent AI**. Readiness scoring is fully
deterministic and explainable: a weighted composite of measured skill match (55%), profile
completeness (12%), resume presence (10%), academic performance (8%), practical experience
(8%) and assessment coverage (7%). A large language model is used *only* to author narrative
explanation and roadmap prose, and everything it returns is schema-validated before display —
roadmap steps citing skills outside the target role's requirements are discarded. If the
model is unavailable or its quota is exhausted, the system falls back to deterministic output
and continues to function. A student's score therefore never depends on a black box, and
never depends on a third-party API being reachable.

## 3. System Architecture and Methodology

**Frontend.** React 19 with Vite and Tailwind CSS, using shadcn/ui primitives and Recharts
for visualisation. Role-separated portals with route-level protection.

**Backend.** FastAPI exposing 57 endpoints across authentication, student, coordinator,
administrator and public surfaces, backed by 4,339 lines of application Python.

**Persistence.** Supabase (PostgreSQL) accessed through async SQLAlchemy 2.0 over asyncpg, in
a normalised 15-table relational schema with enforced foreign keys and unique constraints —
migrated from an earlier document-oriented store so that cohort analytics can be expressed
as SQL aggregates rather than per-record traversal.

**Resume analysis.** PDF text is extracted with pypdf, then parsed with spaCy. Entity
recognition alone proved unreliable for technical vocabulary — the small English model
classifies "Python" as a geopolitical entity — so skill extraction instead uses a
`PhraseMatcher` over a curated vocabulary of ~140 industry terms mapped onto the platform's
12 tracked competencies, with a positional heuristic recovering candidate names that NER
misses. Extracted skills augment the student profile without overwriting anything the
student entered.

**Semantic role matching.** Role requirement profiles are embedded in ChromaDB using
`all-MiniLM-L6-v2`. Role recommendation blends deterministic skill match (65%) with vector
similarity (35%), allowing a resume mentioning "Postgres" to match a role requiring
"Databases" despite no string overlap. The system reports a confidence signal and downgrades
its own recommendation when a profile aligns poorly with the entire role catalogue, rather
than presenting a weak match with false certainty.

**Generative layer.** Google Gemini produces the narrative summary, prioritised
recommendations and week-by-week roadmap, each step carrying curated learning resources.

## 4. Key Features Implemented

- **Resume parsing** extracting name, email, phone, degree, CGPA, graduation year and mapped
  skills, chaining automatically into gap analysis on upload.
- **Skill-gap detection** across 12 tracked competencies and 7 target roles, scored 0–100 per
  skill with High/Medium/Low priority and colour-coded severity.
- **Career discovery** ranking every role by fit, with a radar chart comparing assessed
  levels against role requirements.
- **Personalised roadmaps** with cumulative week ranges, per-step resources and PDF export.
- **Assessment engine** of 4 sets and 36 questions spanning aptitude and coding, which
  recomputes readiness immediately on submission.
- **Progress tracking** with per-skill task states and a longitudinal score-history chart.
- **Gamification** — XP, five progression levels, activity streaks and nine achievement
  badges, every value derived from recorded activity rather than stored counters.
- **Coordinator analytics** — cohort readiness distribution, ranked common deficiencies and a
  student × skill heatmap.
- **Coordinator-gated registration**, under which student accounts remain inactive until
  approved by a verified coordinator of the same institution and department.

## 5. Security and Governance

Authentication uses bcrypt password hashing with HS256 JSON Web Tokens. Authorisation is
enforced server-side on every request: coordinators are scoped to a single institution *and*
department, and identity is re-read from the database per request so that disabling,
rejecting or revoking an account terminates live sessions immediately rather than at token
expiry. Registration requires an approved institution and a matching verified email domain.
Authentication is rate-limited with temporary lockout, with counters held outside the request
transaction so that a rejected login still records its own failure. Resumes are stored in
object storage and released only through time-limited signed URLs. Every sensitive
action — score view, resume access, readiness change, approval decision, job edit — is written
to an immutable audit log.

## 6. Results and Validation

The implemented system comprises approximately 9,700 lines of application code and is
deployed against a live Supabase instance. Correctness is evidenced by 78 automated checks
covering authentication, role isolation, institution and department scoping, approval
gating, audit completeness and referential integrity, all passing. A relational migration
moved 82 records across 676 field values with zero mismatches. Targeted optimisation of
query patterns and connection handling reduced measured end-to-end response time by 36%
overall, with the heaviest coordinator view improving by 60%.

## 7. Impact and Conclusion

By replacing generic preparation with measured, role-specific evidence, PlaceMate addresses
the information asymmetry underlying India's graduate employability gap. Students gain a
defensible picture of where they stand and a concrete sequence of actions; coordinators gain
early, department-wide visibility that converts limited attention into targeted intervention.
Because the platform is free to students and built on open, no-cost infrastructure, it is
equally available to tier-2 and tier-3 institutions, where professional placement guidance is
scarcest and its marginal benefit greatest.

The wider context reinforces the need: approximately 40% of core job skills are projected to
change by 2030, and roughly 170 million new roles are expected to be created. In that
environment, the ability to measure a gap and close it deliberately ceases to be a
convenience and becomes the central skill of a career. PlaceMate is built to teach it.
