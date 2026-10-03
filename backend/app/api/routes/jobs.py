import logging
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.db.models.job import ScanJobModel
from app.db.models.user import UserModel
from app.core.security import get_current_user
from app.core.validators import validate_target_string
from app.core.concurrency import job_manager
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
    await job_manager.acquire(current_user.id)


    # Creamos el registro inicial PENDING asignado al usuario actual
    new_job = ScanJobModel(
        target=target, 
        status="PENDING",
        user_id=current_user.id  # [CORRECCIÓN]: Ownership del job
    )
    db.add(new_job)
    await db.flush() # Para obtener el ID generado
    
    job_id = new_job.id
    await db.commit()

    # Lanzamos el ejecutor en segundo plano
    # [CORRECCIÓN CRÍTICA]: NO pasamos 'db' ni 'current_user' entero.
    # Solo pasamos IDs primitivos. El worker abrirá su propia sesión de DB.
    background_tasks.add_task(run_nmap_job, job_id, target, current_user.id)

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
    # [CORRECCIÓN]: Solo permitimos ver el job si pertenece al usuario actual
    result = await db.execute(
        select(ScanJobModel).where(
            ScanJobModel.id == job_id,
            ScanJobModel.user_id == current_user.id
        )
    )
    job = result.scalars().first()

    if not job:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado o sin permisos")

    # Seguridad de UI: Si falló, mostramos un error genérico, los detalles al log.
    display_error = None
    if job.status == "FAILED" and job.error_message:
        display_error = "No fue posible completar el escaneo."
        logger.error(f"[Job {job_id}] Falló internamente: {job.error_message}")

    return JobStatusResponse(
        job_id=job.id,
        target=job.target,
        status=job.status,
        command_executed=job.command_executed,
        error_message=display_error
    )
