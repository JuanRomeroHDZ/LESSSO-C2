"""
Tests de los endpoints de CVEs:
- POST /api/cves/match
- GET  /api/cves/{cve_id}
- GET  /api/cves/_status

Estrategia
----------
No llamamos a NVD ni a Redis reales. Parcheamos:
  - `cve_matcher.match_items`      → devuelve resultados fijos
  - `cve_matcher.nvd_client`       → mock
  - `cve_cache` (get/set)          → AsyncMock

Usamos el `app_client` fixture que ya mockea el lifespan para
que no se intente conectar a Postgres.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


# ==========================================================
# POST /api/cves/match
# ==========================================================
class TestMatchEndpoint:
    @pytest.mark.asyncio
    async def test_empty_items_returns_empty_results(self, app_client):
        r = await app_client.post("/api/cves/match", json={"items": []})
        assert r.status_code == 200
        assert r.json() == {"results": []}

    @pytest.mark.asyncio
    async def test_match_returns_results(self, app_client):
        fake_results = [
            {
                "service": "ssh",
                "version": "9.6",
                "cpes": ["cpe:2.3:a:openbsd:openssh:9.6:*:*:*:*:*:*:*"],
                "cves": [
                    {
                        "id": "CVE-2024-12345",
                        "severity": "high",
                        "cvss": 8.1,
                        "source": "cpe",
                        "description": "Test CVE.",
                    }
                ],
                "source": "nvd",
                "cached": False,
            }
        ]

        with patch(
            "app.api.routes.cve.cve_matcher.match_items",
            new=AsyncMock(return_value=fake_results),
        ):
            r = await app_client.post(
                "/api/cves/match",
                json={"items": [{"service": "ssh", "version": "9.6", "cpe": []}]},
            )

        assert r.status_code == 200
        body = r.json()
        assert len(body["results"]) == 1
        assert body["results"][0]["service"] == "ssh"
        assert body["results"][0]["cves"][0]["id"] == "CVE-2024-12345"

    @pytest.mark.asyncio
    async def test_match_handles_http_error_from_nvd(self, app_client):
        import httpx

        with patch(
            "app.api.routes.cve.cve_matcher.match_items",
            new=AsyncMock(side_effect=httpx.HTTPError("NVD down")),
        ):
            r = await app_client.post(
                "/api/cves/match",
                json={"items": [{"service": "ssh", "version": "9.6"}]},
            )

        assert r.status_code == 502
        assert "NVD" in r.json()["detail"]

    @pytest.mark.asyncio
    async def test_match_handles_unexpected_error(self, app_client):
        with patch(
            "app.api.routes.cve.cve_matcher.match_items",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ):
            r = await app_client.post(
                "/api/cves/match",
                json={"items": [{"service": "ssh", "version": "9.6"}]},
            )

        assert r.status_code == 500


# ==========================================================
# GET /api/cves/{cve_id}
# ==========================================================
class TestGetCveEndpoint:
    @pytest.mark.asyncio
    async def test_invalid_format_returns_400(self, app_client):
        r = await app_client.get("/api/cves/not-a-cve")
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached(self, app_client):
        cached_payload = [
            {
                "id": "CVE-2024-12345",
                "severity": "high",
                "cvss": 8.1,
                "source": "cpe",
                "description": "Cached.",
            }
        ]

        with patch(
            "app.api.routes.cve.cve_cache.get",
            new=AsyncMock(return_value=cached_payload),
        ):
            r = await app_client.get("/api/cves/CVE-2024-12345")

        assert r.status_code == 200
        assert r.json()["id"] == "CVE-2024-12345"
        assert r.json()["description"] == "Cached."

    @pytest.mark.asyncio
    async def test_cache_miss_queries_nvd(self, app_client):
        nvd_result = [
            {
                "id": "CVE-2024-99999",
                "severity": "critical",
                "cvss": 9.8,
                "source": "cpe",
                "description": "Fresh from NVD.",
                "_configurations": [],
            }
        ]

        with patch(
            "app.api.routes.cve.cve_cache.get",
            new=AsyncMock(return_value=None),
        ), patch(
            "app.api.routes.cve.cve_cache.set",
            new=AsyncMock(),
        ), patch(
            "app.api.routes.cve.cve_matcher.nvd_client.search_by_cve_id",
            new=AsyncMock(return_value=nvd_result),
        ):
            r = await app_client.get("/api/cves/CVE-2024-99999")

        assert r.status_code == 200
        assert r.json()["id"] == "CVE-2024-99999"
        assert r.json()["severity"] == "critical"

    @pytest.mark.asyncio
    async def test_nvd_returns_empty_404(self, app_client):
        with patch(
            "app.api.routes.cve.cve_cache.get",
            new=AsyncMock(return_value=None),
        ), patch(
            "app.api.routes.cve.cve_matcher.nvd_client.search_by_cve_id",
            new=AsyncMock(return_value=[]),
        ):
            r = await app_client.get("/api/cves/CVE-2024-00000")

        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_nvd_error_returns_502(self, app_client):
        with patch(
            "app.api.routes.cve.cve_cache.get",
            new=AsyncMock(return_value=None),
        ), patch(
            "app.api.routes.cve.cve_matcher.nvd_client.search_by_cve_id",
            new=AsyncMock(side_effect=RuntimeError("NVD down")),
        ):
            r = await app_client.get("/api/cves/CVE-2024-12345")

        assert r.status_code == 502

    @pytest.mark.asyncio
    async def test_lowercase_cve_id_normalized(self, app_client):
        """El endpoint debe hacer .upper() del ID."""
        cached_payload = [
            {
                "id": "CVE-2024-12345",
                "severity": "high",
                "cvss": 8.1,
                "source": "cpe",
                "description": "Cached.",
            }
        ]

        with patch(
            "app.api.routes.cve.cve_cache.get",
            new=AsyncMock(return_value=cached_payload),
        ):
            r = await app_client.get("/api/cves/cve-2024-12345")

        assert r.status_code == 200


# ==========================================================
# GET /api/cves/_status
# ==========================================================
class TestStatusEndpoint:
    @pytest.mark.asyncio
    async def test_status_returns_diagnostics(self, app_client):
        r = await app_client.get("/api/cves/_status")
        assert r.status_code == 200
        body = r.json()
        assert "cache_enabled" in body
        assert "nvd_key_configured" in body
        assert "nvd_base_url" in body
        assert "nvd_timeout_s" in body
        assert "soft_fail" in body
        assert isinstance(body["cache_enabled"], bool)
        assert isinstance(body["nvd_key_configured"], bool)
        assert isinstance(body["soft_fail"], bool)
