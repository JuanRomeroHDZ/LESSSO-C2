import asyncio
import os
import tempfile
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update, select

# [NUEVO]: Importamos el manejador de concurrencia
from app.core.concurrency import job_manager
from app.db.database import async_session
from app.db.models.job import ScanJobModel
from app.db.models.user import UserModel
from app.services.parsers.nmap_parser import parse_nmap_xml
from app.api.routes.scans import save_scan_result

logger = logging.getLogger("uvicorn.error")

async def run_nmap_job(job_id: int, target: str, user_id: int):
    """
    Ejecuta Nmap asíncronamente en un subproceso, de forma aislada.
    """
    try:
        # Creamos una NUEVA sesión exclusiva usando async_session()
        async with async_session() as db:
            xml_output_fd, xml_output_path = tempfile.mkstemp(suffix=".xml", prefix="lessso_nmap_")
            os.close(xml_output_fd)

            command_args = [
                "nmap", 
                "-sV", 
                "-Pn",
                "-T4",
                "-p", "1-1000",
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

                # 3. Timeout de 10 minutos (600 segundos)
                try:
                    stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=600)
                except asyncio.TimeoutError:
                    process.kill()
                    raise RuntimeError("Timeout: El escaneo excedió el tiempo máximo de 10 minutos y fue abortado.")

                if process.returncode != 0:
                    error_msg = stderr.decode().strip() or "Error desconocido de Nmap"
                    raise RuntimeError(f"Nmap falló (código {process.returncode}): {error_msg}")

                logger.info(f"[executor] Job {job_id}: Nmap finalizado. Parseando XML...")

                # 4. Recuperar al usuario completo (save_scan_result lo necesita)
                user_result = await db.execute(select(UserModel).where(UserModel.id == user_id))
                current_user = user_result.scalars().first()
                if not current_user:
                    raise RuntimeError("El usuario propietario del job ya no existe.")

                # 5. Parsear y guardar en BD
                report = parse_nmap_xml(xml_output_path, target)
                await save_scan_result(report=report, db=db, current_user=current_user)

                # 6. Marcar como completado
                from app.db.models.scan import _utc_now
                await db.execute(
                    update(ScanJobModel)
                    .where(ScanJobModel.id == job_id)
                    .values(status="COMPLETED", completed_at=_utc_now())
                )
                await db.commit()
                logger.info(f"[executor] Job {job_id}: Completado con éxito.")

            except Exception as e:
                logger.exception(f"[executor] Job {job_id}: Fallo de ejecución")
                from app.db.models.scan import _utc_now
                await db.execute(
                    update(ScanJobModel)
                    .where(ScanJobModel.id == job_id)
                    .values(status="FAILED", completed_at=_utc_now(), error_message=str(e))
                )
                await db.commit()
            finally:
                if os.path.exists(xml_output_path):
                    try:
                        os.remove(xml_output_path)
                    except OSError:
                        pass
    finally:
        # [NUEVO CRÍTICO]: Aseguramos la liberación del espacio en el concurrency manager.
        # Está en el bloque 'finally' más externo para garantizar que, incluso si
        # falla la sesión de base de datos o la creación del archivo temporal, 
        # el espacio sea devuelto al usuario.
        job_manager.release(user_id)
        logger.info(f"[concurrency] Espacio liberado para usuario {user_id}. Job {job_id} cerrado.")
