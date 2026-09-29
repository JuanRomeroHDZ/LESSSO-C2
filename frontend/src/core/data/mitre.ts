export interface MitreTechnique {
  id: string;
  name: string;
  tactic: string;
  description: string;
  mitigation: string;
}

export const MITRE_DATA: MitreTechnique[] = [
  {
    id: "T1595", name: "Active Scanning", tactic: "Reconnaissance",
    description: "Los atacantes ejecutan escaneos activos (como Nmap o vulnerabilidades) para recopilar información sobre la infraestructura de la víctima.",
    mitigation: "Configurar Firewalls (IPS/IDS) para detectar y bloquear escaneos anómalos. Minimizar los puertos expuestos a Internet."
  },
  {
    id: "T1190", name: "Exploit Public-Facing Application", tactic: "Initial Access",
    description: "Explotación de una vulnerabilidad en un software expuesto a Internet (ej. Apache, WordPress, SMB) para obtener acceso inicial a la red.",
    mitigation: "Mantener los sistemas actualizados (Patching), usar Web Application Firewalls (WAF) y segmentar la red (DMZ)."
  },
  {
    id: "T1078", name: "Valid Accounts", tactic: "Initial Access / Persistence",
    description: "Uso de cuentas legítimas comprometidas (credenciales por defecto, contraseñas débiles o robadas) para evadir detección.",
    mitigation: "Implementar MFA (Multi-Factor Authentication), políticas estrictas de contraseñas y auditoría de cuentas inactivas."
  },
  {
    id: "T1059", name: "Command and Scripting Interpreter", tactic: "Execution",
    description: "Uso de intérpretes de comandos nativos (Bash, PowerShell, cmd.exe) para ejecutar código malicioso o Reverse Shells.",
    mitigation: "Restringir la ejecución de scripts mediante AppLocker o Políticas de Grupo. Monitorear argumentos de línea de comandos."
  },
  {
    id: "T1068", name: "Exploitation for Privilege Escalation", tactic: "Privilege Escalation",
    description: "Explotar vulnerabilidades de software o fallos de configuración en el sistema local (ej. SUID en Linux) para ganar acceso ROOT o SYSTEM.",
    mitigation: "Auditoría regular de permisos SUID/SGID en Linux y servicios mal configurados en Windows. Mantener el kernel actualizado."
  },
  {
    id: "T1110", name: "Brute Force", tactic: "Credential Access",
    description: "Adivinar o forzar contraseñas mediante prueba y error sistemática (ataques de diccionario o fuerza bruta pura).",
    mitigation: "Implementar bloqueos de cuenta tras N intentos fallidos (Account Lockout), usar CAPTCHAs en interfaces web y monitoreo de logs."
  },
  {
    id: "T1003", name: "OS Credential Dumping", tactic: "Credential Access",
    description: "Extracción de hashes de contraseñas de la memoria del sistema operativo (ej. LSASS en Windows o /etc/shadow en Linux).",
    mitigation: "Deshabilitar WDigest, habilitar LSA Protection (Windows) y asegurar permisos estrictos en archivos críticos."
  },
  {
    id: "T1021", name: "Remote Services", tactic: "Lateral Movement",
    description: "Uso de servicios remotos válidos como SSH, RDP o SMB para moverse lateralmente entre equipos de la misma red.",
    mitigation: "Segmentación de red estricta. Deshabilitar RDP/SMB donde no se necesite y usar autenticación fuerte de red."
  },
  {
    id: "T1027", name: "Obfuscated Files or Information", tactic: "Defense Evasion",
    description: "Los atacantes ocultan código o lo encriptan (Base64, Hex, empacadores) para evitar la detección de firmas de los antivirus.",
    mitigation: "Uso de EDRs avanzados con análisis de comportamiento en memoria y escaneo antimalware en tiempo real."
  }
];
