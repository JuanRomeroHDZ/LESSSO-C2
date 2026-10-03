"""
Endpoints de CVEs.

- POST /api/cves/match  → recibe items, devuelve CVEs.
- GET  /api/cves/_status → diagnóstico seguro del cache.
- GET  /api/cves/{id}   → devuelve un CVE concreto (con cache).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services import cve_matcher
from app.services.cve_cache import cve_cache

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/cves", tags=["cves"])


# ==========================================================
# SCHEMAS
# ==========================================================
class CveMatchIn(BaseModel):
    service: str = ""
    version: str = ""
    cpe: Optional[list[str]] = None


class MatchRequest(BaseModel):
    items: list[CveMatchIn] = Field(default_factory=list)


class CveMatchOut(BaseModel):
    id: str
    severity: str = "unknown"
    cvss: Optional[float] = None
    source: str = "cpe"
    description: Optional[str] = None


class MatchResultItem(BaseModel):
    service: str
    version: str
    cpes: list[str] = Field(default_factory=list)
    cves: list[CveMatchOut] = Field(default_factory=list)
    source: str = "nvd"
    cached: bool = False


class MatchResponse(BaseModel):
    results: list[MatchResultItem] = Field(default_factory=list)


# ==========================================================
# HEALTH / DIAGNÓSTICO (Sanitizado)
# ==========================================================
@router.get("/_status")
async def cve_status() -> dict[str, Any]:
    """
    Endpoint de diagnóstico ofuscado. Expone únicamente la 
    disponibilidad operativa sin filtrar datos de infraestructura.
    """
    return {
        "status": "operational",
        "cache_enabled": cve_cache.enabled,
        "nvd_key_configured": bool(settings.NVD_API_KEY),
        "soft_fail": settings.NVD_SOFT_FAIL,
    }


# ==========================================================
# MATCH
# ==========================================================
@router.post("/match", response_model=MatchResponse)
async def match_cves(payload: MatchRequest) -> MatchResponse:
    if not payload.items:
        return MatchResponse(results=[])

    logger.info("[cves] match request items=%d", len(payload.items))

    try:
        raw = await cve_matcher.match_items([i.model_dump() for i in payload.items])
    except httpx.HTTPError as exc:
        logger.exception("[cves] Error HTTP contra proveedor externo (NVD)")
        raise HTTPException(
            status_code=502, 
            detail="Error de comunicación con el servicio externo de vulnerabilidades."
        )
    except Exception as exc:
        logger.exception("[cves] Error inesperado en el proceso de match")
        raise HTTPException(
            status_code=500, 
            detail="Error interno procesando las correlaciones de vulnerabilidad."
        )

    return MatchResponse(results=[MatchResultItem(**r) for r in raw])


# ==========================================================
# GET CVE POR ID
# ==========================================================
@router.get("/{cve_id}", response_model=Optional[CveMatchOut])
async def get_cve(cve_id: str) -> Optional[CveMatchOut]:
    """
    Devuelve un CVE por su ID.
    Cachea el resultado por 24h bajo ``cve:id:<ID>``.
    """
    cve_id = cve_id.strip().upper()
    if not cve_id.startswith("CVE-"):
        raise HTTPException(status_code=400, detail="Formato de CVE proporcionado es inválido")

    cached = await cve_cache.get(f"cve:id:{cve_id}")
    if cached:
        try:
            return CveMatchOut(**cached[0])
        except Exception:
            logger.warning("[cves] Cache corrupta para %s, refrescando desde el origen", cve_id)

    try:
        raw = await cve_matcher.nvd_client.search_by_cve_id(cve_id)
    except Exception as exc:
        logger.exception("[cves] Error en backend consultando la base de datos externa para %s", cve_id)
        raise HTTPException(
            status_code=502, 
            detail="Error temporal al consultar la información del CVE."
        )

    if not raw:
        raise HTTPException(status_code=404, detail=f"Identificador {cve_id} no encontrado")

    out = CveMatchOut(**raw[0])
    await cve_cache.set(f"cve:id:{cve_id}", [out.model_dump()])
    return out
