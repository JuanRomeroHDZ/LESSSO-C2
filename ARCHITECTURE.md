# Arquitectura de LESSSO C2

Documento técnico de la arquitectura interna del proyecto.

---

## 📐 Vista general

LESSSO C2 es una aplicación **Tauri 2** (Rust + WebView) con un
**backend FastAPI** opcional para persistencia y enriquecimiento de CVEs.

```
┌──────────────────────────────────────────────────────────────────┐
│                       LESSSO C2 (Tauri App)                      │
│                                                                  │
│  ┌────────────────────┐        IPC         ┌──────────────────┐  │
│  │   React 19 (UI)    │ ◄────────────────► │  Rust Core       │  │
│  │   Zustand stores   │   invoke / emit    │  (lib.rs)        │  │
│  │   Vite dev server  │                    │                  │  │
│  └────────┬───────────┘                    │  • Nmap spawn    │  │
│           │                                │  • XML parser    │  │
│           │                                │  • Argon2id/AES  │  │
│           │                                │  • Terminals     │  │
│           │                                │  • VPN pkexec    │  │
│           │                                │  • Clipboard     │  │
│           │                                └────────┬─────────┘  │
│           │                                         │            │
│           │ HTTP (fetch)                            │ spawn      │
│           ▼                                         ▼            │
│  ┌────────────────────┐                    ┌──────────────────┐  │
│  │  Backend FastAPI   │                    │  Binarios OS     │  │
│  │  (Docker)          │                    │  nmap, rustscan, │  │
│  │                    │                    │  openvpn, nc,    │  │
│  │  • /api/scans      │                    │  gobuster, ...   │  │
│  │  • /api/cves/match │                    └──────────────────┘  │
│  │  • /api/cves/{id}  │                                          │
│  └────────┬───────────┘                                          │
│           │                                                      │
│           │ asyncpg / redis.asyncio                              │
│           ▼                                                      │
│  ┌────────────────────┐    ┌──────────────────┐                  │
│  │  Postgres 17       │    │  Redis 7         │                  │
│  │  (scan_reports,    │    │  (cache CVEs,    │                  │
│  │   hosts, ports)    │    │   TTL 24h)       │                  │
│  └────────────────────┘    └──────────────────┘                  │
│           ▲                                                      │
│           │ HTTPS                                                │
│           │                                                      │
│  ┌────────┴───────────┐                                          │
│  │  NVD API v2        │  (services.nvd.nist.gov)                 │
│  └────────────────────┘                                          │
└──────────────────────────────────────────────────────────────────┘
```

**Dos modos de operación**:

1. **Standalone** (sin backend): la app funciona 100% local. Escaneos,
   vault, arsenal, terminales, reportes. El botón "sync con backend"
   falla silenciosamente (best-effort).
2. **Full stack** (con backend): añade persistencia de escaneos en
   Postgres y enriquecimiento de CVEs vía NVD (con cache en Redis).

---

## 🧱 Capas del frontend

### `frontend/src/core/` — Núcleo transversal

| Path | Responsabilidad |
|------|-----------------|
| `core/data/` | Datasets estáticos: `reverse-shells.ts`, `vuln-payloads.ts`, `service-payloads.ts`, `mitre.ts`, `arsenal-types.ts`. |
| `core/store/` | Stores Zustand. Uno por dominio: `scanStore`, `vaultStore`, `uiStore`, `networkStore`, `arsenalStore`, `redteamStore`. `vaultSession.ts` mantiene la master password fuera del store. `useScanStore.ts` es un wrapper legacy. |
| `core/api/` | *(vacío actualmente — pendiente de migrar)* |

### `frontend/src/features/` — Dominios funcionales

