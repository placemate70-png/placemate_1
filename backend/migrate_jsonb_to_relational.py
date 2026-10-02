"""One-time migration: (id text, data jsonb) document tables -> typed relational schema.

An earlier lift-and-shift from MongoDB dumped each collection into a two-column
`(id, data jsonb)` table. That preserves the data but gives up everything
PostgreSQL is for: typed columns, foreign keys, and indexable fields.

This script is non-destructive. It RENAMES each legacy table to `<name>_legacy`
(nothing is dropped), creates the real schema, then copies every row across with
proper types. If anything fails the whole thing rolls back in one transaction.

    python migrate_jsonb_to_relational.py           # migrate
    python migrate_jsonb_to_relational.py --status  # inspect only

To roll back manually: drop the new tables and rename `<name>_legacy` back.
"""

import asyncio
import json
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import db_models as m
from database import engine

# (legacy table, ORM model, primary-key attribute, jsonb fields to copy)
# Ordered so foreign-key targets are always inserted before their referents.
PLAN = [
    ("institutions", m.Institution, "id",
     ["name", "code", "domains", "is_active", "created_at"]),
    ("users", m.User, "id",
     ["email", "password_hash", "name", "role", "phone", "institution_id", "department",
      "is_verified", "is_disabled", "consent_accepted", "created_at"]),
    ("files", m.FileRecord, "id",
     ["owner_id", "storage_path", "original_filename", "content_type", "size",
      "is_deleted", "created_at"]),
    ("students", m.StudentProfile, "id",
     ["user_id", "institution_id", "department", "roll_number", "degree", "graduation_year",
      "cgpa", "target_role", "headline", "skills", "projects_count", "internships_count",
      "resume_file_id", "resume_filename", "share_consent", "readiness_override",
      "coordinator_note", "updated_at"]),
    ("jobs", m.Job, "id",
     ["institution_id", "created_by", "title", "company", "description", "location", "ctc",
      "departments", "required_skills", "min_cgpa", "deadline", "is_open", "created_at"]),
    ("applications", m.Application, "id",
     ["job_id", "student_id", "institution_id", "department", "status", "applied_at"]),
    ("recommendations", m.Recommendation, "id",
     ["student_id", "job_id", "coordinator_id", "note", "created_at"]),
    ("assessment_attempts", m.AssessmentAttempt, "id",
     ["user_id", "assessment_id", "correct", "total", "skill_scores", "submitted_at"]),
    ("skill_gap_reports", m.SkillGapReport, "id",
     ["user_id", "target_role", "overall_score", "readiness", "gaps", "strengths",
      "recommendations", "summary", "provider", "created_at"]),
    ("audit_logs", m.AuditLog, "id",
     ["actor_id", "actor_email", "actor_role", "action", "target_type", "target_id",
      "meta", "created_at"]),
    ("email_tokens", m.EmailToken, "token",
     ["user_id", "kind", "used", "expires_at", "created_at", "used_at"]),
    ("login_attempts", m.LoginAttempt, "identifier",
     ["count", "locked_until", "updated_at"]),
]

# Has no ORM model yet (the roadmap feature is still being built) — preserved untouched.
CARRY_FORWARD = ["roadmaps"]


async def table_names(conn) -> set:
    rows = await conn.execute(
        text("select table_name from information_schema.tables where table_schema='public'")
    )
    return {r[0] for r in rows}


def loads(value):
    return json.loads(value) if isinstance(value, str) else (value or {})


async def status():
    async with engine.connect() as conn:
        names = await table_names(conn)
        print(f"{'table':26s} {'rows':>6s}  shape")
        for name in sorted(names):
            count = await conn.scalar(text(f'select count(*) from public."{name}"'))
            cols = await conn.execute(text(
                "select column_name from information_schema.columns "
                f"where table_schema='public' and table_name='{name}' order by ordinal_position"))
            shape = ",".join(r[0] for r in cols)
            print(f"{name:26s} {count:>6d}  {shape[:60]}")
    await engine.dispose()


