"""
Matching de CVEs contra NVD API v2.

Entrada: lista de items con {service, version, cpe[]}.
Salida:  lista de items con {service, version, cpes, cves[]}.

Estrategia
----------
1. Si el item trae CPEs (los extrae el parser de Nmap), los usamos
   tal cual contra NVD con ``virtualMatchString``.
2. Si no trae CPEs, intentamos construirlos con una tabla heurística
   de ``service → { vendor, product }``.
3. Si NVD falla y ``NVD_SOFT_FAIL=True``, devolvemos [] para ese item.

Cache
-----
Consultamos ``cve_cache`` antes de ir a NVD. La key incluye el CPE
(o el par service/version) para no colisionar.

Rate limit
----------
NVD sin API key permite 5 req / 30s (≈ 0.17 req/s).
Con API key permite 50 req / 30s (≈ 1.67 req/s).

Para no comernos un 429, usamos:
  - Un ``asyncio.Semaphore(1)`` que serializa las llamadas.
  - Un ``asyncio.Lock`` + timestamp para forzar un mínimo de
    ``_MIN_INTERVAL_S`` entre requests consecutivos.
  - Retry con backoff exponencial ante 429 / 5xx.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Iterable, Optional

import httpx

from app.core.config import settings
from app.services.cve_cache import cve_cache

logger = logging.getLogger("uvicorn.error")


# ==========================================================
# TABLA HEURÍSTICA service → CPE (vendor, product)
# ----------------------------------------------------------
# Sólo cubrimos los servicios más comunes. Si no hay entrada,
# no inventamos CPE y caemos al matching por keyword de NVD.
# ==========================================================
_SERVICE_CPE_MAP: dict[str, tuple[str, str]] = {
    "ssh":           ("openbsd", "openssh"),
    "openssh":       ("openbsd", "openssh"),
    "http":          ("apache", "http_server"),
    "https":         ("apache", "http_server"),
    "apache":        ("apache", "http_server"),
    "nginx":         ("nginx", "nginx"),
    "ftp":           ("vsftpd", "vsftpd"),
    "vsftpd":        ("vsftpd", "vsftpd"),
    "proftpd":       ("proftpd", "proftpd"),
    "smtp":          ("postfix", "postfix"),
    "postfix":       ("postfix", "postfix"),
    "mysql":         ("oracle", "mysql"),
    "mariadb":       ("mariadb", "mariadb"),
    "postgresql":    ("postgresql", "postgresql"),
    "postgres":      ("postgresql", "postgresql"),
    "redis":         ("redis", "redis"),
    "mongodb":       ("mongodb", "mongodb"),
    "rdp":           ("microsoft", "remote_desktop_protocol"),
    "microsoft-ds":  ("microsoft", "windows"),
    "smb":           ("microsoft", "windows"),
    "samba":         ("samba", "samba"),
    "dns":           ("isc", "bind"),
    "bind":          ("isc", "bind"),
    "tomcat":        ("apache", "tomcat"),
    "jenkins":       ("jenkins", "jenkins"),
    "docker":        ("docker", "docker"),
    "elasticsearch": ("elastic", "elasticsearch"),
}

# Palabras que Nmap mete en el campo version y que rompen el
# matching si van dentro del CPE. Las usamos para limpiar.
_VERSION_NOISE = re.compile(
    r"(?:\(.*?\)|\[.*?\]|\bubuntu\b|\bdebian\b|\bcentos\b|\brhel\b|"
    r"\bfedora\b|\balpine\b|\bwindows\b|\blinux\b|\bgeneric\b)",
    re.IGNORECASE,
)

# Regex para extraer "X.Y.Z" (o "X.Y") de un string como
# "Apache httpd 2.4.49" o "OpenSSH 8.2p1".
_VERSION_RE = re.compile(r"(\d+\.\d+(?:\.\d+)?(?:[a-zA-Z]\d*)?)")


# ==========================================================
# HELPERS DE NORMALIZACIÓN
# ==========================================================
def _clean_version(version: str) -> str:
    """
    Limpia un campo ``version`` de Nmap y devuelve solo la parte
    numérica (2.4.49, 8.2, 8.2p1...). Si no encuentra nada,
    devuelve el string limpio tal cual.
    """
    if not version:
        return ""
    v = _VERSION_NOISE.sub(" ", version).strip()
    # Si Nmap puso "2.4.49-1ubuntu4" nos quedamos con "2.4.49".
    match = _VERSION_RE.search(v)
    return match.group(1) if match else v


def _build_cpe(service: str, version: str) -> Optional[str]:
    """
    Construye un CPE 2.3 heurístico a partir de service+version.
    Devuelve ``None`` si no hay entrada en el mapa.
    """
    if not service:
        return None
    svc = service.strip().lower()
    entry = _SERVICE_CPE_MAP.get(svc)
    if not entry:
        return None
    vendor, product = entry
    ver = _clean_version(version) or "*"
    # Escapamos ':' por si acaso (raro, pero NVD lo rechaza).
    ver = ver.replace(":", "\\:")
    return f"cpe:2.3:a:{vendor}:{product}:{ver}:*:*:*:*:*:*:*"


def _normalize_cpe_list(cpes: Iterable[str]) -> list[str]:
    """
    Deja sólo CPEs 2.3 bien formados y no vacíos.
    """
    out: list[str] = []
    for cpe in cpes:
        if not cpe:
            continue
        c = cpe.strip()
        if c.startswith("cpe:2.3:"):
            out.append(c)
    return out


# ==========================================================
# NVD CLIENT
# ==========================================================
# Intervalo mínimo entre requests consecutivos a NVD.
# Sin API key: 6s garantiza no acercarse al límite de 5/30s.
# Con API key: 0.7s es más que suficiente para 50/30s.
_MIN_INTERVAL_S = 0.7 if settings.NVD_API_KEY else 6.0

# Reintentos ante 429 / 5xx.
_MAX_RETRIES = 3
_BACKOFF_BASE_S = 2.0


class NvdClient:
    def __init__(self) -> None:
        headers = {"User-Agent": "LESSSO-C2/0.1 (+https://localhost)"}
        if settings.NVD_API_KEY:
            headers["apiKey"] = settings.NVD_API_KEY
        self._headers = headers
        self._client: Optional[httpx.AsyncClient] = None
        # Semáforo: sólo 1 request simultáneo contra NVD.
        self._sem = asyncio.Semaphore(1)
        # Lock + timestamp para forzar _MIN_INTERVAL_S entre requests.
        self._rate_lock = asyncio.Lock()
        self._last_request_ts: float = 0.0

    # ------------------------------------------------------
    # Ciclo de vida
    # ------------------------------------------------------
    async def start(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=settings.NVD_TIMEOUT_S,
                headers=self._headers,
                http2=False,
                follow_redirects=True,
            )
            logger.info(
                "[nvd] Cliente inicializado (key=%s, min_interval=%.1fs)",
                "sí" if settings.NVD_API_KEY else "no",
                _MIN_INTERVAL_S,
            )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------
    async def _wait_rate_limit(self) -> None:
        async with self._rate_lock:
            now = time.monotonic()
            elapsed = now - self._last_request_ts
            if elapsed < _MIN_INTERVAL_S:
                await asyncio.sleep(_MIN_INTERVAL_S - elapsed)
            self._last_request_ts = time.monotonic()

    # ------------------------------------------------------
    # HTTP con retry
    # ------------------------------------------------------
    async def _get_with_retry(
        self,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        if self._client is None:
            await self.start()
        assert self._client is not None

        last_exc: Optional[Exception] = None
        for attempt in range(1, _MAX_RETRIES + 1):
            await self._wait_rate_limit()
            async with self._sem:
                try:
                    r = await self._client.get(
                        settings.NVD_BASE_URL, params=params
                    )
                except httpx.HTTPError as exc:
                    last_exc = exc
                    logger.warning(
                        "[nvd] Intento %d/%d falló (red): %r",
                        attempt, _MAX_RETRIES, exc,
                    )
                else:
                    # 404 → no hay resultados, no es error.
                    if r.status_code == 404:
                        return {}
                    if r.status_code == 200:
                        try:
                            return r.json()
                        except Exception as exc:
                            last_exc = exc
                            logger.warning(
                                "[nvd] JSON inválido en intento %d: %r",
                                attempt, exc,
                            )
                    elif r.status_code in (429, 500, 502, 503, 504):
                        last_exc = httpx.HTTPStatusError(
                            f"HTTP {r.status_code}",
                            request=r.request,
                            response=r,
                        )
                        logger.warning(
                            "[nvd] Intento %d/%d HTTP %d",
                            attempt, _MAX_RETRIES, r.status_code,
                        )
                    else:
                        # 400, 403... no reintentamos.
                        r.raise_for_status()

            # Backoff exponencial antes del siguiente intento.
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_BACKOFF_BASE_S ** attempt)

        if last_exc is not None:
            raise last_exc
        raise RuntimeError("NVD request failed without exception")

    # ------------------------------------------------------
    # Búsquedas
    # ------------------------------------------------------
    async def search_by_cpe(
        self,
        cpe: str,
        max_results: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """
        NVD API v2 con ``virtualMatchString=cpe``.
        Devuelve lista de CVEs ya parseados.
        """
        params: dict[str, Any] = {
            "virtualMatchString": cpe,
            "resultsPerPage": max_results or settings.NVD_MAX_RESULTS_PER_ITEM,
        }
        data = await self._get_with_retry(params)
        return _parse_nvd_response(data)

    async def search_by_cve_id(self, cve_id: str) -> list[dict[str, Any]]:
        """
        NVD API v2 con ``cveId=<ID>``. Devuelve 0 ó 1 items.
        """
        params = {"cveId": cve_id}
        data = await self._get_with_retry(params)
        return _parse_nvd_response(data)


# ==========================================================
# PARSEO DE RESPUESTA NVD
# ==========================================================
_SEVERITY_MAP = {
    "CRITICAL": "critical",
    "HIGH":     "high",
    "MEDIUM":   "medium",
    "LOW":      "low",
    "NONE":     "unknown",
    "UNKNOWN":  "unknown",
}


def _pick_cvss(metrics: dict[str, Any]) -> tuple[Optional[float], str]:
    """
    Devuelve (score, severity) priorizando CVSS v4.0 > v3.1 > v3.0 > v2.
    """
    for key in ("cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        arr = metrics.get(key)
        if not arr:
            continue
        first = arr[0]
        cvss_data = first.get("cvssData", {}) if isinstance(first, dict) else {}
        score = cvss_data.get("baseScore")
        sev = (
            cvss_data.get("baseSeverity")
            or first.get("baseSeverity")
            or "UNKNOWN"
        )
        if score is not None:
            return float(score), _SEVERITY_MAP.get(str(sev).upper(), "unknown")
    return None, "unknown"


def _parse_nvd_response(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Convierte la respuesta cruda de NVD en una lista plana de CVEs
    con la forma que espera el frontend (CveMatchOut).
    """
    out: list[dict[str, Any]] = []
    vulns = payload.get("vulnerabilities") or []
    for item in vulns:
        cve = item.get("cve") or {}
        cve_id = cve.get("id")
        if not cve_id:
            continue
        metrics = cve.get("metrics") or {}
        score, severity = _pick_cvss(metrics)

        description = ""
        for d in cve.get("descriptions") or []:
            if d.get("lang") == "en":
                description = d.get("value", "")
                break
        if not description and cve.get("descriptions"):
            description = cve["descriptions"][0].get("value", "")

        # CWEs (opcional, útil si luego quieres mostrarlos)
        weaknesses: list[str] = []
        for w in cve.get("weaknesses") or []:
            for desc in w.get("description") or []:
                val = desc.get("value")
                if val and val.startswith("CWE-"):
                    weaknesses.append(val)

        out.append(
            {
                "id": cve_id,
                "severity": severity,
                "cvss": score,
                "source": "cpe",
                "description": description[:500] if description else None,
                "cwe": weaknesses[:5] if weaknesses else None,
            }
        )
    return out


