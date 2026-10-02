"""Async SQLAlchemy engine and session factory (replaced the motor/MongoDB client).

`DATABASE_URL` is required — there is no default, so a missing or broken value
fails loudly instead of silently running on a throwaway local file:
  - Supabase / Postgres : postgresql://postgres.<ref>:<pw>@...pooler.supabase.com:6543/postgres
  - Automated tests only: sqlite+aiosqlite:///<tmp>.db

Postgres URLs are normalised to the asyncpg driver, and `sslmode` is translated
because asyncpg takes SSL as a connect argument rather than a query parameter.
"""

import logging
import os
import ssl
from pathlib import Path
from urllib.parse import parse_qsl, quote, unquote, urlencode

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from db_models import Base

load_dotenv(Path(__file__).parent / ".env")

logger = logging.getLogger(__name__)

# Supabase pools the session; keep SQLAlchemy from holding its own long-lived pool on top.
POSTGRES_DRIVER = "postgresql+asyncpg"


def normalise_url(raw: str) -> tuple[str, dict]:
    """Return an async-driver URL plus any connect_args the driver needs.

    Parsed by hand rather than with urlsplit: Supabase hands out passwords
    containing reserved characters (`@`, `[`, `]`, `#`) unencoded, which makes
    stdlib URL parsing raise before we ever reach the database. Splitting on the
    LAST `@` is unambiguous because the host section can never contain one.
    """
    if not raw:
        raise RuntimeError(
            "DATABASE_URL is not set. PlaceMate runs on Supabase/PostgreSQL; set it in backend/.env, e.g. "
            "postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
            "?pgbouncer=true  (a sqlite+aiosqlite:/// URL is accepted only for the local test suite)"
        )

    url = raw.strip()
    connect_args: dict = {}

    if url.startswith("sqlite:///"):
        return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1), {}
    if url.startswith("sqlite"):
        return url, {}

    scheme, _, rest = url.partition("://")
    if scheme not in {"postgres", "postgresql", "postgresql+asyncpg"}:
        return url, {}

    userinfo, _, hostpart = rest.rpartition("@")
    if userinfo:
        # Percent-encode credentials so reserved characters survive the round trip.
        user, sep, password = userinfo.partition(":")
        userinfo = quote(unquote(user), safe="") + (
            ":" + quote(unquote(password), safe="") if sep else ""
        )

    hostport, _, tail = hostpart.partition("/")
    path, _, query_string = tail.partition("?")
    query = dict(parse_qsl(query_string))

    sslmode = query.pop("sslmode", None)
    # asyncpg takes SSL as a connect arg and rejects these libpq/Supabase params.
    query.pop("channel_binding", None)
    pgbouncer = query.pop("pgbouncer", None)
    if sslmode == "disable":
        connect_args["ssl"] = False
    elif sslmode in {"verify-ca", "verify-full"}:
        connect_args["ssl"] = True  # full chain + hostname verification
    elif sslmode == "require" or sslmode is None:
        # libpq's `require` means encrypt but DO NOT verify. asyncpg's ssl=True
        # verifies, which fails against Supabase's own CA with
        # "self-signed certificate in certificate chain".
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = context

    # Supabase's transaction-mode pooler (port 6543) cannot hold server-side
    # prepared statements, which asyncpg creates by default. Disable both
    # asyncpg's cache and the SQLAlchemy dialect's, or every query after the
    # first fails with DuplicatePreparedStatementError.
    port = hostport.rpartition(":")[2]
    if pgbouncer == "true" or port == "6543":
        connect_args["statement_cache_size"] = 0
        query["prepared_statement_cache_size"] = "0"

    rebuilt = f"{POSTGRES_DRIVER}://{userinfo}@{hostport}" if userinfo else f"{POSTGRES_DRIVER}://{hostport}"
    if path:
        rebuilt += f"/{path}"
    if query:
        rebuilt += f"?{urlencode(query)}"
    return rebuilt, connect_args


DATABASE_URL, CONNECT_ARGS = normalise_url(os.environ.get("DATABASE_URL", ""))

_engine_kwargs: dict = {
    "echo": os.environ.get("SQL_ECHO", "false").lower() == "true",
    "connect_args": CONNECT_ARGS,
}
# A client-side pool is safe behind pgbouncer *because* prepared statements are
# already disabled above (statement_cache_size=0). NullPool forced a fresh
# TCP+TLS handshake on every request, which measured ~300ms of pure overhead per
# call against a remote region. Keep the pool small so we never exhaust the
# pooler's transaction slots.
_engine_kwargs.update(
    pool_size=int(os.environ.get("DB_POOL_SIZE", "5")),
    max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", "5")),
    pool_recycle=1800,      # pgbouncer drops idle clients; recycle before it does
    pool_pre_ping=True,
)

engine = create_async_engine(DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# create_all only creates missing TABLES — it never alters an existing one, so
# columns added after a table already exists must be applied explicitly.
ADDITIVE_COLUMNS = [
    ("students", "college", "VARCHAR(255)"),
    ("assessment_attempts", "kind", "VARCHAR(16) DEFAULT 'aptitude'"),
    # DEFAULT 'approved' deliberately backfills every existing row, so adding the
    # coordinator-approval gate cannot lock out students who already had accounts.
    ("users", "approval_status", "VARCHAR(16) NOT NULL DEFAULT 'approved'"),
    ("users", "approved_by", "VARCHAR(36)"),
    ("users", "approved_at", "VARCHAR(40)"),
    ("users", "rejection_reason", "TEXT"),
]


# Constraints added after a table already exists. Applied best-effort: a failure
# here (e.g. pre-existing duplicates) must not stop the app from booting, since
# the same rule is also enforced in the request handler.
ADDITIVE_CONSTRAINTS = [
    (
        "students",
        "uq_student_institution_roll",
        'UNIQUE ("institution_id", "roll_number")',
    ),
]


async def init_db() -> None:
    """Create any missing tables and apply additive column/constraint upgrades."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if conn.dialect.name == "postgresql":
            for table, column, ddl in ADDITIVE_COLUMNS:
                await conn.execute(
                    text(f'ALTER TABLE public."{table}" ADD COLUMN IF NOT EXISTS "{column}" {ddl}')
                )

    if engine.dialect.name != "postgresql":
        return
    for table, name, ddl in ADDITIVE_CONSTRAINTS:
        try:
            async with engine.begin() as conn:
                exists = await conn.scalar(
                    text(
                        "select 1 from pg_constraint where conname = :name "
                        "and conrelid = to_regclass(:table)"
                    ),
                    {"name": name, "table": f"public.{table}"},
                )
                if not exists:
                    await conn.execute(text(f'ALTER TABLE public."{table}" ADD CONSTRAINT "{name}" {ddl}'))
        except Exception as exc:
            logger.warning("Could not add constraint %s on %s: %s", name, table, exc)


async def close_db() -> None:
    await engine.dispose()


async def get_session():
    """FastAPI dependency — one session per request, rolled back on error."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
