import json as _json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.db.models.scan import HostModel, PortModel, ScanReportModel
from app.db.models.user import UserModel
from app.db.models.finding import FindingModel
from app.core.security import get_current_user
from app.core.validators import validate_target_string

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/scans", tags=["scans"])

# ==========================================================
# SCHEMAS
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

    @field_validator("target")
    @classmethod
    def check_target_security(cls, v: str) -> str:
        return validate_target_string(v)

# ==========================================================
# ENDPOINTS
# ==========================================================
@router.post("")
async def save_scan_result(
    report: ScanReport,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)  # 🔒 CANDADO DE SEGURIDAD
):
    """
    Guarda un reporte de escaneo.  
    Protegido: Solo accesible con un JWT válido.
    """
    logger.info(
        f"[scan] Usuario {current_user.username} guardando reporte target={report.target!r} "
        f"hosts={len(report.hosts)} duration={report.scan_duration!r}"
    )

    try:
        db_report = ScanReportModel(
            target=report.target,
            scan_duration=report.scan_duration,
        )
        db.add(db_report)
        await db.flush()

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
                # 1. Guardamos el puerto (sin los CVEs serializados en JSON)
                db_port = PortModel(
                    host_id=db_host.id,
                    portid=port.portid,
                    protocol=port.protocol,
                    state=port.state,
                    reason=port.reason,
                    service=port.service,
                    version=port.version,
                    cpe=_json.dumps(port.cpe) if port.cpe else None,
                )
                db.add(db_port)
                await db.flush() # Requerimos db_port.id para vincular los findings
                total_ports += 1
                
                # 2. Guardamos los CVEs relacionalmente en la tabla findings
                if port.cves:
                    for cve_match in port.cves:
                        db_finding = FindingModel(
                            port_id=db_port.id,
                            cve_id=cve_match.id,
                            severity=cve_match.severity,
                            cvss=cve_match.cvss,
                            description=cve_match.description,
                            source=cve_match.source
                        )
                        db.add(db_finding)
                        total_cves += 1

        await db.commit()
        return {
            "status": "success",
            "report_id": db_report.id,
            "hosts_count": len(report.hosts),
            "ports_count": total_ports,
            "cves_count": total_cves,
            "message": f"Escaneo de {report.target} guardado (Reporte ID: {db_report.id}).",
        }

    except SQLAlchemyError:
        await db.rollback()
        logger.exception("[scan] ❌ Error de base de datos al guardar el reporte")
        raise HTTPException(
            status_code=500,
            detail="Error interno al persistir el reporte en la base de datos.",
        )
    except Exception:
        await db.rollback()
        logger.exception("[scan] ❌ Error inesperado al guardar el reporte")
        raise HTTPException(
            status_code=500,
            detail="Error interno inesperado al procesar el escaneo.",
        )


# New function
@router.get("/{report_id}")
async def get_scan_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)  # 🔒 Protegido
):
    """
    Recupera un reporte de escaneo completo con todos sus hosts, puertos y CVEs.
    """
    # Gracias a lazy="selectin" en los modelos, esto trae toda la jerarquía 
    # (Report -> Hosts -> Ports -> Findings) automáticamente y sin N+1 queries.
    result = await db.execute(
        select(ScanReportModel).where(ScanReportModel.id == report_id)
    )
    report_db = result.scalars().first()
    
    if not report_db:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
        
    # Mapeamos los modelos relacionales de vuelta a diccionarios limpios para la API
    hosts_list = []
    for host in report_db.hosts:
        ports_list = []
        for port in host.ports:
            # Reconstruimos los CVEs desde la tabla normalizada Findings
            cves_list = []
            for finding in port.findings:
                cves_list.append({
                    "id": finding.cve_id,
                    "severity": finding.severity,
                    "cvss": finding.cvss,
                    "description": finding.description,
                    "source": finding.source
                })
            
            ports_list.append({
                "portid": port.portid,
                "protocol": port.protocol,
                "state": port.state,
                "reason": port.reason,
                "service": port.service,
                "version": port.version,
                "cpe": _json.loads(port.cpe) if port.cpe else None,
                "cves": cves_list if cves_list else None
            })
        
        hosts_list.append({
            "ip": host.ip,
            "mac": host.mac,
            "mac_vendor": host.mac_vendor,
            "status": host.status,
            "os": host.os,
            "ports": ports_list
        })
        
    return {
        "id": report_db.id,
        "target": report_db.target,
        "scan_duration": report_db.scan_duration,
        "created_at": report_db.created_at,
        "hosts": hosts_list
    }