| Feature | Archivos | Propósito |
|---------|----------|-----------|
| `dashboard/` | `DashboardPanel.tsx` | Vista principal con resumen de hosts/puertos/CVEs. |
| `scanner/` | `ScanConfig.tsx`, `TerminalPanel.tsx` | Configuración Nmap/RustScan + terminal de salida. |
| `intel/` | `MitrePanel.tsx` | Panel MITRE ATT&CK. |
| `vault/` | `VaultWorkspace.tsx` | Bóveda de credenciales. |
| `redteam/` | `NotesPanel.tsx`, `WhiteboardPanel.tsx` | Notas con auto-tagging MITRE + whiteboard. |
| `fuzzing/` | `FuzzingPanel.tsx` | Gobuster dir. |
| `topology/` | `TopologyPanel.tsx` | Grafo React Flow. |
| `toolbox/` | `ArsenalLayout.tsx`, `DecodersTool.tsx`, `ListenerTool.tsx`, `PayloadsTool.tsx`, `ServicePayloadsTool.tsx`, `VulnPayloadsTool.tsx` | Arsenal unificado (shells, vulns, servicios, decoders, listeners). |

### `frontend/src/services/api.ts`

Wrapper `fetch` con:
- Base URL configurable vía `VITE_API_URL` (default `http://127.0.0.1:8001`).
- Timeout con `AbortController` (20s por defecto).
- Errores normalizados en `ApiError`.

### `frontend/src/components/layout/`

| Componente | Propósito |
|------------|-----------|
| `Header.tsx` | Barra superior: VPN, backend status, tema, timer. |
| `Sidebar.tsx` | Navegación entre workspaces. |
| `WorkspaceRouter.tsx` | Router de workspaces. |
| `ExamTimer.tsx` | Timer para exámenes (CPTS, OSCP...). |
| `Footer.tsx` | Pie con info de versión. |

---

## 🦀 Rust Core (`frontend/src-tauri/src/lib.rs`)

Todos los comandos expuestos a JS vía `#[tauri::command]`.

### Cifrado / bóveda

| Comando | Firma | Propósito |
|---------|-------|-----------|
| `encrypt_vault` | `(data: String, password: String) -> String` | Cifra con Argon2id + AES-256-GCM. Devuelve Base64 (`version ‖ salt ‖ nonce ‖ ciphertext`). |
| `decrypt_vault` | `(encrypted_data: String, password: String) -> String` | Descifra. Error si password incorrecta o datos corruptos. |

**Parámetros Argon2id**: `m=19_456 KiB (19 MiB)`, `t=2`, `p=1`, `output=32 bytes`.
**AES-GCM**: nonce 12 bytes aleatorio por operación.
**Zeroización**: la clave se limpia con `zeroize` tras usarla.

### Clipboard / screenshots

| Comando | Propósito |
|---------|-----------|
| `save_clipboard_image` | Guarda un data URL (PNG/BMP) como PNG real en `$APPDATA/screenshots/`. |
| `paste_and_save_image` | Lee del portapapeles con `arboard` → `wl-paste` → `xclip` (fallback en cascada). |

### Red / VPN

| Comando | Propósito |
|---------|-----------|
| `get_network_interfaces` | Lista interfaces (excepto `lo`). |
| `check_vpn` | Detecta IP de `tun0`. |
| `connect_vpn` | Valida `.ovpn` y ejecuta `pkexec openvpn --script-security 0 --daemon`. |
| `disconnect_vpn` | `pkexec killall openvpn` con fallbacks. |

**Validación de `.ovpn`**: bloquea directivas peligrosas (`script-security`,
`up`, `down`, `plugin`, `iproute`, `setenv`, `chroot`, `user`, `group`...).

### Nmap / RustScan

| Comando | Propósito |
|---------|-----------|
| `run_nmap` | Spawnea Nmap con `pkexec` si necesita root. Emite eventos `nmap-output` y `nmap-structured-data`. |
| `run_rustscan` | Similar, con `rustscan -b 4500 --accessible`. |
| `cancel_nmap` | Mata el process group del scan. |

**Parser XML** (`parse_nmap_xml`):
- Sanea `<!DOCTYPE` (mitiga XXE / billion laughs).
- Extrae: metadatos `nmaprun`, hosts (IP, MAC, hostnames, OS, uptime, distance), puertos (state, service, version, CPEs, scripts NSE), extraports, scripts de host.
- Deduplica hosts por IP (merge).
- Devuelve JSON serializado con forma `ScanResult`.

### Terminales (por process group)

