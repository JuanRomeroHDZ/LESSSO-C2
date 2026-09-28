from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI(title="JuanMap API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    return {"status": "success", "message": f"Escaneo de {report.target} recibido exitosamente con {len(report.hosts)} hosts."}
