import asyncio
from collections import defaultdict
from fastapi import HTTPException, status

class JobConcurrencyManager:
    def __init__(self, max_global_jobs: int = 10, max_jobs_per_user: int = 3):
        self.max_global_jobs = max_global_jobs
        self.max_jobs_per_user = max_jobs_per_user
        
        # Semáforo global para limitar el total de trabajos activos
        self.global_semaphore = asyncio.Semaphore(max_global_jobs)
        
        # Diccionario para rastrear los trabajos activos por usuario (user_id -> conteo)
        self.user_active_jobs = defaultdict(int)
        # Contador total
        self.total_active_jobs = 0

    async def acquire(self, user_id: int):
        """Intenta reservar un espacio para ejecutar un trabajo."""
        # 1. Límite por Usuario (Rechazo rápido)
        if self.user_active_jobs[user_id] >= self.max_jobs_per_user:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Límite alcanzado: Tienes {self.max_jobs_per_user} escaneos en curso. Espera a que terminen."
            )
        
        # 2. Límite Global del Servidor (Rechazo rápido)
        if self.total_active_jobs >= self.max_global_jobs:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="El motor de escaneo está al máximo de su capacidad. Intenta de nuevo en unos minutos."
            )

        # 3. Adquirir espacio global
        await self.global_semaphore.acquire()
        
        # 4. Incrementar contadores
        self.user_active_jobs[user_id] += 1
        self.total_active_jobs += 1

    def release(self, user_id: int):
        """Libera el espacio una vez que el trabajo termina."""
        if self.user_active_jobs[user_id] > 0:
            self.user_active_jobs[user_id] -= 1
        if self.total_active_jobs > 0:
            self.total_active_jobs -= 1
            
        self.global_semaphore.release()

# Instancia global: Máximo 10 procesos en todo el servidor, máximo 3 por usuario.
job_manager = JobConcurrencyManager(max_global_jobs=10, max_jobs_per_user=3)