| Comando | Propósito |
|---------|-----------|
| `start_terminal` | Spawnea con `setsid()` vía `pre_exec`. Emite `term-output-{sid}` y `term-exit-{sid}`. |
| `write_terminal` | Escribe a stdin. |
| `send_terminal_signal` | SIGINT / SIGTSTP / SIGTERM / SIGKILL a un PID. |
| `kill_terminal` | Mata el process group completo. |
| `kill_all_terminals` | Mata todas las sesiones (con `pkill` de seguridad). |

**Arquitectura por process group**: el hijo es líder de su propio
process group (`setsid()`). Al matar, `kill(-pgid, SIGKILL)` tumba al
proceso Y a todos sus descendientes.

### Fuzzer

| Comando | Propósito |
|---------|-----------|
| `run_fuzzer` | Gobuster dir. Emite `fuzzer-output` y `fuzzer-finished`. |

### Kill sweep

Al cerrar la ventana (`CloseRequested`) o la app (`RunEvent::Exit`), se
ejecuta `kill_sweep()`:
1. Mata todos los process groups de terminales.
2. `pkill -9 -f` sobre `nc -lvnp`, `bash -i`, `lessso-bash-`, `gobuster`.
3. Mata el scan en curso si lo hay.

---

## 🐍 Backend (FastAPI)

### Estructura

```
backend/app/
├── api/
│   ├── __init__.py
│   └── routes/
│       ├── __init__.py        # exporta cve_router
│       └── cve.py             # /api/cves/match, /api/cves/{id}, /api/cves/_status
├── core/
│   └── config.py              # Settings desde env
├── db/
│   ├── database.py            # engine, async_session, get_db
│   └── models/
│       └── scan.py            # ScanReportModel, HostModel, PortModel
├── services/
│   ├── __init__.py
│   ├── cve_cache.py           # Redis async (best-effort)
│   └── cve_matcher.py         # NVD API v2 + filtrado por versión
└── main.py                    # FastAPI app, CORS, lifespan, /api/scans
```

### Endpoints

| Método | Path | Propósito |
|--------|------|-----------|
| `GET` | `/` | Health check. |
| `POST` | `/api/scans` | Guarda un reporte completo (hosts + puertos + CVEs). |
| `POST` | `/api/cves/match` | Recibe `{items: [{service, version, cpe[]}]}` y devuelve CVEs. |
| `GET` | `/api/cves/{cve_id}` | Devuelve un CVE concreto (con cache). |
| `GET` | `/api/cves/_status` | Diagnóstico del cache y del cliente NVD. |

### Migraciones

**No usa Alembic.** El startup hace:
1. `Base.metadata.create_all` (crea tablas que no existen).
2. `_run_light_migrations()`: `ALTER TABLE ports ADD COLUMN IF NOT EXISTS cpe/cves TEXT`.

Esto es un parche para dev. En producción debería migrarse a Alembic.

### Cache Redis

- Key: `cve:match:{sha1(namespace)}` o `cve:id:{CVE_ID}`.
- Valor: JSON serializado.
- TTL: `CVE_CACHE_TTL_S` (default 24h).
- **Best-effort**: si Redis cae, `enabled=False` y todos los métodos son no-op.
  El matcher sigue funcionando, solo pierde cacheo.

### NVD matcher

1. Si el item trae CPEs (del parser Nmap), los usa contra NVD con `virtualMatchString`.
2. Si no, construye CPE con tabla heurística `service → (vendor, product)`.
3. **Filtra por versión real** usando `configurations[].nodes[].cpeMatch[]`
   (`versionStartIncluding`, `versionEndExcluding`, etc.).
4. Rate limit: 5 req/30s sin key, 50 req/30s con key. Serializado con
   `Semaphore(1)` + intervalo mínimo.
5. Retries: 3 con backoff exponencial.

---

## 🗄️ Modelo de datos

```
scan_reports
├── id (PK)
├── target (index)
├── scan_duration
└── created_at

hosts
├── id (PK)
├── report_id (FK → scan_reports.id, ON DELETE CASCADE, index)
├── ip (index)
├── mac
├── mac_vendor
├── status
└── os

ports
├── id (PK)
├── host_id (FK → hosts.id, ON DELETE CASCADE, index)
├── portid
├── protocol
├── state
├── reason
├── service
├── version
├── cpe   (TEXT, JSON serializado)
├── cves  (TEXT, JSON serializado)
└── INDEX (service, version)
```

