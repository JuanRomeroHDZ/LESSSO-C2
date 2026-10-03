import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routes import cve_router, auth_router, scans_router, jobs_router
from app.db.database import engine
from app.db.models import Base


from app.services import cve_matcher
from app.services.cve_cache import cve_cache

logger = logging.getLogger("uvicorn.error")

# ==========================================================
# MIGRADOR LIGERO (Parche Dev)
# ==========================================================
_MIGRATIONS: list[str] = [
    "ALTER TABLE ports ADD COLUMN IF NOT EXISTS cpe  TEXT",
    "ALTER TABLE ports ADD COLUMN IF NOT EXISTS cves TEXT",
]

async def _run_light_migrations() -> None:
    async with engine.begin() as conn:
        for stmt in _MIGRATIONS:
            try:
                await conn.execute(text(stmt))
            except Exception:
                logger.exception("[startup] Migración falló: %s", stmt)

# ==========================================================
# CICLO DE VIDA
# ==========================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[startup] Creando tablas si no existen...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[startup] Tablas verificadas/creadas correctamente.")
    except Exception:
        logger.exception("[startup] Error crítico creando tablas")
        raise

    logger.info("[startup] Aplicando migraciones ligeras...")
    await _run_light_migrations()

    await cve_cache.init()
    try:
        await cve_matcher.init_matcher()
    except Exception:
        logger.exception("[startup] No se pudo inicializar el cliente NVD")

    yield

    logger.info("[shutdown] Cerrando recursos...")
    try:
        await cve_matcher.close_matcher()
    except Exception:
        logger.exception("[shutdown] Error cerrando NVD client")
    try:
        await cve_cache.close()
    except Exception:
        logger.exception("[shutdown] Error cerrando cache")
    await engine.dispose()


app = FastAPI(title="LESSSO C2 API", version="0.2.7", lifespan=lifespan)

# ==========================================================
# MANEJADOR GLOBAL DE EXCEPCIONES
# ==========================================================
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception(f"[Global Exception] Error no manejado en {request.method} {request.url}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor. Por seguridad, los detalles han sido registrados en los logs internos."},
    )

# ==========================================================
# CORS
# ==========================================================
allowed_origins_str = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173,tauri://localhost,http://tauri.localhost",
)
ALLOWED_ORIGINS = [
    origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# ==========================================================
# RUTAS
# ==========================================================
@app.get("/")
async def health_check():
    return {"status": "ok", "service": "LESSSO C2 Backend Engine"}

app.include_router(auth_router, prefix="/api")
app.include_router(cve_router, prefix="/api")
app.include_router(scans_router, prefix="/api")



app.include_router(jobs_router, prefix="/api")