# ==========================================================
# MATCHER
# ==========================================================
# Singleton del cliente. Lo exponemos como `nvd_client` (público)
# y como `_nvd_client` (alias retro-compatible con cve.py).
nvd_client = NvdClient()
_nvd_client = nvd_client  # alias por compatibilidad


async def init_matcher() -> None:
    await nvd_client.start()


async def close_matcher() -> None:
    await nvd_client.close()


async def match_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    items: [{"service": str, "version": str, "cpe": list[str]?}, ...]
    returns: [{"service", "version", "cpes", "cves", "source", "cached"}, ...]
    """
    results: list[dict[str, Any]] = []

    for it in items:
        service = (it.get("service") or "").strip()
        version = (it.get("version") or "").strip()
        raw_cpes = it.get("cpe") or []
        cpes = _normalize_cpe_list(raw_cpes)

        # Si no hay CPEs válidos, intentamos construirlos.
        if not cpes:
            built = _build_cpe(service, version)
            if built:
                cpes = [built]

        # Cache key: si hay CPEs, los unimos; si no, service|version.
        cache_ns = "|".join(sorted(cpes)) if cpes else f"{service}|{version}"

        cached = await cve_cache.get(cache_ns)
        if cached is not None:
            results.append(
                {
                    "service": service,
                    "version": version,
                    "cpes": cpes,
                    "cves": cached,
                    "source": "cache",
                    "cached": True,
                }
            )
            continue

        cves: list[dict[str, Any]] = []
        source = "nvd"

        if cpes:
            try:
                for cpe in cpes:
                    cves.extend(await nvd_client.search_by_cpe(cpe))
            except Exception:
                if settings.NVD_SOFT_FAIL:
                    logger.warning(
                        "[cve_matcher] NVD falló para service=%r version=%r; "
                        "devolviendo lista vacía",
                        service,
                        version,
                    )
                    cves = []
                    source = "fallback"
                else:
                    raise

        # Dedup por id, quedándonos con la mayor severidad.
        cves = _dedup_cves(cves)

        # Guardamos en cache sólo si hubo respuesta "real" (aunque sea []).
        if source == "nvd":
            await cve_cache.set(cache_ns, cves)

        results.append(
            {
                "service": service,
                "version": version,
                "cpes": cpes,
                "cves": cves,
                "source": source,
                "cached": False,
            }
        )

    return results


_SEVERITY_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1, "unknown": 0}


def _dedup_cves(cves: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for c in cves:
        cid = c.get("id")
        if not cid:
            continue
        prev = by_id.get(cid)
        if prev is None:
            by_id[cid] = c
            continue
        # Nos quedamos con la severidad más alta (o el cvss mayor).
        prev_sev = _SEVERITY_ORDER.get(str(prev.get("severity")), 0)
        new_sev = _SEVERITY_ORDER.get(str(c.get("severity")), 0)
        if new_sev > prev_sev:
            by_id[cid] = c
    return list(by_id.values())
