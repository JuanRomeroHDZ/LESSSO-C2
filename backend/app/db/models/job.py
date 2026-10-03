from sqlalchemy import Column, Integer, String, DateTime
from app.db.models.scan import Base, _utc_now

class ScanJobModel(Base):
    __tablename__ = "scan_jobs"

    id = Column(Integer, primary_key=True, index=True)
    target = Column(String, index=True, nullable=False)
    # [CORRECCIÓN CRÍTICA]: Vinculamos el trabajo a un usuario específico
    user_id = Column(Integer, nullable=False, index=True) 
    
    # PENDING, RUNNING, COMPLETED, FAILED
    status = Column(String, default="PENDING", nullable=False)  
    command_executed = Column(String, nullable=True) 
    created_at = Column(DateTime, default=_utc_now, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(String, nullable=True)
