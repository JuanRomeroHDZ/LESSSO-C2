import logging
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.db.models.job import ScanJobModel
from app.db.models.user import UserModel
from app.core.security import get_current_user
from app.core.validators import validate_target_string
from app.services.executor import run_nmap_job

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/jobs", tags=["jobs"])

class NmapJobRequest(BaseModel):
    target: str

class JobStatusResponse(BaseModel):
    job_id: int
    target: str
    status: str
    command_executed: Optional[str] = None
    error_message: Optional[str] = None

@router.post("/nmap")
async def start_nmap_job(
    request: NmapJobRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Inicia un escaneo de Nmap en segundo plano y devuelve un Job ID.
    """
    target = validate_target_string(request.target)

    # Creamos el registro inicial PENDING
    new_job = ScanJobModel(target=target, status="PENDING")
    db.add(new_job)
    await db.flush() # Para obtener el ID generado
    
    job_id = new_job.id
    await db.commit()

    # Lanzamos el ejecutor en segundo plano
    # Le pasamos la base de datos y el usuario para el Oplog/Guardado
    background_tasks.add_task(run_nmap_job, job_id, target, current_user, db)

    return {
        "status": "success", 
        "message": "Nmap lanzado en segundo plano", 
        "job_id": job_id
    }

@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(
    job_id: int, 
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Permite al frontend (Tauri) consultar el progreso del escaneo.
    """
    result = await db.execute(select(ScanJobModel).where(ScanJobModel.id == job_id))
    job = result.scalars().first()

    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")

    return JobStatusResponse(
        job_id=job.id,
        target=job.target,
        status=job.status,
        command_executed=job.command_executed,
        error_message=job.error_message
    )
