"""
Tests de los endpoints básicos:
- GET  /           → health check
- POST /api/scans  → (solo validación de schemas, sin tocar DB)

Estrategia
----------
No levantamos Postgres. El endpoint `/api/scans` toca la DB, así que
solo verificamos:
  1. Que responde 422 si el body está mal formado (validación Pydantic).
  2. Que responde 422 si faltan campos obligatorios.
  3. Que el schema acepta un payload válido con la forma esperada.

Si en el futuro se añade SQLite in-memory, se puede testear el happy
path completo.
"""

from __future__ import annotations

import pytest


# ==========================================================
# GET /
# ==========================================================
@pytest.mark.asyncio
async def test_health_check(app_client):
    """GET / debe devolver 200 con status ok y nombre del servicio."""
    r = await app_client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "LESSSO C2" in data["service"]


# ==========================================================
# POST /api/scans — validación de schemas
# ==========================================================
@pytest.mark.asyncio
async def test_save_scan_missing_body(app_client):
    """Sin body → 422 (Pydantic rechaza)."""
    r = await app_client.post("/api/scans", json={})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_save_scan_missing_target(app_client):
    """Falta `target` → 422."""
    r = await app_client.post(
        "/api/scans",
        json={"scan_duration": "5s", "hosts": []},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_save_scan_missing_duration(app_client):
    """Falta `scan_duration` → 422."""
    r = await app_client.post(
        "/api/scans",
        json={"target": "10.10.10.1", "hosts": []},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_save_scan_invalid_hosts_type(app_client):
    """`hosts` no es lista → 422."""
    r = await app_client.post(
        "/api/scans",
        json={"target": "10.10.10.1", "scan_duration": "5s", "hosts": "not-a-list"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_save_scan_valid_payload_schema(app_client):
    """
    Payload válido. No aseguramos 200 porque la DB no está levantada
    en tests, pero SÍ aseguramos que la validación pasa (no es 422).
    """
    payload = {
        "target": "10.10.10.1",
        "scan_duration": "12.5s",
        "hosts": [
            {
                "ip": "10.10.10.1",
                "mac": "aa:bb:cc:dd:ee:ff",
                "mac_vendor": "Test Vendor",
                "status": "up",
                "os": "Linux 5.15",
                "ports": [
                    {
                        "portid": "22",
                        "protocol": "tcp",
                        "state": "open",
                        "reason": "syn-ack",
                        "service": "ssh",
                        "version": "OpenSSH 9.6",
                        "cpe": ["cpe:2.3:a:openbsd:openssh:9.6:*:*:*:*:*:*:*"],
                        "cves": [
                            {
                                "id": "CVE-2024-12345",
                                "severity": "high",
                                "cvss": 8.1,
                                "source": "cpe",
                                "description": "Test CVE.",
                            }
                        ],
                    }
                ],
            }
        ],
    }

    r = await app_client.post("/api/scans", json=payload)
    # 422 = validación falló (malo). Cualquier otro código = schema OK.
    assert r.status_code != 422


@pytest.mark.asyncio
async def test_save_scan_empty_hosts(app_client):
    """Lista vacía de hosts es válida (schema permite default_factory=list)."""
    payload = {
        "target": "192.168.1.0/24",
        "scan_duration": "0s",
        "hosts": [],
    }
    r = await app_client.post("/api/scans", json=payload)
    assert r.status_code != 422
