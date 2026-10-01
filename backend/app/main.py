import json as _json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, List, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes import cve_router
from app.db.database import engine, get_db
from app.db.models.scan import Base, HostModel, PortModel, ScanReportModel
from app.services import cve_matcher
from app.services.cve_cache import cve_cache

# ==========================================================
# LOGGING
# ==========================================================
logger = logging.getLogger("uvicorn.error")


# ==========================================================
# MIGRADOR LIGERO
# ----------------------------------------------------------
# `Base.metadata.create_all` crea tablas que NO existen, pero
# NO altera tablas ya existentes. Como añadimos columnas nuevas
# a `ports`, tenemos que hacer ALTER TABLE a mano si la tabla
# ya estaba creada por una versión previa.
#
# En producción: usar Alembic. Esto es un parche para dev.
# ==========================================================
_MIGRATIONS: list[str] = [
    # Añadidas en el Bloque 2 (CVEs)
    "ALTER TABLE ports ADD COLUMN IF NOT EXISTS cpe  TEXT",
    "ALTER TABLE ports ADD COLUMN IF NOT EXISTS cves TEXT",
]


async def _run_light_migrations() -> None:
    """
    Aplica ALTER TABLE idempotentes para columnas nuevas.
    Si la tabla no existe todavía, `create_all` la habrá creado
    antes y el ALTER no hace nada (IF NOT EXISTS).
    """
    async with engine.begin() as conn:
        for stmt in _MIGRATIONS:
            try:
                await conn.execute(text(stmt))
            except Exception:
                # No abortamos el arranque por una migración concreta;
                # lo logueamos y seguimos. Si la columna era crítica,
                # el INSERT fallará y lo veremos en los logs.
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
    logger.info("[startup] Migraciones ligeras aplicadas.")

    # Cache + cliente NVD
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


app = FastAPI(title="LESSSO C2 API", version="0.2.0", lifespan=lifespan)


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
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================================
# SCHEMAS PYDANTIC
# ==========================================================
class CveMatchModel(BaseModel):
    id: str
    severity: str = "unknown"
    cvss: Optional[float] = None
    source: str = "cpe"
    description: Optional[str] = None
    cwe: Optional[List[str]] = None


class PortInfo(BaseModel):
    portid: str
    protocol: str
    state: str
    reason: str
    service: str
    version: str
    cpe: Optional[List[str]] = None
    cves: Optional[List[CveMatchModel]] = None


class HostInfo(BaseModel):
    ip: str
    mac: Optional[str] = None
    mac_vendor: Optional[str] = None
    status: str
    os: Optional[str] = None
    ports: List[PortInfo] = Field(default_factory=list)


class ScanReport(BaseModel):
    target: str
    scan_duration: str
    hosts: List[HostInfo] = Field(default_factory=list)


# ==========================================================
# RUTAS
# ==========================================================
@app.get("/")
async def health_check():
    return {"status": "ok", "service": "LESSSO C2 Backend Engine"}


app.include_router(cve_router, prefix="/api")


@app.post("/api/scans")
async def save_scan_result(
    report: ScanReport,
    db: AsyncSession = Depends(get_db),
):
    """
    Guarda un reporte de escaneo completo con sus hosts y puertos.
    Persiste también los CVEs enriquecidos (si vienen en el payload).
    """
    logger.info(
        f"[scan] Recibido reporte target={report.target!r} "
        f"hosts={len(report.hosts)} duration={report.scan_duration!r}"
    )

    try:
        db_report = ScanReportModel(
            target=report.target,
            scan_duration=report.scan_duration,
        )
        db.add(db_report)
        await db.flush()
        logger.info(f"[scan] Reporte creado id={db_report.id}")

        total_ports = 0
        total_cves = 0
        for host in report.hosts:
            db_host = HostModel(
                report_id=db_report.id,
                ip=host.ip,
                mac=host.mac,
                mac_vendor=host.mac_vendor,
                status=host.status,
                os=host.os,
            )
            db.add(db_host)
            await db.flush()

            for port in host.ports:
                db_port = PortModel(
                    host_id=db_host.id,
                    portid=port.portid,
                    protocol=port.protocol,
                    state=port.state,
                    reason=port.reason,
                    service=port.service,
                    version=port.version,
                    cpe=_json.dumps(port.cpe) if port.cpe else None,
                    cves=_json.dumps(
                        [c.model_dump() for c in port.cves]
                    ) if port.cves else None,
                )
                db.add(db_port)
                total_ports += 1
                if port.cves:
                    total_cves += len(port.cves)

        await db.commit()
        logger.info(
            f"[scan] ✅ Reporte id={db_report.id} guardado: "
            f"{len(report.hosts)} hosts, {total_ports} puertos, "
            f"{total_cves} CVEs"
        )

        return {
            "status": "success",
            "report_id": db_report.id,
            "hosts_count": len(report.hosts),
            "ports_count": total_ports,
            "cves_count": total_cves,
            "message": f"Escaneo de {report.target} guardado (Reporte ID: {db_report.id}).",
        }

    except SQLAlchemyError as e:
        await db.rollback()
        logger.exception("[scan] ❌ Error de base de datos al guardar el reporte")
        raise HTTPException(
            status_code=500,
            detail=f"Error de base de datos: {type(e).__name__}: {e}",
        )

    except Exception as e:
        await db.rollback()
        logger.exception("[scan] ❌ Error inesperado al guardar el reporte")
        raise HTTPException(
            status_code=500,
            detail=f"Error inesperado: {type(e).__name__}: {e}",
        )
