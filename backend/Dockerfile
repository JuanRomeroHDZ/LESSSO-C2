# syntax=docker/dockerfile:1
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Se añadió 'nmap' a las dependencias del sistema operativo
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    nmap \
    && rm -rf /var/lib/apt/lists/*

# Copiar solo requirements primero para aprovechar la caché de Docker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Dev-deps opcionales (pytest, etc.).
# Se instalan solo si se construye con:
#   docker compose build --build-arg INSTALL_DEV=true
ARG INSTALL_DEV=false
COPY requirements-dev.txt .
RUN if [ "$INSTALL_DEV" = "true" ]; then \
        pip install --no-cache-dir -r requirements-dev.txt; \
    fi

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
