"""
Fixtures compartidas de la suite de tests.

Diseño
------
- NO levantamos Postgres ni Redis. Los tests que necesitan I/O se
  mockean a nivel de servicio.
- NO instalamos `fakeredis`, `respx`, `aiosqlite`. Usamos lo que ya
  viene en `requirements.txt` + stdlib.
- Los imports de `app.*` se hacen DENTRO de las fixtures para que
  pytest no cargue la app antes de que el entorno esté listo.
"""

from __future__ import annotations

import os
from typing import AsyncGenerator, Generator

import pytest


# ==========================================================
# ENV MÍNIMO
# ----------------------------------------------------------
# Algunos módulos leen settings al importar (config.py).
# Definimos valores dummy antes de cualquier import de `app.*`.
# ==========================================================
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test_db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("CVE_CACHE_TTL_S", "3600")
os.environ.setdefault("CVE_CACHE_REQUIRED", "false")
os.environ.setdefault("NVD_API_KEY", "")
os.environ.setdefault("NVD_BASE_URL", "https://services.nvd.nist.gov/rest/json/cves/2.0")
os.environ.setdefault("NVD_TIMEOUT_S", "5")
os.environ.setdefault("NVD_MAX_RESULTS_PER_ITEM", "25")
os.environ.setdefault("NVD_SOFT_FAIL", "true")


# ==========================================================
# FIXTURES DE ENV
# ==========================================================
@pytest.fixture(scope="session")
def anyio_backend() -> str:
    """Backend de anyio para pytest-asyncio (solo asyncio)."""
    return "asyncio"


@pytest.fixture
def clean_env(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    """
    Limpia variables de entorno NVD antes del test.
    Útil para tests que comprueban el fallback sin API key.
    """
    for k in ("NVD_API_KEY", "NVD_SOFT_FAIL", "NVD_TIMEOUT_S"):
        monkeypatch.delenv(k, raising=False)
    yield


# ==========================================================
# FIXTURES DE HTTP MOCK
# ----------------------------------------------------------
# httpx.MockTransport permite interceptar requests sin instalar
# respx. Se lo pasamos al cliente del NvdClient.
# ==========================================================
@pytest.fixture
def mock_transport_factory():
    """
    Devuelve una factory de `httpx.MockTransport`:

        transport = mock_transport_factory({"/rest/json/cves/2.0": {"vulnerabilities": []}})
        # o con callable:
        transport = mock_transport_factory(lambda req: httpx.Response(200, json={...}))
    """
    import httpx

    def _factory(response_map):
        def handler(request: httpx.Request) -> httpx.Response:
            # response_map puede ser dict[path → payload] o callable(request)
            if callable(response_map):
                return response_map(request)

            path = request.url.path
            for key, payload in response_map.items():
                if key in path:
                    if isinstance(payload, httpx.Response):
                        return payload
                    return httpx.Response(200, json=payload)
            return httpx.Response(404, json={"error": "not found"})

        return httpx.MockTransport(handler)

    return _factory


# ==========================================================
# FIXTURES DE APP (FastAPI)
# ----------------------------------------------------------
# Para tests que NO necesitan DB, reemplazamos `get_db` por un stub
# que devuelve None. Los endpoints de CVEs no tocan la DB.
# ==========================================================
@pytest.fixture
async def app_client() -> AsyncGenerator:
    """
    Devuelve un `httpx.AsyncClient` con ASGITransport contra la app.
    Parchea el lifespan para que NO intente conectar a Postgres/Redis.
    """
    import httpx
    from httpx import ASGITransport

    # Importamos la app
    from app.main import app

    # Parcheamos el lifespan: hacemos que sea no-op para tests.
    # Sobrescribimos el router lifespan de la app con un no-op.
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _noop_lifespan(_app):
        yield

    # Guardamos el original por si otro test lo necesita.
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.router.lifespan_context = original_lifespan


# ==========================================================
# FIXTURES DE NVD
# ==========================================================
@pytest.fixture
def sample_nvd_response():
    """
    Respuesta mínima de NVD API v2 para un CVE con rango de versiones.
    Útil para tests de parseo y filtrado.
    """
    return {
        "resultsPerPage": 1,
        "startIndex": 0,
        "totalResults": 1,
        "vulnerabilities": [
            {
                "cve": {
                    "id": "CVE-2024-12345",
                    "descriptions": [
                        {"lang": "en", "value": "Test vulnerability for OpenSSH 9.x."}
                    ],
                    "metrics": {
                        "cvssMetricV31": [
                            {
                                "cvssData": {
                                    "baseScore": 9.8,
                                    "baseSeverity": "CRITICAL",
                                }
                            }
                        ]
                    },
                    "weaknesses": [
                        {
                            "description": [
                                {"lang": "en", "value": "CWE-787"}
                            ]
                        }
                    ],
                    "configurations": [
                        {
                            "nodes": [
                                {
                                    "cpeMatch": [
                                        {
                                            "vulnerable": True,
                                            "criteria": "cpe:2.3:a:openbsd:openssh:*:*:*:*:*:*:*:*",
                                            "versionStartIncluding": "9.0",
                                            "versionEndExcluding": "9.8",
                                        }
                                    ]
                                }
                            ]
                        }
                    ],
                }
            }
        ],
    }


@pytest.fixture
def sample_nvd_empty():
    """Respuesta de NVD sin vulnerabilidades."""
    return {
        "resultsPerPage": 0,
        "startIndex": 0,
        "totalResults": 0,
        "vulnerabilities": [],
    }
