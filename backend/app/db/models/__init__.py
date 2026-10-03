from .scan import Base, HostModel, PortModel, ScanReportModel
from .user import UserModel
from .finding import FindingModel
from .job import ScanJobModel # NUEVO

__all__ = [
    "Base", "ScanReportModel", "HostModel", "PortModel", 
    "UserModel", "FindingModel", "ScanJobModel"
]
