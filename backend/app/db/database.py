import logging

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")


# ==========================================================
# ENGINE
# ==========================================================
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800,  # 30 min
)


# ==========================================================
# SESSION FACTORY
# ==========================================================
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


# ==========================================================
# DEPENDENCY DE FASTAPI
# ==========================================================
async def get_db():
    """
    Genera una sesión por request y la cierra al final.
    Si ocurre una excepción, hace rollback automáticamente.
    """
    async with async_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
