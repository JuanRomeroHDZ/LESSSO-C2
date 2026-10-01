# Terceros y atribuciones

LESSSO C2 se distribuye bajo **AGPL-3.0**. Este documento lista las
dependencias de terceros y sus licencias.

---

## 🦀 Rust / Tauri

| Crate | Licencia | Uso |
|-------|----------|-----|
| `tauri` | MIT / Apache-2.0 | Framework de la app. |
| `tauri-plugin-log` | MIT / Apache-2.0 | Logging. |
| `tauri-plugin-notification` | MIT / Apache-2.0 | Notificaciones de sistema. |
| `tauri-plugin-dialog` | MIT / Apache-2.0 | Diálogos nativos. |
| `tauri-plugin-fs` | MIT / Apache-2.0 | Acceso a filesystem. |
| `tauri-plugin-shell` | MIT / Apache-2.0 | Spawn de procesos. |
| `serde` / `serde_json` | MIT / Apache-2.0 | Serialización. |
| `roxmltree` | MIT / Apache-2.0 | Parser XML de Nmap. |
| `base64` | MIT / Apache-2.0 | Codificación. |
| `aes-gcm` | MIT / Apache-2.0 | Cifrado de la bóveda. |
| `argon2` | MIT / Apache-2.0 | Derivación de clave. |
| `rand` | MIT / Apache-2.0 | Aleatoriedad. |
| `zeroize` | MIT / Apache-2.0 | Zeroización de claves. |
| `arboard` | MIT / Apache-2.0 | Acceso al portapapeles. |
| `image` | MIT / Apache-2.0 | Procesamiento BMP → PNG. |
| `libc` | MIT / Apache-2.0 | Llamadas POSIX (`setsid`, `kill`). |

## ⚛️ Frontend (npm)

| Paquete | Licencia | Uso |
|---------|----------|-----|
| `react`, `react-dom` | MIT | UI. |
| `@tauri-apps/api` | MIT / Apache-2.0 | Puente con Rust. |
| `@tauri-apps/cli` | MIT / Apache-2.0 | Build tooling. |
| `@tauri-apps/plugin-*` | MIT / Apache-2.0 | Plugins. |
| `zustand` | MIT | Estado global. |
| `reactflow` | MIT | Grafo de topología. |
| `recharts` | MIT | Gráficas del dashboard. |
| `react-markdown` | MIT | Render de Markdown. |
| `remark-gfm` | MIT | Extensiones GFM. |
| `rehype-sanitize` | MIT | Saneado HTML. |
| `@xterm/xterm` | MIT | Terminal en el WebView. |
| `@xterm/addon-fit` | MIT | Ajuste de terminal. |
| `vite` | MIT | Bundler. |
| `typescript` | Apache-2.0 | Tipado. |
| `tailwindcss` | MIT | Estilos. |
| `vitest` | MIT | Tests. |
| `@testing-library/*` | MIT | Tests de UI. |
| `oxlint` | MIT | Linter. |

## 🐍 Backend (Python)

| Paquete | Licencia | Uso |
|---------|----------|-----|
| `fastapi` | MIT | Framework API. |
| `uvicorn` | BSD-3-Clause | ASGI server. |
| `pydantic` | MIT | Validación. |
| `sqlalchemy` | MIT | ORM. |
| `asyncpg` | Apache-2.0 | Driver Postgres async. |
| `redis` | MIT | Cliente Redis async. |
| `httpx` | BSD-3-Clause | Cliente HTTP (NVD). |

## 🗄️ Servicios

| Servicio | Licencia | Uso |
|----------|----------|-----|
| PostgreSQL | PostgreSQL License | Base de datos. |
| Redis | BSD-3-Clause | Cache. |
| NVD API | Dominio público (US Gov) | CVEs. |

## 🎨 Recursos gráficos

- **Iconos de la app**: generados con `tauri icon` a partir de un PNG base.
  Licencia: la misma que el proyecto (AGPL-3.0).
- **Emojis** en la UI: fuente del sistema (Noto Color Emoji, Apple Color Emoji, etc.).
- **Fuentes**: no se distribuyen fuentes custom. La app usa la fuente
  del sistema operativo.

## 📚 Datos

- **MITRE ATT&CK**: la información de técnicas/tácticas proviene de
  [attack.mitre.org](https://attack.mitre.org/) y está bajo
  [MITRE ATT&CK Terms of Use](https://attack.mitre.org/resources/terms-of-use/).
  Uso libre para fines defensivos y de investigación.
- **NVD**: datos de CVEs en dominio público (US Government work).
- **Payloads**: reverse shells, vuln payloads y service payloads son
  recopilaciones de técnicas públicas ampliamente documentadas
  (PayloadsAllTheThings, HackTricks, GTFOBins, etc.). Se distribuyen
  bajo AGPL-3.0 como parte del proyecto.

## 🔧 Herramientas orquestadas (no incluidas)

LESSSO C2 **no incluye** estas herramientas, solo las invoca si están
instaladas en el sistema:

| Herramienta | Licencia | Uso |
|-------------|----------|-----|
| Nmap | GPL-2.0 | Escaneo. |
| RustScan | GPL-3.0 | Escaneo rápido. |
| OpenVPN | GPL-2.0 | VPN. |
| Gobuster | Apache-2.0 | Fuzzing. |
| Netcat | GPL-2.0 | Listeners. |
| Impacket | Apache-2.0 | (Futuro) ataques AD. |
| ffuf | MIT | (Futuro) fuzzing web. |

El usuario es responsable de cumplir las licencias de estas
herramientas por separado.

---

**Última actualización**: 2026-10-01
