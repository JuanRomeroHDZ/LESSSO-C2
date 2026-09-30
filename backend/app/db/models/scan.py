from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime, timezone

Base = declarative_base()


def _utc_now() -> datetime:
    """
    Devuelve un datetime *naive* en UTC.

    ¿Por qué naive y no aware?
    --------------------------
    Column(DateTime) sin timezone=True genera TIMESTAMP WITHOUT TIME ZONE
    en Postgres. Si le pasamos un datetime aware (con tzinfo), asyncpg
    lanza:
        DataError: invalid input for query argument
    Así que aquí generamos un naive en UTC explícitamente.

    Alternativa (si quieres conservar tzinfo):
        Column(DateTime(timezone=True), ...)
    pero entonces hay que mantener la consistencia en todo el proyecto.
    Por simplicidad y compatibilidad, usamos naive-UTC.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ScanReportModel(Base):
    __tablename__ = "scan_reports"

    id = Column(Integer, primary_key=True, index=True)
    target = Column(String, index=True, nullable=False)
    scan_duration = Column(String, nullable=False)
    created_at = Column(DateTime, default=_utc_now, nullable=False)

    hosts = relationship(
        "HostModel",
        back_populates="report",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class HostModel(Base):
    __tablename__ = "hosts"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(
        Integer,
        ForeignKey("scan_reports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ip = Column(String, nullable=False, index=True)
    mac = Column(String, nullable=True)
    mac_vendor = Column(String, nullable=True)
    status = Column(String, nullable=True)
    os = Column(String, nullable=True)

    report = relationship("ScanReportModel", back_populates="hosts")
    ports = relationship(
        "PortModel",
        back_populates="host",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class PortModel(Base):
    __tablename__ = "ports"

    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(
        Integer,
        ForeignKey("hosts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    portid = Column(String, nullable=False)
    protocol = Column(String, nullable=True)
    state = Column(String, nullable=True)
    reason = Column(String, nullable=True)
    service = Column(String, nullable=True)
    version = Column(String, nullable=True)

    host = relationship("HostModel", back_populates="ports")