**Nota**: `cpe` y `cves` se guardan como TEXT (JSON) para no acoplar el
esquema a NVD, que cambia.

---

## 🔐 Seguridad

| Área | Medida |
|------|--------|
| Cifrado vault | Argon2id (m=19 MiB, t=2, p=1) + AES-256-GCM. Clave zeroizada. |
| Master password | Nunca en Zustand ni en `localStorage`. Vive en `vaultSession.ts` (closure de módulo). |
| CSP | `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `connect-src` limitado. |
| `.ovpn` | Validación de directivas peligrosas (allowlist implícita). |
| XML Nmap | Saneado de `<!DOCTYPE` (anti-XXE). |
| Docker | Bind a `127.0.0.1` en todos los servicios. |
| CORS | Solo orígenes en `FRONTEND_URL`. `allow_credentials=False`. |
| Process groups | `setsid()` + `kill(-pgid)` para evitar procesos huérfanos. |

---

## 🧭 Decisiones de diseño

### ¿Por qué Tauri y no Electron?

- **Binario 10x más pequeño** (~10 MB vs ~100 MB).
- **Menos RAM** (usa WebView nativo del SO).
- **Rust en el core** → spawn de procesos, cifrado y parsing XML son nativos.
- **Seguridad**: CSP estricto, sin Node.js en el renderer, IPC explícito.

### ¿Por qué Zustand y no Redux?

- Menos boilerplate.
- Sin providers.
- `persist` middleware nativo para `localStorage`.
- Fácil de dividir en stores por dominio.

### ¿Por qué SQLAlchemy async + asyncpg?

- FastAPI es async → bloquear el event loop con psycopg2 sería un crimen.
- `asyncpg` es el driver más rápido para Postgres.
- `sqlalchemy[asyncio]` requiere `greenlet` (está en `requirements.txt`).

### ¿Por qué no Alembic (todavía)?

- El proyecto está en fase temprana.
- `create_all` + `ALTER TABLE IF NOT EXISTS` cubre el 90% de los casos.
- **Deuda técnica conocida**. Se migrará cuando el esquema se estabilice.

### ¿Por qué el matcher filtra por versión?

NVD devuelve CVEs de **todas** las versiones de un producto. Sin
filtrado, un OpenSSH 9.9 recibiría CVEs de OpenSSH 2.x (irrelevantes).
El filtro usa los rangos `versionStartIncluding` / `versionEndExcluding`
que NVD expone en `configurations`.

### ¿Por qué process groups en las terminales?

`bash -i` spawnea hijos (`nmap`, `python`, `nc`). Matar solo el PID de
bash deja huérfanos corriendo. `setsid()` + `kill(-pgid)` mata el árbol
completo. Además `kill_sweep` hace `pkill` por patrón como red de
seguridad.

---

## 🧾 Deuda técnica conocida

| Área | Descripción | Prioridad |
|------|-------------|-----------|
| Migraciones | Usar Alembic en vez de `create_all` + `ALTER` manual. | 🟠 Media |
| Renombrado | `juanmap-stack`, `juanmap_*` (contenedores), `juanmap_pgdata` (volumen), `com.juanmap.desktop` (identifier) siguen con nombre antiguo. Renombrar con plan de migración. | 🟠 Media |
| `core/api/` | Directorio vacío. Migrar el wrapper `services/api.ts` aquí. | 🟡 Baja |
| `useScanStore` | Wrapper legacy que combina 6 stores. Re-render en cascada. Migrar componentes a stores específicos. | 🟠 Media |
| Tests | Backend sin suite de tests. Rust con tests mínimos. | 🔴 Alta |
| `SECURITY.md` | Pendiente de crear. | 🟡 Baja |

---

## 📚 Referencias

- [Tauri 2 docs](https://tauri.app/)
- [React 19 docs](https://react.dev/)
- [Zustand docs](https://zustand.docs.pmnd.rs/)
- [FastAPI docs](https://fastapi.tiangolo.com/)
- [SQLAlchemy async](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [NVD API v2](https://nvd.nist.gov/developers/vulnerabilities)
- [MITRE ATT&CK](https://attack.mitre.org/)
