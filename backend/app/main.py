import logging
import os
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import engine, get_db
from app.db.models.scan import Base, HostModel, PortModel, ScanReportModel

# ==========================================================
# LOGGING
# ----------------------------------------------------------
# Usamos "uvicorn.error" para que el traceback salga en los
# mismos logs que el servidor. Sin esto, FastAPI traga las
# excepciones de HTTPException y NO imprime el stack trace.
# ==========================================================
logger = logging.getLogger("uvicorn.error")


# ==========================================================
# CICLO DE VIDA
# ----------------------------------------------------------
# Crea las tablas si no existen al arrancar.
# En producción: usar Alembic.
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
    yield
    logger.info("[shutdown] Cerrando engine...")
    await engine.dispose()


app = FastAPI(title="LESSSO C2 API", version="0.1.0", lifespan=lifespan)


# ==========================================================
# CORS — Restringido al Frontend (Tauri/Vite)
# ==========================================================
allowed_origins_str = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173,tauri://localhost,http://tauri.localhost",
)
ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================================
# SCHEMAS PYDANTIC
# ----------------------------------------------------------
# Los campos opcionales usan `= None` para aceptar `null`
# explícito en el JSON entrante (que es lo que envía el
# frontend cuando Nmap no detecta MAC/OS, etc.).
# ==========================================================
class PortInfo(BaseModel):
    portid: str
    protocol: str
    state: str
    reason: str
    service: str
    version: str


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


@app.post("/api/scans")
async def save_scan_result(
    report: ScanReport,
    db: AsyncSession = Depends(get_db),
):
    """
    Guarda un reporte de escaneo completo con sus hosts y puertos.

    Flujo:
      1. Insertar ScanReportModel.
      2. Flush (para obtener el id).
      3. Insertar HostModel(s).
      4. Flush (para obtener host ids).
      5. Insertar PortModel(s).
      6. Commit único al final.

    Si algo falla en cualquier paso → rollback total.
    """
    logger.info(
        f"[scan] Recibido reporte target={report.target!r} "
        f"hosts={len(report.hosts)} duration={report.scan_duration!r}"
    )

    try:
        # --- 1. Reporte principal ---
        db_report = ScanReportModel(
            target=report.target,
            scan_duration=report.scan_duration,
        )
        db.add(db_report)
        await db.flush()  # obtiene db_report.id sin commit
        logger.info(f"[scan] Reporte creado id={db_report.id}")

        # --- 2. Hosts y puertos ---
        total_ports = 0
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
            await db.flush()  # obtiene db_host.id

            for port in host.ports:
                db_port = PortModel(
                    host_id=db_host.id,
                    portid=port.portid,
                    protocol=port.protocol,
                    state=port.state,
                    reason=port.reason,
                    service=port.service,
                    version=port.version,
                )
                db.add(db_port)
                total_ports += 1

        # --- 3. Commit único ---
        await db.commit()
        logger.info(
            f"[scan] ✅ Reporte id={db_report.id} guardado: "
            f"{len(report.hosts)} hosts, {total_ports} puertos"
        )

        return {
            "status": "success",
            "report_id": db_report.id,
            "hosts_count": len(report.hosts),
            "ports_count": total_ports,
            "message": f"Escaneo de {report.target} guardado (Reporte ID: {db_report.id}).",
        }

    except SQLAlchemyError as e:
        await db.rollback()
        # logger.exception() imprime el TRACEBACK COMPLETO
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
