import ipaddress
import re

# Regex básico para un Fully Qualified Domain Name (FQDN)
FQDN_REGEX = re.compile(
    r'^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*$'
)

def validate_target_string(target: str) -> str:
    """
    Valida estrictamente que el target sea una IP (v4/v6), 
    un bloque CIDR o un nombre de dominio (FQDN) válido.
    Cualquier otra entrada se rechaza.
    """
    if not target or not target.strip():
        raise ValueError("El target no puede estar vacío.")
    
    target = target.strip()

    # Intento 1: Es una IP válida (IPv4 o IPv6)?
    try:
        ipaddress.ip_address(target)
        return target
    except ValueError:
        pass

    # Intento 2: Es un bloque de red (CIDR)?
    try:
        ipaddress.ip_network(target, strict=False)
        return target
    except ValueError:
        pass

    # Intento 3: Es un FQDN/Hostname válido?
    if FQDN_REGEX.match(target):
        return target

    raise ValueError(
        f"Target inválido: '{target}'. Debe ser una IPv4, IPv6, bloque CIDR o dominio válido."
    )
