"""
Endpoints de CVEs.

- POST /api/cves/match   → recibe items, devuelve CVEs.
- GET  /api/cves/_status → diagnóstico del cache y del cliente NVD.
- GET  /api/cves/{id}    → devuelve un CVE concreto (con cache).

⚠ ORDEN IMPORTANTE:
`/_status` debe declararse ANTES que `/{cve_id}`. FastAPI evalúa las
rutas en orden de declaración, y si `/{cve_id}` va primero, captura
`_status` como si fuera un ID (y devuelve 400 por formato inválido).

Ambos son best-effort: si NVD falla y NVD_SOFT_FAIL=True, se
devuelve 200 con listas vacías para no romper la UI.
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
# HEALTH / DIAGNÓSTICO
# ----------------------------------------------------------
# ⚠ DEBE IR ANTES que /{cve_id} (ver docstring del módulo).
# ==========================================================
@router.get("/_status")
async def cve_status() -> dict[str, Any]:
    """
    Pequeño endpoint de diagnóstico para saber si el cache y el
    matcher están operativos.
    """
    return {
        "cache_enabled": cve_cache.enabled,
        "nvd_key_configured": bool(settings.NVD_API_KEY),
        "nvd_base_url": settings.NVD_BASE_URL,
        "nvd_timeout_s": settings.NVD_TIMEOUT_S,
        "soft_fail": settings.NVD_SOFT_FAIL,
    }


# ==========================================================
# MATCH
# ==========================================================
@router.post("/match", response_model=MatchResponse)
async def match_cves(payload: MatchRequest) -> MatchResponse:
    """
    Recibe una lista de {service, version, cpe[]} y devuelve los
    CVEs asociados (con cacheo en Redis).
    """
    if not payload.items:
        return MatchResponse(results=[])

    logger.info("[cves] match request items=%d", len(payload.items))

    try:
        raw = await cve_matcher.match_items([i.model_dump() for i in payload.items])
    except httpx.HTTPError as exc:
        logger.exception("[cves] Error HTTP contra NVD")
        raise HTTPException(status_code=502, detail=f"NVD error: {exc}")
    except Exception as exc:
        logger.exception("[cves] Error inesperado en match")
        raise HTTPException(status_code=500, detail=f"Error interno: {exc}")

    return MatchResponse(results=[MatchResultItem(**r) for r in raw])


# ==========================================================
# GET CVE POR ID
# ----------------------------------------------------------
# ⚠ DEBE IR DESPUÉS que /_status (ver docstring del módulo).
# ==========================================================
@router.get("/{cve_id}", response_model=Optional[CveMatchOut])
async def get_cve(cve_id: str) -> Optional[CveMatchOut]:
    """
    Devuelve un CVE por su ID (formato ``CVE-YYYY-NNNN``).
    Cachea el resultado por 24h bajo ``cve:id:<ID>``.
    """
    cve_id = cve_id.strip().upper()
    if not cve_id.startswith("CVE-"):
        raise HTTPException(status_code=400, detail="Formato de CVE inválido")

    cached = await cve_cache.get(f"cve:id:{cve_id}")
    if cached:
        try:
            return CveMatchOut(**cached[0])
        except Exception:
            logger.warning("[cves] Cache corrupta para %s, refrescando", cve_id)

    try:
        raw = await cve_matcher.nvd_client.search_by_cve_id(cve_id)
    except Exception as exc:
        logger.exception("[cves] Error consultando %s", cve_id)
        raise HTTPException(status_code=502, detail=f"NVD error: {exc}")

    if not raw:
        raise HTTPException(status_code=404, detail=f"{cve_id} no encontrado")

    out = CveMatchOut(**raw[0])
    await cve_cache.set(f"cve:id:{cve_id}", [out.model_dump()])
    return out
