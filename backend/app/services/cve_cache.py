"""
Cache de CVEs sobre Redis (async).

Diseño
------
- Key:  ``cve:match:{sha1(namespace)}``
- Valor: JSON serializado (str) con la lista de CveMatchOut.
- TTL:  configurable (por defecto 24h).

Degradación
-----------
Si Redis no está disponible al inicializar, ``enabled=False`` y
todos los métodos se comportan como no-op. El matcher sigue
funcionando, sólo pierde el cacheo. Nunca lanzamos excepción
por un fallo de Redis: la API de CVEs es best-effort.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")


class CveCache:
    def __init__(self) -> None:
        self._client: Optional[aioredis.Redis] = None
        self._enabled: bool = False
        self._ttl: int = settings.CVE_CACHE_TTL_S

    # ------------------------------------------------------
    # Ciclo de vida
    # ------------------------------------------------------
    async def init(self) -> None:
        """
        Intenta conectar a Redis. Si falla, deja el cache
        deshabilitado y sigue. No propaga excepciones.
        """
        try:
            client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=3,
                health_check_interval=30,
            )
            # Ping explícito para verificar que responde.
            await client.ping()
            self._client = client
            self._enabled = True
            logger.info(
                "[cve_cache] Redis OK → url=%s ttl=%ss",
                settings.REDIS_URL,
                self._ttl,
            )
        except Exception as exc:  # pragma: no cover
            self._client = None
            self._enabled = False
            msg = f"[cve_cache] Redis no disponible ({exc!r}); cache deshabilitado"
            if settings.CVE_CACHE_REQUIRED:
                logger.error(msg)
                raise
            logger.warning(msg)

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:  # pragma: no cover
                logger.exception("[cve_cache] Error cerrando Redis")
            finally:
                self._client = None
                self._enabled = False

    @property
    def enabled(self) -> bool:
        return self._enabled and self._client is not None

    # ------------------------------------------------------
    # API
    # ------------------------------------------------------
    @staticmethod
    def _hash_key(namespace: str) -> str:
        digest = hashlib.sha1(namespace.encode("utf-8")).hexdigest()
        return f"cve:match:{digest}"

    async def get(self, namespace: str) -> Optional[list[dict[str, Any]]]:
        if not self.enabled:
            return None
        try:
            raw = await self._client.get(self._hash_key(namespace))  # type: ignore[union-attr]
            if raw is None:
                return None
            data = json.loads(raw)
            if isinstance(data, list):
                return data
            return None
        except Exception:
            logger.exception("[cve_cache] Error en GET (namespace=%s)", namespace)
            return None

    async def set(
        self,
        namespace: str,
        value: list[dict[str, Any]],
        ttl: Optional[int] = None,
    ) -> None:
        if not self.enabled:
            return
        try:
            raw = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            await self._client.set(  # type: ignore[union-attr]
                self._hash_key(namespace),
                raw,
                ex=ttl or self._ttl,
            )
        except Exception:
            logger.exception("[cve_cache] Error en SET (namespace=%s)", namespace)

    async def delete(self, namespace: str) -> None:
        if not self.enabled:
            return
        try:
            await self._client.delete(self._hash_key(namespace))  # type: ignore[union-attr]
        except Exception:
            logger.exception("[cve_cache] Error en DEL (namespace=%s)", namespace)


# Singleton (se inicializa en el lifespan de FastAPI)
cve_cache = CveCache()
