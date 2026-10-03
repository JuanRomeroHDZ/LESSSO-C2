from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.db.models.scan import Base

class FindingModel(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    port_id = Column(
        Integer,
        ForeignKey("ports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Identificador del CVE (ej. CVE-2024-1234)
    cve_id = Column(String, nullable=False, index=True)
    
    # Datos de vulnerabilidad
    severity = Column(String, default="unknown")
    cvss = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String, default="cpe")

    # Relación inversa
    port = relationship("PortModel", back_populates="findings")
