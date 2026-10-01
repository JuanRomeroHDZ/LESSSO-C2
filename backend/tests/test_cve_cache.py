"""
Tests del wrapper Redis (`CveCache`).

Estrategia
----------
NO instalamos `fakeredis`. Mockeamos el cliente async de Redis con
`unittest.mock.AsyncMock` y verificamos:
  1. Estado inicial: cache deshabilitado.
  2. init() exitoso → enabled=True.
  3. init() fallido (Redis caído) → enabled=False, sin excepción.
  4. init() fallido con CVE_CACHE_REQUIRED=true → propaga excepción.
  5. get() con cache deshabilitado → None.
  6. get() con JSON válido → lista.
  7. get() con JSON corrupto → None (no explota).
  8. set() serializa a JSON y usa la key correcta.
  9. delete() borra la key correcta.
 10. _hash_key() es determinista y estable.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.cve_cache import CveCache


# ==========================================================
# _hash_key
# ==========================================================
class TestHashKey:
    def test_deterministic(self):
        k1 = CveCache._hash_key("ssh|9.6")
        k2 = CveCache._hash_key("ssh|9.6")
        assert k1 == k2
        assert k1.startswith("cve:match:")

    def test_different_inputs_different_keys(self):
        assert CveCache._hash_key("a") != CveCache._hash_key("b")

    def test_length(self):
        # sha1 hex = 40 chars + prefix "cve:match:" = 10 chars
        assert len(CveCache._hash_key("x")) == 10 + 40


# ==========================================================
# init()
# ==========================================================
class TestInit:
    @pytest.mark.asyncio
    async def test_init_success(self, monkeypatch):
        cache = CveCache()

        fake_client = AsyncMock()
        fake_client.ping = AsyncMock(return_value=True)
        fake_client.aclose = AsyncMock()

        with patch(
            "app.services.cve_cache.aioredis.from_url",
            return_value=fake_client,
        ):
            await cache.init()

        assert cache.enabled is True
        assert cache._client is fake_client

    @pytest.mark.asyncio
    async def test_init_failure_disables_cache(self, monkeypatch):
        cache = CveCache()

        # Forzamos CVE_CACHE_REQUIRED=False
        monkeypatch.setattr(
            "app.services.cve_cache.settings.CVE_CACHE_REQUIRED", False
        )

        with patch(
            "app.services.cve_cache.aioredis.from_url",
            side_effect=ConnectionError("redis down"),
        ):
            await cache.init()

        assert cache.enabled is False
        assert cache._client is None

    @pytest.mark.asyncio
    async def test_init_failure_raises_if_required(self, monkeypatch):
        cache = CveCache()

        monkeypatch.setattr(
            "app.services.cve_cache.settings.CVE_CACHE_REQUIRED", True
        )

        with patch(
            "app.services.cve_cache.aioredis.from_url",
            side_effect=ConnectionError("redis down"),
        ):
            with pytest.raises(ConnectionError):
                await cache.init()

        assert cache.enabled is False


# ==========================================================
# close()
# ==========================================================
class TestClose:
    @pytest.mark.asyncio
    async def test_close_with_client(self):
        cache = CveCache()
        fake_client = AsyncMock()
        fake_client.aclose = AsyncMock()
        cache._client = fake_client
        cache._enabled = True

        await cache.close()

        fake_client.aclose.assert_awaited_once()
        assert cache._client is None
        assert cache.enabled is False

    @pytest.mark.asyncio
    async def test_close_without_client(self):
        cache = CveCache()
        # No debe explotar
        await cache.close()
        assert cache._client is None


# ==========================================================
# get()
# ==========================================================
class TestGet:
    @pytest.mark.asyncio
    async def test_get_disabled_returns_none(self):
        cache = CveCache()
        assert await cache.get("any") is None

    @pytest.mark.asyncio
    async def test_get_returns_parsed_json(self):
        cache = CveCache()
        payload = [{"id": "CVE-1", "severity": "high"}]
        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=json.dumps(payload))
        cache._client = fake_client
        cache._enabled = True

        out = await cache.get("ssh|9.6")
        assert out == payload

    @pytest.mark.asyncio
    async def test_get_returns_none_if_missing(self):
        cache = CveCache()
        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=None)
        cache._client = fake_client
        cache._enabled = True

        assert await cache.get("ssh|9.6") is None

    @pytest.mark.asyncio
    async def test_get_returns_none_on_corrupt_json(self):
        cache = CveCache()
        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value="{not-json")
        cache._client = fake_client
        cache._enabled = True

        assert await cache.get("ssh|9.6") is None

    @pytest.mark.asyncio
    async def test_get_returns_none_if_not_list(self):
        cache = CveCache()
        fake_client = AsyncMock()
        fake_client.get = AsyncMock(return_value=json.dumps({"not": "a list"}))
        cache._client = fake_client
        cache._enabled = True

        assert await cache.get("ssh|9.6") is None

    @pytest.mark.asyncio
    async def test_get_returns_none_on_redis_error(self):
        cache = CveCache()
        fake_client = AsyncMock()
        fake_client.get = AsyncMock(side_effect=RuntimeError("boom"))
        cache._client = fake_client
        cache._enabled = True

        assert await cache.get("ssh|9.6") is None


# ==========================================================
# set()
# ==========================================================
class TestSet:
    @pytest.mark.asyncio
    async def test_set_disabled_is_noop(self):
        cache = CveCache()
        # No debe explotar
        await cache.set("k", [{"id": "CVE-1"}])

    @pytest.mark.asyncio
    async def test_set_serializes_and_uses_key(self, monkeypatch):
        cache = CveCache()
        cache._ttl = 3600

        fake_client = AsyncMock()
        fake_client.set = AsyncMock()
        cache._client = fake_client
        cache._enabled = True

        payload = [{"id": "CVE-1", "severity": "high"}]
        await cache.set("ssh|9.6", payload)

        fake_client.set.assert_awaited_once()
        args, kwargs = fake_client.set.call_args
        key = args[0]
        raw = args[1]
        assert key.startswith("cve:match:")
        assert json.loads(raw) == payload
        assert kwargs.get("ex") == 3600

    @pytest.mark.asyncio
    async def test_set_custom_ttl(self):
        cache = CveCache()
        cache._ttl = 3600

        fake_client = AsyncMock()
        fake_client.set = AsyncMock()
        cache._client = fake_client
        cache._enabled = True

        await cache.set("k", [], ttl=60)
        _, kwargs = fake_client.set.call_args
        assert kwargs.get("ex") == 60

    @pytest.mark.asyncio
    async def test_set_swallows_redis_error(self):
        cache = CveCache()
        fake_client = AsyncMock()
        fake_client.set = AsyncMock(side_effect=RuntimeError("boom"))
        cache._client = fake_client
        cache._enabled = True

        # No debe propagar
        await cache.set("k", [{"id": "CVE-1"}])


# ==========================================================
# delete()
# ==========================================================
class TestDelete:
    @pytest.mark.asyncio
    async def test_delete_disabled_is_noop(self):
        cache = CveCache()
        await cache.delete("k")

    @pytest.mark.asyncio
    async def test_delete_uses_hashed_key(self):
        cache = CveCache()
        fake_client = AsyncMock()
        fake_client.delete = AsyncMock()
        cache._client = fake_client
        cache._enabled = True

        await cache.delete("ssh|9.6")

        fake_client.delete.assert_awaited_once()
        args, _ = fake_client.delete.call_args
        assert args[0] == CveCache._hash_key("ssh|9.6")

    @pytest.mark.asyncio
    async def test_delete_swallows_redis_error(self):
        cache = CveCache()
        fake_client = AsyncMock()
        fake_client.delete = AsyncMock(side_effect=RuntimeError("boom"))
        cache._client = fake_client
        cache._enabled = True

        await cache.delete("k")
