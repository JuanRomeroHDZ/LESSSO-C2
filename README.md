# 🔰 LESSSO C2 - Red Team Security IDE

LESSSO C2 es una interfaz gráfica avanzada (GUI) multiplataforma para operaciones de Red Team, auditorías de seguridad y preparación para certificaciones (ej. CPTS).

## ⚠️ Requisitos Previos (Dependencias Core)
LESSSO C2 funciona como un "Cerebro" que orquesta herramientas nativas del sistema. Para que todo funcione correctamente, DEBES tener instalados los siguientes binarios en tu sistema operativo y deben estar accesibles desde tu variable `$PATH` (que funcionen al escribirlos en la terminal):

1. **[Nmap](https://nmap.org/download.html)** (Requerido para el motor principal de escaneo).
2. **[RustScan](https://github.com/RustScan/RustScan)** (Opcional, pero altamente recomendado para escaneos ultra-rápidos).
3. **OpenVPN** y **pkexec** (Requerido solo en Linux para auto-conectarse a redes como HTB/TryHackMe desde la App).

## 🚀 Instalación
Ve a la pestaña de **[Releases](https://github.com/TU-USUARIO/JuanMap/releases)** de este repositorio y descarga el instalador correspondiente a tu sistema operativo (Windows `.exe`, macOS `.dmg`, o Linux `.deb` / `.AppImage`).
