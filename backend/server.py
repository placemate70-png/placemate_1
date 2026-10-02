import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import Depends, FastAPI, HTTPException, Query, Response  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

import storage  # noqa: E402
import routes_admin  # noqa: E402
import routes_auth  # noqa: E402
import routes_coordinator  # noqa: E402
import routes_student  # noqa: E402
from auth import decode_token  # noqa: E402
from database import AsyncSessionLocal, close_db, get_session, init_db  # noqa: E402
from db_models import FileRecord  # noqa: E402
from seed import seed_admin, seed_demo  # noqa: E402
from vector_service import init_vector_store  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="PlaceMate API")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_auth.router)
app.include_router(routes_student.router)
app.include_router(routes_coordinator.router)
app.include_router(routes_admin.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "placemate"}


@app.get("/api/public/stats")
async def public_stats(session: AsyncSession = Depends(get_session)):
    """Live platform aggregates for the landing page.

    Unauthenticated, so it returns ONLY averages across analysed students — no
    names, no per-student rows, nothing that identifies anyone. Numbers are
    computed from real reports, using the same severity thresholds the dashboard
    uses (gap_level 0 = met, <50 = gap to close, >=50 = missing).
    """
    from sqlalchemy import func, select

    from assessments import ASSESSMENTS, ROLE_REQUIREMENTS, SKILLS
    from db_models import SkillGap, SkillGapReport

    reports = (
        await session.execute(
            select(SkillGapReport).order_by(SkillGapReport.created_at.desc())
        )
    ).scalars().all()
    latest: dict = {}
    for row in reports:
        latest.setdefault(row.user_id, row)

    gaps = (await session.execute(select(SkillGap))).scalars().all()
    per_student: dict = {}
    for row in gaps:
        bucket = per_student.setdefault(row.student_id, {"strong": 0, "gap": 0, "missing": 0})
        if row.gap_level <= 0:
            bucket["strong"] += 1
        elif row.gap_level < 50:
            bucket["gap"] += 1
        else:
            bucket["missing"] += 1

    analysed = len(per_student) or 1
    strong = round(sum(b["strong"] for b in per_student.values()) / analysed)
    gap = round(sum(b["gap"] for b in per_student.values()) / analysed)
    missing = round(sum(b["missing"] for b in per_student.values()) / analysed)
    readiness = (
        round(sum(r.overall_score for r in latest.values()) / len(latest)) if latest else 0
    )

    return {
        "students_analysed": len(per_student),
        "readiness_score": readiness,
        "strong_skills": strong,
        "skill_gaps": gap,
        "missing_skills": missing,
        "tracked_skills": len(SKILLS),
        "roles": len(ROLE_REQUIREMENTS),
        "assessment_sets": len(ASSESSMENTS),
    }


@app.get("/api/files/download")
async def download_file(token: str = Query(...), session: AsyncSession = Depends(get_session)):
    """Time-limited, single-purpose signed URL issued only to authorized viewers."""
    payload = decode_token(token)
    if payload.get("type") != "file":
        raise HTTPException(status_code=401, detail="Invalid download token")
    record = await session.get(FileRecord, payload["file_id"])
    if not record or record.is_deleted:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data, content_type = storage.get_object(record.storage_path)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Storage unavailable: {exc}")
    return Response(
        content=data,
        media_type=record.content_type or content_type,
        headers={"Content-Disposition": f'inline; filename="{record.original_filename or "resume.pdf"}"'},
    )


@app.get("/api/source-code.zip")
async def download_source_zip():
    """Temporary endpoint to download the project source code as a ZIP."""
    from fastapi.responses import FileResponse
    zip_path = "/tmp/placemate_code.zip"
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="ZIP not found")
    return FileResponse(zip_path, media_type="application/zip", filename="placemate_code.zip")


@app.on_event("startup")
async def startup():
    await init_db()
    async with AsyncSessionLocal() as session:
        await seed_admin(session)
        if os.environ.get("SEED_DEMO_DATA", "false").lower() == "true":
            await seed_demo(session)
        await session.commit()
    try:
        storage.init_storage()
        logger.info("Object storage initialized")
    except Exception as exc:
        logger.error("Storage init failed: %s", exc)
    # Embed the role catalogue for semantic role recommendations. Failure here
    # only downgrades ranking to deterministic — it must not block startup.
    try:
        init_vector_store()
    except Exception as exc:
        logger.error("Vector store init failed: %s", exc)


@app.on_event("shutdown")
async def shutdown():
    await close_db()
