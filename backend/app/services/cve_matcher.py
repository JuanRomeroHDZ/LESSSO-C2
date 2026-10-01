"""
Matching de CVEs contra NVD API v2 con filtrado por versión.

Entrada: lista de items con {service, version, cpe[]}.
Salida:  lista de items con {service, version, cpes, cves[]}.

Estrategia
----------
1. Si el item trae CPEs (los extrae el parser de Nmap), los usamos
   tal cual contra NVD con ``virtualMatchString``.
2. Si no trae CPEs, intentamos construirlos con una tabla heurística
   de ``service → { vendor, product }``.
3. Tras recibir los CVEs de NVD, FILTRAMOS por versión real usando
   los rangos (`versionStartIncluding`, `versionEndExcluding`, etc.)
   que NVD expone en `configurations[].nodes[].cpeMatch[]`.
   Esto elimina CVEs irrelevantes (ej: CVE de OpenSSH 2.x en un 9.9).
4. Si NVD falla y ``NVD_SOFT_FAIL=True``, devolvemos [] para ese item.

Cache
-----
Consultamos ``cve_cache`` antes de ir a NVD. La key incluye el CPE
(o el par service/version) para no colisionar.

Rate limit
----------
NVD sin API key: 5 req / 30s. Con API key: 50 req / 30s.
Serializamos con Semaphore(1) + intervalo mínimo entre requests.
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

_VERSION_NOISE = re.compile(
    r"(?:\(.*?\)|\[.*?\]|\bubuntu\b|\bdebian\b|\bcentos\b|\brhel\b|"
    r"\bfedora\b|\balpine\b|\bwindows\b|\blinux\b|\bgeneric\b)",
    re.IGNORECASE,
)

_VERSION_RE = re.compile(r"(\d+\.\d+(?:\.\d+)?(?:[a-zA-Z]\d*)?)")


# ==========================================================
# HELPERS DE NORMALIZACIÓN
# ==========================================================
def _clean_version(version: str) -> str:
    if not version:
        return ""
    v = _VERSION_NOISE.sub(" ", version).strip()
    match = _VERSION_RE.search(v)
    return match.group(1) if match else v


def _build_cpe(service: str, version: str) -> Optional[str]:
    if not service:
        return None
    svc = service.strip().lower()
    entry = _SERVICE_CPE_MAP.get(svc)
    if not entry:
        return None
    vendor, product = entry
    ver = _clean_version(version) or "*"
    ver = ver.replace(":", "\\:")
    return f"cpe:2.3:a:{vendor}:{product}:{ver}:*:*:*:*:*:*:*"


def _normalize_cpe_list(cpes: Iterable[str]) -> list[str]:
    out: list[str] = []
    for cpe in cpes:
        if not cpe:
            continue
        c = cpe.strip()
        if c.startswith("cpe:2.3:"):
            out.append(c)
    return out


# ==========================================================
# PARSER DE VERSIONES + COMPARADOR
# ----------------------------------------------------------
# Convertimos "9.9", "8.2p1", "2.4.49" a una tupla comparable:
#   ("9", "9", None)
#   ("8", "2", "p1")
#   ("2", "4", "49")
# Usamos strings para los segmentos no numéricos y comparamos
# segmento a segmento. Los "None" van al final.
# ==========================================================
_VERSION_TOKEN_RE = re.compile(r"(\d+|[a-zA-Z]+)")


def _version_key(version: str) -> tuple:
    """
    Convierte una versión a una tupla comparable.
    "9.9"     → (9, 9)
    "8.2p1"   → (8, 2, "p", 1)
    "2.4.49"  → (2, 4, 49)
    """
    if not version:
        return tuple()
    tokens = _VERSION_TOKEN_RE.findall(version)
    out: list = []
    for t in tokens:
        if t.isdigit():
            out.append(int(t))
        else:
            out.append(t.lower())
    return tuple(out)


def _cmp_version(a: tuple, b: tuple) -> int:
    """
    Compara dos tuplas de versión segmento a segmento.
    Devuelve -1, 0, 1.
    Intenta comparar int vs int; si no puede, compara como strings.
    Los segmentos faltantes cuentan como -infinito (versión menor).
    """
    max_len = max(len(a), len(b))
    for i in range(max_len):
        va = a[i] if i < len(a) else None
        vb = b[i] if i < len(b) else None

        # None (segmento faltante) es menor que cualquier cosa.
        if va is None and vb is None:
            continue
        if va is None:
            return -1
        if vb is None:
            return 1

        # Mismo tipo → comparación directa.
        if isinstance(va, int) and isinstance(vb, int):
            if va < vb:
                return -1
            if va > vb:
                return 1
        else:
            # Mezcla int/str → convertir a str y comparar.
            sa, sb = str(va), str(vb)
            if sa < sb:
                return -1
            if sa > sb:
                return 1
    return 0


def _version_in_range(
    version: str,
    start_including: Optional[str] = None,
    start_excluding: Optional[str] = None,
    end_including: Optional[str] = None,
    end_excluding: Optional[str] = None,
) -> bool:
    """
    Devuelve True si `version` cae dentro del rango especificado.
    Los límites None se ignoran.
    """
    if not version:
        return False
    v = _version_key(_clean_version(version))

    if start_including is not None:
        if _cmp_version(v, _version_key(start_including)) < 0:
            return False
    if start_excluding is not None:
        if _cmp_version(v, _version_key(start_excluding)) <= 0:
            return False
    if end_including is not None:
        if _cmp_version(v, _version_key(end_including)) > 0:
            return False
    if end_excluding is not None:
        if _cmp_version(v, _version_key(end_excluding)) >= 0:
            return False
    return True


def _extract_vulnerable_ranges(
    configurations: list[dict[str, Any]],
    target_vendor: str,
    target_product: str,
) -> list[dict[str, Any]]:
    """
    Extrae los rangos de versión vulnerables de `configurations` que
    matchean el vendor+product objetivo.

    Estructura típica de NVD:
      configurations: [
        {
          nodes: [
            {
              cpeMatch: [
                {
                  criteria: "cpe:2.3:a:openbsd:openssh:*:*:*:*:*:*:*:*",
                  versionStartIncluding: "8.5",
                  versionEndExcluding: "9.8",
                  vulnerable: true
                }
              ]
            }
          ]
        }
      ]

    Devuelve lista de rangos: {start_including, start_excluding,
    end_including, end_excluding}. Lista vacía = no hay configuración
    útil (consideramos "aplica siempre").
    """
    ranges: list[dict[str, Any]] = []

    for config in configurations or []:
        for node in config.get("nodes") or []:
            for match in node.get("cpeMatch") or []:
                if not match.get("vulnerable"):
                    continue
                criteria = match.get("criteria", "")
                if not criteria.startswith("cpe:2.3:"):
                    continue

                parts = criteria.split(":")
                if len(parts) < 5:
                    continue

                vendor = parts[3].lower()
                product = parts[4].lower()

                # Match flexible: aceptamos wildcards.
                if vendor not in (target_vendor, "*"):
                    if target_vendor != "*" and vendor != target_vendor:
                        continue
                if product not in (target_product, "*"):
                    if target_product != "*" and product != target_product:
                        continue

                ranges.append({
                    "start_including": match.get("versionStartIncluding"),
                    "start_excluding": match.get("versionStartExcluding"),
                    "end_including": match.get("versionEndIncluding"),
                    "end_excluding": match.get("versionEndExcluding"),
                })

    return ranges


def _cve_applies_to_version(
    cve: dict[str, Any],
    version: str,
    vendor: str,
    product: str,
) -> bool:
    """
    Determina si un CVE aplica a la versión detectada.

    Reglas:
      1. Si no hay `configurations` → asumimos que aplica (conservador).
      2. Si hay configuraciones pero NINGUNA matchea vendor/product →
         no aplica.
      3. Si hay configuraciones que matchean, verificamos si la
         versión cae en algún rango. Si cae → aplica.
      4. Si una config tiene CPE sin rango (versión exacta en el
         criteria) → comparamos esa versión exacta.
    """
    if not version:
        return True  # sin versión, no podemos filtrar

    configurations = cve.get("_configurations") or []
    if not configurations:
        return True

    ranges = _extract_vulnerable_ranges(configurations, vendor, product)
    if not ranges:
        # Ninguna config matchea el vendor/product.
        # Pero podría ser un CVE sin info de versión.
        # Revisemos si hay configs con el product pero sin rangos.
        for config in configurations:
            for node in config.get("nodes") or []:
                for match in node.get("cpeMatch") or []:
                    if not match.get("vulnerable"):
                        continue
                    criteria = match.get("criteria", "")
                    parts = criteria.split(":")
                    if len(parts) < 6:
                        continue
                    v = parts[4].lower()
                    if v != product:
                        continue
                    # Matchea product. ¿Tiene versión exacta?
                    exact_version = parts[5]
                    if exact_version and exact_version != "*":
                        if _cmp_version(
                            _version_key(_clean_version(version)),
                            _version_key(exact_version),
                        ) == 0:
                            return True
        return False

    # Verificar rangos.
    for r in ranges:
        if _version_in_range(
            version,
            start_including=r.get("start_including"),
            start_excluding=r.get("start_excluding"),
            end_including=r.get("end_including"),
            end_excluding=r.get("end_excluding"),
        ):
            return True
    return False


# ==========================================================
# NVD CLIENT
# ==========================================================
_MIN_INTERVAL_S = 0.7 if settings.NVD_API_KEY else 6.0
_MAX_RETRIES = 3
_BACKOFF_BASE_S = 2.0


class NvdClient:
    def __init__(self) -> None:
        headers = {"User-Agent": "LESSSO-C2/0.1 (+https://localhost)"}
        if settings.NVD_API_KEY:
            headers["apiKey"] = settings.NVD_API_KEY
        self._headers = headers
        self._client: Optional[httpx.AsyncClient] = None
        self._sem = asyncio.Semaphore(1)
        self._rate_lock = asyncio.Lock()
        self._last_request_ts: float = 0.0

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

    async def _wait_rate_limit(self) -> None:
        async with self._rate_lock:
            now = time.monotonic()
            elapsed = now - self._last_request_ts
            if elapsed < _MIN_INTERVAL_S:
                await asyncio.sleep(_MIN_INTERVAL_S - elapsed)
            self._last_request_ts = time.monotonic()

    async def _get_with_retry(self, params: dict[str, Any]) -> dict[str, Any]:
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
                        r.raise_for_status()

            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_BACKOFF_BASE_S ** attempt)

        if last_exc is not None:
            raise last_exc
        raise RuntimeError("NVD request failed without exception")

    async def search_by_cpe(
        self,
        cpe: str,
        max_results: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {
            "virtualMatchString": cpe,
            "resultsPerPage": max_results or settings.NVD_MAX_RESULTS_PER_ITEM,
        }
        data = await self._get_with_retry(params)
        return _parse_nvd_response(data)

    async def search_by_cve_id(self, cve_id: str) -> list[dict[str, Any]]:
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
    Convierte la respuesta cruda de NVD en una lista plana de CVEs.
    Guarda `_configurations` para el filtrado por versión posterior.
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
                "_configurations": cve.get("configurations") or [],
            }
        )
    return out


# ==========================================================
# MATCHER
# ==========================================================
nvd_client = NvdClient()
_nvd_client = nvd_client


async def init_matcher() -> None:
    await nvd_client.start()


async def close_matcher() -> None:
    await nvd_client.close()


async def match_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []

    for it in items:
        service = (it.get("service") or "").strip()
        version = (it.get("version") or "").strip()
        raw_cpes = it.get("cpe") or []
        cpes = _normalize_cpe_list(raw_cpes)

        # Extraer vendor/product del CPE para filtrar después.
        vendor, product = _extract_vendor_product(cpes, service)

        if not cpes:
            built = _build_cpe(service, version)
            if built:
                cpes = [built]
                parts = built.split(":")
                if len(parts) >= 5:
                    vendor, product = parts[3].lower(), parts[4].lower()

        cache_ns = "|".join(sorted(cpes)) if cpes else f"{service}|{version}"

        cached = await cve_cache.get(cache_ns)
        if cached is not None:
            filtered = _filter_by_version(cached, version, vendor, product)
            results.append({
                "service": service,
                "version": version,
                "cpes": cpes,
                "cves": filtered,
                "source": "cache",
                "cached": True,
            })
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

        cves = _dedup_cves(cves)
        cves = _filter_by_version(cves, version, vendor, product)

        if source == "nvd":
            await cve_cache.set(cache_ns, cves)

        results.append({
            "service": service,
            "version": version,
            "cpes": cpes,
            "cves": cves,
            "source": source,
            "cached": False,
        })

    return results


def _extract_vendor_product(
    cpes: list[str],
    service: str,
) -> tuple[str, str]:
    """
    Extrae vendor/product de la lista de CPEs. Si no hay, usa la
    tabla heurística. Fallback: ("*", "*").
    """
    for cpe in cpes:
        parts = cpe.split(":")
        if len(parts) >= 5:
            return parts[3].lower(), parts[4].lower()
    svc = service.strip().lower()
    entry = _SERVICE_CPE_MAP.get(svc)
    if entry:
        return entry
    return ("*", "*")


def _filter_by_version(
    cves: list[dict[str, Any]],
    version: str,
    vendor: str,
    product: str,
) -> list[dict[str, Any]]:
    """
    Filtra CVEs que no aplican a la versión detectada.
    Elimina `_configurations` del output final (era metadata interna).
    """
    if not version:
        for c in cves:
            c.pop("_configurations", None)
        return cves

    out: list[dict[str, Any]] = []
    for c in cves:
        if _cve_applies_to_version(c, version, vendor, product):
            c.pop("_configurations", None)
            out.append(c)
    return out


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
        prev_sev = _SEVERITY_ORDER.get(str(prev.get("severity")), 0)
        new_sev = _SEVERITY_ORDER.get(str(c.get("severity")), 0)
        if new_sev > prev_sev:
            by_id[cid] = c
    return list(by_id.values())
