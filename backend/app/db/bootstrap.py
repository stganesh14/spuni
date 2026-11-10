"""Create the application's Postgres role and database if they do not exist yet.

The app normally connects with DATABASE_URL (a non-superuser). Creating a role or a
database needs more privileges, so this uses DATABASE_ADMIN_URL (e.g. the `postgres`
superuser) when it is set. Without it, the app's own credentials are tried, which works
only if that role already exists and has CREATEDB.

Safe to run repeatedly: when the app can already connect, nothing is changed.
"""

import asyncio
import logging

import asyncpg
from sqlalchemy.engine import make_url

from app.core.config import BASE_DIR, settings

logger = logging.getLogger(__name__)


def _ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _asyncpg_dsn(sqlalchemy_url: str, database: str | None = None) -> str:
    url = make_url(sqlalchemy_url).set(drivername="postgresql")
    if database is not None:
        url = url.set(database=database)
    return url.render_as_string(hide_password=False)


async def ensure_database() -> None:
    app_url = make_url(settings.database_url)
    try:
        conn = await asyncpg.connect(_asyncpg_dsn(settings.database_url))
    except (asyncpg.InvalidCatalogNameError, asyncpg.InvalidPasswordError, asyncpg.InvalidAuthorizationSpecificationError):
        pass
    else:
        try:
            # Since Postgres 15 only the database owner may create tables in `public`.
            if await conn.fetchval("SELECT has_schema_privilege('public', 'CREATE')"):
                return
        finally:
            await conn.close()

    admin_url = settings.database_admin_url.get_secret_value() if settings.database_admin_url else None
    if not admin_url:
        logger.warning("DATABASE_ADMIN_URL is not set; trying to set up the database with the app's own role")
    maintenance_dsn = _asyncpg_dsn(admin_url or settings.database_url, database="postgres")
    role, database = _ident(app_url.username), _ident(app_url.database)

    conn = await asyncpg.connect(maintenance_dsn)
    try:
        if admin_url and not await conn.fetchval("SELECT 1 FROM pg_roles WHERE rolname = $1", app_url.username):
            await conn.execute(f"CREATE ROLE {role} WITH LOGIN PASSWORD {_literal(app_url.password or '')}")
            logger.info("Created role %s", app_url.username)
        owner = await conn.fetchval(
            "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = $1", app_url.database
        )
        try:
            if owner is None:
                # CREATE DATABASE cannot run inside a transaction; asyncpg executes it in autocommit.
                await conn.execute(f"CREATE DATABASE {database} OWNER {role}")
                logger.info("Created database %s", app_url.database)
            elif owner != app_url.username:
                await conn.execute(f"ALTER DATABASE {database} OWNER TO {role}")
                logger.info("Changed owner of database %s to %s", app_url.database, app_url.username)
        except asyncpg.InsufficientPrivilegeError as exc:
            raise RuntimeError(
                f"Role {app_url.username!r} cannot create or own database {app_url.database!r}. Set "
                "DATABASE_ADMIN_URL in .env to a superuser URL, e.g. "
                "postgresql://postgres:<password>@localhost:5432/postgres"
            ) from exc
    finally:
        await conn.close()


def _run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "alembic"))
    cfg.attributes["configure_logging"] = False  # keep the app's logging setup intact
    command.upgrade(cfg, "head")


async def _seed_if_empty() -> None:
    from sqlalchemy import select

    from app.db.session import SessionLocal
    from app.models import Category
    from scripts.seed import DEFAULT_ASSETS, seed

    async with SessionLocal() as db:
        if await db.scalar(select(Category.id).limit(1)):
            return
    logger.info("Empty database, loading seed data")
    await seed(DEFAULT_ASSETS, settings.initial_admin_email)


async def prepare_database() -> None:
    """Create the database if needed, apply pending migrations and seed a fresh install."""
    await ensure_database()
    # Alembic's env.py runs its own event loop, so it has to run outside this one.
    await asyncio.to_thread(_run_migrations)
    await _seed_if_empty()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    asyncio.run(prepare_database())
    print("Database is ready.")


if __name__ == "__main__":
    main()
