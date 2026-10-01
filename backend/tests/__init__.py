"""
Suite de tests de LESSSO C2 backend.

Estructura:
- conftest.py           → fixtures compartidas
- test_api.py           → tests de / y /api/scans
- test_cve_matcher.py   → tests de la lógica de matching (pura)
- test_cve_cache.py     → tests del wrapper Redis
- test_cve_routes.py    → tests de /api/cves/*
"""
