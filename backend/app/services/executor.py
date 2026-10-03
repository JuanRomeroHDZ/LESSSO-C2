import asyncio
import os
import tempfile
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update

from app.db.models.job import ScanJobModel
from app.db.models.user import UserModel
from app.services.parsers.nmap_parser import parse_nmap_xml
from app.api.routes.scans import save_scan_result # Reutilizamos la lógica que ya hicimos

logger = logging.getLogger("uvicorn.error")

async def run_nmap_job(job_id: int, target: str, current_user: UserModel, db: AsyncSession):
    """
    Ejecuta Nmap asíncronamente en un subproceso, parasea el resultado
    y lo inyecta a la base de datos usando el flujo seguro existente.
    """
    # Archivo temporal para el XML de salida
    xml_output_fd, xml_output_path = tempfile.mkstemp(suffix=".xml", prefix="lessso_nmap_")
    os.close(xml_output_fd)

    # Construimos el comando como ARRAY. ¡Esto bloquea la inyección de shell!
    # Nmap flags: 
    # -sV: Detección de versiones
    # -p-: Todos los puertos (puedes ajustar esto luego si quieres escaneos rápidos)
    # -Pn: No hacer ping (útil para red team)
    command_args = [
        "nmap", 
        "-sV", 
        "-Pn",
        "-T4", # Plantilla de velocidad agresiva
        "-p", "1-1000", # Escaneo rápido por defecto para no tardar 15 mins. Cambiar a -p- luego.
        "-oX", xml_output_path, 
        target
    ]
    
    command_str = " ".join(command_args)
    logger.info(f"[executor] Job {job_id}: Iniciando comando: {command_str}")

    try:
        # 1. Actualizar trabajo a RUNNING
        await db.execute(
            update(ScanJobModel)
            .where(ScanJobModel.id == job_id)
            .values(status="RUNNING", command_executed=command_str)
        )
        await db.commit()

        # 2. Ejecutar Nmap sin bloquear el hilo
        process = await asyncio.create_subprocess_exec(
            *command_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode().strip() or "Error desconocido de Nmap"
            raise RuntimeError(f"Nmap falló (código {process.returncode}): {error_msg}")

        logger.info(f"[executor] Job {job_id}: Nmap finalizado. Parseando XML...")

        # 3. Parsear el XML
        report = parse_nmap_xml(xml_output_path, target)

        # 4. Guardar en BD usando la lógica de la ruta existente
        await save_scan_result(report=report, db=db, current_user=current_user)

        # 5. Marcar como completado
        from app.db.models.scan import _utc_now
        await db.execute(
            update(ScanJobModel)
            .where(ScanJobModel.id == job_id)
            .values(status="COMPLETED", completed_at=_utc_now())
        )
        await db.commit()
        logger.info(f"[executor] Job {job_id}: Completado con éxito.")

    except Exception as e:
        logger.exception(f"[executor] Job {job_id}: Fallo catastrófico")
        from app.db.models.scan import _utc_now
        await db.execute(
            update(ScanJobModel)
            .where(ScanJobModel.id == job_id)
            .values(status="FAILED", completed_at=_utc_now(), error_message=str(e))
        )
        await db.commit()
    finally:
        # Limpiar evidencia (El XML temporal)
        if os.path.exists(xml_output_path):
            try:
                os.remove(xml_output_path)
            except OSError:
                pass
