import json as _json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.db.models.scan import HostModel, PortModel, ScanReportModel, FindingModel
from app.db.models.user import UserModel
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
    Guarda un reporte de escaneo normalizado.
    Optimizado para inserción en bloque (sin flushes intermedios excesivos).
    """
    logger.info(
        f"[scan] Usuario {current_user.username} guardando reporte target={report.target!r} "
        f"hosts={len(report.hosts)} duration={report.scan_duration!r}"
    )

    try:
        # 1. Crear Reporte
        db_report = ScanReportModel(
            target=report.target,
            scan_duration=report.scan_duration,
        )
        db.add(db_report)
        await db.flush() # Necesitamos el ID del reporte para los hosts

        total_ports = 0
        total_cves = 0
        
        # 2. Iterar Hosts
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
            await db.flush() # Necesitamos el ID del host para los puertos

            # 3. Iterar Puertos
            for port in host.ports:
                cpe_string = _json.dumps(port.cpe) if port.cpe else None
                db_port = PortModel(
                    host_id=db_host.id,
                    portid=port.portid,
                    protocol=port.protocol,
                    state=port.state,
                    reason=port.reason,
                    service=port.service,
                    version=port.version,
                    cpe=cpe_string,
                )
                db.add(db_port)
                await db.flush() # Necesitamos el ID del puerto para los findings
                total_ports += 1
                
                # 4. Insertar Hallazgos (CVEs) normalizados
                if port.cves:
                    for cve_match in port.cves:
                        # [CORRECCIÓN CRÍTICA]: Quitamos los CVEs de la columna JSON
                        # y los insertamos como registros individuales en la tabla Findings.
                        db_finding = FindingModel(
                            port_id=db_port.id,
                            cve_id=cve_match.id,
                            severity=cve_match.severity,
                            base_score=cve_match.cvss, # CVSS es nuestro base_score
                            description=cve_match.description,
                        )
                        db.add(db_finding)
                        total_cves += 1

        # Commit final que guarda toda la jerarquía de golpe (mucho más rápido)
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

@router.get("/{report_id}")
async def get_scan_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)  # 🔒 Protegido
):
    """
    Recupera un reporte de escaneo completo con todos sus hosts, puertos y CVEs normalizados.
    """
    result = await db.execute(
        select(ScanReportModel).where(ScanReportModel.id == report_id)
    )
    report_db = result.scalars().first()
    
    if not report_db:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
        
    hosts_list = []
    for host in report_db.hosts:
        ports_list = []
        for port in host.ports:
            # Reconstruimos los CVEs desde la tabla normalizada Findings
            cves_list = []
            for finding in port.findings:
                cves_list.append({
                    "id": finding.cve_id,
                    "severity": finding.severity or "unknown",
                    "cvss": finding.base_score,
                    "description": finding.description,
                    "source": "cpe" # Se asume por ahora
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
