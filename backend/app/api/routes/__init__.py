from .cve import router as cve_router
from .auth import router as auth_router
from .scans import router as scans_router
from .jobs import router as jobs_router # NUEVO

__all__ = ["cve_router", "auth_router", "scans_router", "jobs_router"]