async def migrate():
    async with engine.begin() as conn:
        names = await table_names(conn)

        legacy_present = [f"{t}_legacy" for t, *_ in PLAN if f"{t}_legacy" in names]
        if legacy_present:
            print(f"ABORT: {len(legacy_present)} *_legacy tables already exist — migration "
                  f"appears to have run already. Resolve manually before re-running.")
            return 1

        # 1. Rename every document table out of the way (nothing dropped).
        renamed = []
        for legacy, *_ in PLAN:
            if legacy in names:
                await conn.execute(text(f'ALTER TABLE public."{legacy}" RENAME TO "{legacy}_legacy"'))
                renamed.append(legacy)
        for extra in CARRY_FORWARD:
            if extra in names:
                await conn.execute(text(f'ALTER TABLE public."{extra}" RENAME TO "{extra}_legacy"'))
                renamed.append(extra)
        print(f"renamed {len(renamed)} tables -> *_legacy")

        # 2. Create the typed relational schema.
        await conn.run_sync(m.Base.metadata.create_all)
        print(f"created {len(m.Base.metadata.tables)} relational tables")

        # 3. Copy rows across, validating foreign keys as we go.
        session = AsyncSession(bind=conn)
        seen: dict[str, set] = {}
        report = []
        for legacy, model, pk, fields in PLAN:
            if legacy not in renamed:
                report.append((legacy, 0, 0, "absent"))
                continue
            rows = (await conn.execute(text(f'select id, data from public."{legacy}_legacy"'))).all()

            payload, skipped = [], 0
            for row_id, raw in rows:
                data = loads(raw)
                record = {pk: row_id}
                for field in fields:
                    if data.get(field) is not None:
                        record[field] = data[field]

                # Null or drop references whose target did not survive.
                if legacy == "students" and record.get("resume_file_id") not in seen.get("files", set()):
                    record.pop("resume_file_id", None)
                bad = False
                for fk_field, target in (
                    ("institution_id", "institutions"), ("user_id", "users"),
                    ("created_by", "users"), ("student_id", "users"),
                    ("coordinator_id", "users"), ("job_id", "jobs"),
                ):
                    if fk_field in record and fk_field in fields:
                        if record[fk_field] not in seen.get(target, set()):
                            bad = True
                            break
                if bad:
                    skipped += 1
                    continue
                payload.append(record)

            # Insert one row at a time through the ORM. A bulk
            # `conn.execute(insert(model), list_of_dicts)` compiles the statement
            # from the FIRST dict's keys, so any column absent from row 0 (e.g.
            # the admin's null institution_id) is silently dropped from EVERY row.
            for record in payload:
                session.add(model(**record))
            await session.flush()
            seen[legacy] = {r[pk] for r in payload}
            report.append((legacy, len(payload), skipped, "ok"))

        print(f"\n{'table':24s} {'copied':>7s} {'skipped':>8s}")
        for name, copied, skipped, note in report:
            flag = "" if note == "ok" else f"  ({note})"
            print(f"{name:24s} {copied:>7d} {skipped:>8d}{flag}")

    await engine.dispose()
    return 0


async def rollback():
    """Undo a migration: drop the relational tables and restore *_legacy names."""
    async with engine.begin() as conn:
        names = await table_names(conn)
        restored = []
        for legacy, *_ in PLAN + [(c, None, None, None) for c in CARRY_FORWARD]:
            if f"{legacy}_legacy" not in names:
                continue
            if legacy in names:
                await conn.execute(text(f'DROP TABLE public."{legacy}" CASCADE'))
            await conn.execute(text(f'ALTER TABLE public."{legacy}_legacy" RENAME TO "{legacy}"'))
            restored.append(legacy)
        print(f"rolled back {len(restored)} tables: {', '.join(restored)}")
    await engine.dispose()
    return 0


if __name__ == "__main__":
    if "--status" in sys.argv:
        raise SystemExit(asyncio.run(status()))
    if "--rollback" in sys.argv:
        raise SystemExit(asyncio.run(rollback()))
    raise SystemExit(asyncio.run(migrate()))
