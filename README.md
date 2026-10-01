# 🔰 LESSSO C2

**Red Team Security IDE — Workspace ofensivo multiplataforma**

[![CI](https://github.com/JuanRomeroHDZ/LESSSO-C2/actions/workflows/ci.yml/badge.svg)](https://github.com/JuanRomeroHDZ/LESSSO-C2/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/JuanRomeroHDZ/LESSSO-C2?include_prereleases&label=release)](https://github.com/JuanRomeroHDZ/LESSSO-C2/releases)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-informational)](docs/INSTALL.md)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Idioma](https://img.shields.io/badge/lang-ES%20%7C%20EN-lightgrey)](#-english)

[Español](#-español) · [English](#-english)

---

## 🇪🇸 Español

### ¿Qué es LESSSO C2?

**LESSSO C2** es una interfaz gráfica avanzada (GUI) multiplataforma para
operaciones de **Red Team**, auditorías de seguridad y preparación para
certificaciones (ej. CPTS, OSCP, PNPT).

Funciona como un **"cerebro"** que orquesta herramientas nativas del
sistema (Nmap, RustScan, OpenVPN, Gobuster...) y las enriquece con
contexto: CVEs, MITRE ATT&CK, payloads listos para usar, gestión de
credenciales y generación de reportes.

### ✨ Características

| Módulo | Descripción |
|--------|-------------|
| 🖥️ **Scanner** | Nmap + RustScan con perfiles (evasivo, balanceado, agresivo, discovery, fast). Parser XML completo con CPEs, scripts NSE y OS detection. |
| 🗺️ **Topología** | Grafo interactivo de hosts/puertos (React Flow). |
| 🧠 **Intel / CVEs** | Matching automático contra NVD API v2 con filtrado por versión real (`versionStartIncluding`, `versionEndExcluding`). Cache en Redis. |
| 🎯 **MITRE ATT&CK** | Panel con técnicas, tácticas, descripción y mitigación. |
| 🛠️ **Arsenal** | 100+ payloads: reverse shells (Linux/Windows/macOS/Web/MSF), vulns web (SQLi, XSS, LFI, SSTI, XXE, CMDi...), payloads por servicio (SMB, LDAP, SQL, Redis, Docker, K8s, AWS...). |
| 🔐 **Vault** | Bóveda de credenciales cifrada con **Argon2id + AES-256-GCM** en Rust. Contraseña maestra nunca toca el store de React. |
| 📡 **Listeners** | Terminales por *process group* (nc, bash). `kill(-pgid)` garantiza limpieza total al cerrar. |
| 🕸️ **Redteam** | Notas con auto-tagging MITRE (`#T1059` → `[MITRE: T1059]`) + whiteboard. |
| 🔍 **Fuzzing** | Gobuster (dir). Resultados en vivo. |
| 🌐 **VPN** | Auto-conexión a HTB/THM vía OpenVPN + `pkexec`. Validación de directivas peligrosas en `.ovpn`. |
| 📸 **Screenshots** | Captura y pegado desde portapapeles (arboard + wl-paste + xclip). |
| 📊 **Reportes** | Exportación MD/HTML/JSON con hash SHA-256. |

### 📸 Capturas de pantalla

> **Nota**: las capturas se subirán próximamente a `docs/screenshots/`.
> Formato de cita: APA.

<!--
  TODO: descomentar cuando existan las imágenes en docs/screenshots/

  **Figura 1**
  *Inicio de la aplicación LESSSO C2* [Captura de pantalla]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/01-dashboard.png

  ![Dashboard](docs/screenshots/01-dashboard.png)

  **Figura 2**
  *Configuración del Scanner Nmap/RustScan* [Captura de pantalla]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/02-scanner.png

  ![Scanner](docs/screenshots/02-scanner.png)

  **Figura 3**
  *Bóveda de credenciales cifrada* [Captura de pantalla]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/03-vault.png

  ![Vault](docs/screenshots/03-vault.png)

  **Figura 4**
  *Topología de red interactiva* [Captura de pantalla]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/04-topology.png

  ![Topology](docs/screenshots/04-topology.png)

  **Figura 5**
  *Arsenal de payloads y reverse shells* [Captura de pantalla]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/05-arsenal.png

  ![Arsenal](docs/screenshots/05-arsenal.png)
-->

### ⚠️ Requisitos previos (dependencias core)

LESSSO C2 funciona como un **"cerebro"** que orquesta herramientas
nativas. DEBES tener instalados los siguientes binarios y accesibles
desde `$PATH`:

1. **[Nmap](https://nmap.org/download.html)** — Requerido. Motor principal de escaneo.
2. **[RustScan](https://github.com/RustScan/RustScan)** — Opcional, altamente recomendado para escaneos ultra-rápidos.
3. **OpenVPN** + **pkexec** — Requeridos solo en Linux para auto-conectar VPN.
4. **[Gobuster](https://github.com/OJ/gobuster)** — Opcional, para el módulo de fuzzing.
5. **`wl-clipboard`** o **`xclip`** — Recomendado en Linux (Wayland) para pegado de imágenes.

### 🚀 Instalación rápida

Descarga el instalador desde la pestaña de
**[Releases](https://github.com/JuanRomeroHDZ/LESSSO-C2/releases)**:

| SO | Formato |
|----|---------|
| Linux (Debian/Ubuntu) | `.deb` |
| Linux (Fedora/RHEL) | `.rpm` |
| Linux (universal) | `.AppImage` |
| Windows | `.msi`, `.exe` |
| macOS | `.dmg` (Intel + Apple Silicon) |

Detalles completos en [`docs/INSTALL.md`](docs/INSTALL.md).

### 🧑‍💻 Desarrollo

```bash
git clone https://github.com/JuanRomeroHDZ/LESSSO-C2.git
cd LESSSO-C2

# 1. Backend (FastAPI + Postgres + Redis)
cp .env.example .env
# Edita .env: POSTGRES_PASSWORD, NVD_API_KEY (opcional)
docker compose up -d --build

# 2. Frontend (Tauri + Vite + React)
cd frontend
npm ci --legacy-peer-deps
npm run tauri dev
```

Ver [`docs/INSTALL.md`](docs/INSTALL.md) para la guía completa y
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para la arquitectura interna.

### 📁 Estructura del proyecto

```
LESSSO-C2/
├── backend/                  # FastAPI + SQLAlchemy async + NVD matcher
│   ├── app/
│   │   ├── api/routes/       # Endpoints (/api/scans, /api/cves/*)
│   │   ├── core/config.py    # Settings desde env
│   │   ├── db/               # Engine, session, models
│   │   ├── services/         # cve_cache (Redis), cve_matcher (NVD)
│   │   └── main.py           # Lifespan, CORS, schemas
│   └── Dockerfile
├── frontend/                 # Tauri 2 + React 19 + Vite
│   ├── src/
│   │   ├── components/       # Layout (Header, Sidebar, Footer...)
│   │   ├── core/
│   │   │   ├── data/         # Payloads (shells, vulns, services, mitre)
│   │   │   └── store/        # Zustand (scan, vault, ui, network...)
│   │   ├── features/         # dashboard, scanner, vault, arsenal...
│   │   └── services/api.ts   # Fetch wrapper con timeout
│   └── src-tauri/            # Rust: comandos Tauri
│       └── src/lib.rs        # Nmap parser, cifrado, terminales
├── docs/                     # INSTALL, ARCHITECTURE, TROUBLESHOOTING
├── .github/workflows/        # CI + Release (Tauri Action)
├── compose.yaml              # Stack completo (api + db + redis)
└── LICENSE                   # AGPL-3.0
```

### 🔐 Seguridad

- **Cifrado de bóveda**: Argon2id (m=19 MiB, t=2, p=1) + AES-256-GCM. La clave se zeroiza tras usarla.
- **Sesión de bóveda**: la contraseña maestra vive en un closure de módulo (`vaultSession.ts`), nunca en Zustand ni en `localStorage`.
- **CSP estricto**: `object-src 'none'`, `frame-ancestors 'none'`, `connect-src` limitado a `localhost:8001`.
- **Validación de `.ovpn`**: bloquea directivas peligrosas (`script-security`, `up`, `down`, `plugin`, `setenv`...).
- **Saneado XML**: elimina `<!DOCTYPE` antes de parsear Nmap (mitiga XXE / billion laughs).
- **Bind a `127.0.0.1`**: todos los servicios Docker exponen solo a localhost.

Reporta vulnerabilidades de forma responsable (ver [`SECURITY.md`](SECURITY.md), pendiente).

### 📜 Licencia

**AGPL-3.0** — ver [`LICENSE`](LICENSE).

Copyright (C) 2025 Juan Romero.

Esto significa: puedes usar, modificar y distribuir LESSSO C2
**siempre que** publiques el código fuente de tus modificaciones bajo la
misma licencia, **incluso si ofreces el software como servicio en red**.

### ⚖️ Aviso legal

LESSSO C2 está diseñado para **auditorías de seguridad autorizadas**,
**CTFs** y **laboratorios de práctica**. El uso de estas herramientas
contra sistemas sin autorización explícita por escrito es **ilegal** en
la mayoría de jurisdicciones.

**El autor no se hace responsable del mal uso.** Úsalo con ética.

---

## 🇬🇧 English

### What is LESSSO C2?

**LESSSO C2** is an advanced cross-platform GUI for **Red Team**
operations, security audits and certification prep (CPTS, OSCP, PNPT).

It works as a **"brain"** that orchestrates native tools (Nmap,
RustScan, OpenVPN, Gobuster...) and enriches them with context: CVEs,
MITRE ATT&CK, ready-to-use payloads, credential management and report
generation.

### ✨ Features

| Module | Description |
|--------|-------------|
| 🖥️ **Scanner** | Nmap + RustScan with profiles (evasive, balanced, aggressive, discovery, fast). Full XML parser with CPEs, NSE scripts and OS detection. |
| 🗺️ **Topology** | Interactive host/port graph (React Flow). |
| 🧠 **Intel / CVEs** | Automatic matching against NVD API v2 with real version filtering (`versionStartIncluding`, `versionEndExcluding`). Redis cache. |
| 🎯 **MITRE ATT&CK** | Panel with techniques, tactics, description and mitigation. |
| 🛠️ **Arsenal** | 100+ payloads: reverse shells (Linux/Windows/macOS/Web/MSF), web vulns (SQLi, XSS, LFI, SSTI, XXE, CMDi...), service payloads (SMB, LDAP, SQL, Redis, Docker, K8s, AWS...). |
| 🔐 **Vault** | Credential vault encrypted with **Argon2id + AES-256-GCM** in Rust. Master password never touches React state. |
| 📡 **Listeners** | Terminals by *process group* (nc, bash). `kill(-pgid)` guarantees full cleanup on close. |
| 🕸️ **Redteam** | Notes with MITRE auto-tagging (`#T1059` → `[MITRE: T1059]`) + whiteboard. |
| 🔍 **Fuzzing** | Gobuster (dir). Live results. |
| 🌐 **VPN** | Auto-connect to HTB/THM via OpenVPN + `pkexec`. Dangerous `.ovpn` directives blocked. |
| 📸 **Screenshots** | Capture and paste from clipboard (arboard + wl-paste + xclip). |
| 📊 **Reports** | MD/HTML/JSON export with SHA-256 integrity hash. |

### 📸 Screenshots

> **Note**: screenshots will be uploaded to `docs/screenshots/` soon.
> Citation format: APA.

<!--
  TODO: uncomment once images exist in docs/screenshots/

  **Figure 1**
  *LESSSO C2 application startup* [Screenshot]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/01-dashboard.png

  ![Dashboard](docs/screenshots/01-dashboard.png)

  **Figure 2**
  *Nmap/RustScan scanner configuration* [Screenshot]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/02-scanner.png

  ![Scanner](docs/screenshots/02-scanner.png)

  **Figure 3**
  *Encrypted credential vault* [Screenshot]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/03-vault.png

  ![Vault](docs/screenshots/03-vault.png)

  **Figure 4**
  *Interactive network topology* [Screenshot]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/04-topology.png

  ![Topology](docs/screenshots/04-topology.png)

  **Figure 5**
  *Payload and reverse shell arsenal* [Screenshot]. (2025).
  Juan Romero. https://github.com/JuanRomeroHDZ/LESSSO-C2/blob/main/docs/screenshots/05-arsenal.png

  ![Arsenal](docs/screenshots/05-arsenal.png)
-->

### ⚠️ Prerequisites (core dependencies)

LESSSO C2 works as a **"brain"** orchestrating native tools. You MUST
have these binaries installed and available in `$PATH`:

1. **[Nmap](https://nmap.org/download.html)** — Required. Main scan engine.
2. **[RustScan](https://github.com/RustScan/RustScan)** — Optional, highly recommended for ultra-fast scans.
3. **OpenVPN** + **pkexec** — Required only on Linux for VPN auto-connect.
4. **[Gobuster](https://github.com/OJ/gobuster)** — Optional, for the fuzzing module.
5. **`wl-clipboard`** or **`xclip`** — Recommended on Linux (Wayland) for image paste.

### 🚀 Quick install

Download the installer from
**[Releases](https://github.com/JuanRomeroHDZ/LESSSO-C2/releases)**:

| OS | Format |
|----|--------|
| Linux (Debian/Ubuntu) | `.deb` |
| Linux (Fedora/RHEL) | `.rpm` |
| Linux (universal) | `.AppImage` |
| Windows | `.msi`, `.exe` |
| macOS | `.dmg` (Intel + Apple Silicon) |

Full details in [`docs/INSTALL.md`](docs/INSTALL.md).

### 🧑‍💻 Development

```bash
git clone https://github.com/JuanRomeroHDZ/LESSSO-C2.git
cd LESSSO-C2

# 1. Backend (FastAPI + Postgres + Redis)
cp .env.example .env
# Edit .env: POSTGRES_PASSWORD, NVD_API_KEY (optional)
docker compose up -d --build

# 2. Frontend (Tauri + Vite + React)
cd frontend
npm ci --legacy-peer-deps
npm run tauri dev
```

See [`docs/INSTALL.md`](docs/INSTALL.md) for the full guide and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for internal architecture.

### 🔐 Security

- **Vault encryption**: Argon2id (m=19 MiB, t=2, p=1) + AES-256-GCM. Key is zeroized after use.
- **Vault session**: master password lives in a module closure (`vaultSession.ts`), never in Zustand or `localStorage`.
- **Strict CSP**: `object-src 'none'`, `frame-ancestors 'none'`, `connect-src` limited to `localhost:8001`.
- **`.ovpn` validation**: blocks dangerous directives (`script-security`, `up`, `down`, `plugin`, `setenv`...).
- **XML sanitization**: strips `<!DOCTYPE` before parsing Nmap (mitigates XXE / billion laughs).
- **Bind to `127.0.0.1`**: all Docker services exposed to localhost only.

Report vulnerabilities responsibly (see [`SECURITY.md`](SECURITY.md), pending).

### 📜 License

**AGPL-3.0** — see [`LICENSE`](LICENSE).

Copyright (C) 2025 Juan Romero.

This means: you can use, modify and distribute LESSSO C2 **as long as**
you publish the source code of your modifications under the same
license, **even if you offer it as a network service**.

### ⚖️ Legal notice

LESSSO C2 is designed for **authorized security audits**, **CTFs** and
**practice labs**. Using these tools against systems without explicit
written authorization is **illegal** in most jurisdictions.

**The author is not responsible for misuse.** Use ethically.

---

<p align="center">
  Hecho con 🔰 por <a href="https://github.com/JuanRomeroHDZ">Juan Romero</a>
</p>
