import os


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "y"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


class Settings:
    # ======================================================
    # BASE DE DATOS
    # ======================================================
    # Exigimos que la URL sea inyectada por el entorno (.env o Docker).
    # Si no existe, abortamos la ejecución de forma segura.
    _db_url = os.getenv("DATABASE_URL")
    if not _db_url:
        raise RuntimeError("Fallo crítico de seguridad: DATABASE_URL no está configurada en el entorno.")
    
    DATABASE_URL: str = _db_url

    # ======================================================
    # REDIS (cache de CVEs)
    # ======================================================
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")

    # TTL del cache de CVEs en segundos (24h por defecto)
    CVE_CACHE_TTL_S: int = _env_int("CVE_CACHE_TTL_S", 60 * 60 * 24)

    # Si Redis falla, ¿seguimos funcionando sin cache?
    CVE_CACHE_REQUIRED: bool = _env_bool("CVE_CACHE_REQUIRED", False)

    # ======================================================
    # NVD (National Vulnerability Database) API v2
    # ======================================================
    # https://nvd.nist.gov/developers/vulnerabilities
    NVD_API_KEY: str = os.getenv("NVD_API_KEY", "").strip()

    NVD_BASE_URL: str = os.getenv(
        "NVD_BASE_URL",
        "https://services.nvd.nist.gov/rest/json/cves/2.0",
    )

    # Timeout por request a NVD (segundos)
    NVD_TIMEOUT_S: float = _env_float("NVD_TIMEOUT_S", 15.0)

    # Máximo de CVEs a devolver por item
    NVD_MAX_RESULTS_PER_ITEM: int = _env_int("NVD_MAX_RESULTS_PER_ITEM", 25)

    # Si NVD falla, ¿devolvemos error o lista vacía?
    NVD_SOFT_FAIL: bool = _env_bool("NVD_SOFT_FAIL", True)


settings = Settings()
