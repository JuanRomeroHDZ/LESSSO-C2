import re

# Bloqueamos cualquier carácter que la shell de bash/sh pueda interpretar
# como operadores lógicos, tuberías, variables, sustituciones o redirecciones.
FORBIDDEN_CHARS = re.compile(r'[;&|`$<>\{\}\[\]\(\)!#*?\\]')

def validate_target_string(target: str) -> str:
    """
    Valida que el input del target sea seguro y no contenga 
    caracteres de inyección de comandos.
    """
    if not target or not target.strip():
        raise ValueError("El target no puede estar vacío.")
    
    target = target.strip()
    
    # Comprobación de seguridad dura contra inyección
    if FORBIDDEN_CHARS.search(target):
        raise ValueError("El target contiene caracteres no permitidos (riesgo de inyección de comandos).")
    
    # Aquí podríamos añadir validaciones más estrictas (Regex para IPv4, IPv6, CIDR o FQDN),
    # pero el bloqueo de metacaracteres ya nos protege del 99% de los RCEs.
    
    return target
