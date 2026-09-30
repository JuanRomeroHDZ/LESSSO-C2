from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI(title="JuanMap API", version="0.1.0")

# ==========================================================
# CORS — Sprint 2: restringido a orígenes legítimos de LESSSO C2
# ----------------------------------------------------------
# Solo permitimos:
#   - El dev server de Vite (http://localhost:5173)
#   - La app Tauri empaquetada (tauri://localhost, http://tauri.localhost)
# NO usamos cookies → allow_credentials=False (además es incompatible
# con allow_origins=["*"], y aquí no lo necesitamos).
# ==========================================================
ALLOWED_ORIGINS = [
    "http://localhost:5173",       # Vite dev server (Tauri dev)
    "http://tauri.localhost",      # Tauri prod (Linux/Windows)
    "tauri://localhost",           # Tauri prod (macOS)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization"],
)


class PortInfo(BaseModel):
    portid: str
    protocol: str
    state: str
    reason: str
    service: str
    version: str


class HostInfo(BaseModel):
    ip: str
    mac: str
    mac_vendor: str
    status: str
    os: str
    ports: List[PortInfo]


class ScanReport(BaseModel):
    target: str
    scan_duration: str
    hosts: List[HostInfo]


@app.get("/")
async def health_check():
    return {"status": "ok", "service": "JuanMap Backend Engine"}


@app.post("/api/scans")
async def save_scan_result(report: ScanReport):
    # Aquí irá tu lógica de SQLAlchemy para guardar en juanmap_db
    return {
        "status": "success",
        "message": f"Escaneo de {report.target} recibido exitosamente con {len(report.hosts)} hosts.",
    }
