import xml.etree.ElementTree as ET
from typing import List, Optional
import os

from app.api.routes.scans import ScanReport, HostInfo, PortInfo, CveMatchModel

def parse_nmap_xml(xml_file_path: str, target: str) -> ScanReport:
    """
    Parsea un archivo XML generado por Nmap (-oX) y lo convierte 
    al esquema Pydantic ScanReport de LESSSO.
    """
    if not os.path.exists(xml_file_path):
        raise FileNotFoundError(f"No se encontró el archivo de salida XML de Nmap: {xml_file_path}")

    tree = ET.parse(xml_file_path)
    root = tree.getroot()

    # Extraer duración (si existe)
    runstats = root.find("runstats/finished")
    scan_duration = runstats.get("elapsed", "0") if runstats is not None else "0"
    
    # Formatear la duración para que sea legible (ej. "15.4s")
    scan_duration = f"{float(scan_duration):.1f}s"

    hosts_list: List[HostInfo] = []

    for host in root.findall("host"):
        # Extraer estado del host (up/down)
        status_element = host.find("status")
        if status_element is None or status_element.get("state") != "up":
            continue

        ip = "unknown"
        mac = None
        mac_vendor = None

        # Extraer direcciones
        for address in host.findall("address"):
            addr_type = address.get("addrtype")
            if addr_type == "ipv4" or addr_type == "ipv6":
                ip = address.get("addr")
            elif addr_type == "mac":
                mac = address.get("addr")
                mac_vendor = address.get("vendor")

        # Extraer SO (best effort)
        os_name = None
        os_match = host.find("os/osmatch")
        if os_match is not None:
            os_name = os_match.get("name")

        ports_list: List[PortInfo] = []

        # Extraer puertos
        for port in host.findall("ports/port"):
            state_element = port.find("state")
            if state_element is None or state_element.get("state") != "open":
                continue

            protocol = port.get("protocol", "tcp")
            portid = port.get("portid", "")
            state = state_element.get("state", "unknown")
            reason = state_element.get("reason", "")

            service_element = port.find("service")
            service = ""
            version = ""
            cpe_list = []

            if service_element is not None:
                service = service_element.get("name", "")
                # Concatenar product y version si existen
                product = service_element.get("product", "")
                v = service_element.get("version", "")
                if product or v:
                    version = f"{product} {v}".strip()
                
                # Extraer CPEs para el cruce de CVEs
                for cpe in service_element.findall("cpe"):
                    if cpe.text:
                        cpe_list.append(cpe.text)

            ports_list.append(
                PortInfo(
                    portid=portid,
                    protocol=protocol,
                    state=state,
                    reason=reason,
                    service=service,
                    version=version,
                    cpe=cpe_list if cpe_list else None,
                    cves=None # Los CVEs se buscarán luego con el CPE
                )
            )

        hosts_list.append(
            HostInfo(
                ip=ip,
                mac=mac,
                mac_vendor=mac_vendor,
                status="up",
                os=os_name,
                ports=ports_list
            )
        )

    return ScanReport(
        target=target,
        scan_duration=scan_duration,
        hosts=hosts_list
    )
