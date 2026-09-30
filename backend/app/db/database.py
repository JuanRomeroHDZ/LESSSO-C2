import logging

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")


# ==========================================================
# ENGINE
# ----------------------------------------------------------
# pool_pre_ping: verifica que la conexión sigue viva antes de
#                usarla. Evita errores tipo "connection reset"
#                cuando Postgres reinicia o hay timeouts.
# echo=False:    en producción no queremos SQL en logs.
#                Cambiar a True para debug de queries.
# ==========================================================
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800,  # 30 min — evita conexiones zombis
)


# ==========================================================
# SESSION FACTORY
# ----------------------------------------------------------
# expire_on_commit=False: tras commit(), los objetos siguen
#                         accesibles sin lazy-load (importante
#                         en async donde lazy-load falla).
# ==========================================================
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


# ==========================================================
# DEPENDENCY DE FASTAPI
# ----------------------------------------------------------
# Uso:  async def endpoint(db: AsyncSession = Depends(get_db)):
# ----------------------------------------------------------
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
