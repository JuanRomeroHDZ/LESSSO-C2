import os

class Settings:
    # La variable DATABASE_URL la inyecta Docker Compose desde el .env
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+asyncpg://lessso_admin:CambiaEstaPasswordPorUnaSegura2024!@db:5432/juanmap_db"
    )

settings = Settings()
