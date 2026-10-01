"""
Routers de la API.

- cve: endpoints para matching de CVEs contra NVD.
"""

from .cve import router as cve_router

__all__ = ["cve_router"]
