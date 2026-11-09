from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from models import Base

import os
import sys

def get_db_path():
    if getattr(sys, 'frozen', False):
        # Running in a bundle (e.g. PyInstaller)
        base_app_data = os.getenv('APPDATA', os.path.expanduser('~'))
        kettle_dir = os.path.join(base_app_data, 'Kettle')
        os.makedirs(kettle_dir, exist_ok=True)
        db_file = os.path.join(kettle_dir, 'kettle_music.db')

        # Auto-migrate from old Redew database if it exists and new one does not
        old_db_file = os.path.join(base_app_data, 'RedewMusic', 'shakky_music.db')
        if not os.path.exists(db_file) and os.path.exists(old_db_file):
            try:
                import shutil
                shutil.copy2(old_db_file, db_file)
            except Exception:
                pass

        return db_file
    return os.path.abspath("./shakky_music.db")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = f"sqlite+aiosqlite:///{get_db_path()}"
else:
    # Render (and Heroku-style) hand out bare postgres:// / postgresql:// URLs,
    # but SQLAlchemy's async engine needs the +asyncpg driver marker
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = "postgresql+asyncpg://" + DATABASE_URL[len("postgres://"):]
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = "postgresql+asyncpg://" + DATABASE_URL[len("postgresql://"):]

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def init_db():
    async with engine.begin() as conn:
        # Create any brand-new tables
        await conn.run_sync(Base.metadata.create_all)
        # Idempotent migrations for columns added later — silent skips if
        # they already exist (SQLite / Postgres both error on duplicates).
        for stmt in [
            "ALTER TABLE users ADD COLUMN friend_code VARCHAR",
            "ALTER TABLE users ADD COLUMN bio VARCHAR DEFAULT ''",
            "ALTER TABLE users ADD COLUMN last_seen TIMESTAMP DEFAULT NULL",
        ]:
            try:
                await conn.exec_driver_sql(stmt)
            except Exception:
                pass
        # Backfill last_seen for rows that predate the migration
        try:
            await conn.exec_driver_sql(
                "UPDATE users SET last_seen = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE last_seen IS NULL"
            )
        except Exception:
            pass
        # Older SQLite schemas need the index added separately (SQLite does
        # not allow UNIQUE on ALTER ADD COLUMN). IF NOT EXISTS keeps it safe.
        try:
            await conn.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_friend_code ON users(friend_code)"
            )
        except Exception:
            pass

async def get_db():
    async with async_session() as session:
        yield session
