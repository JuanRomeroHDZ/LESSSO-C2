# Instalación de LESSSO C2

Guía de instalación para **usuario final** y **desarrollador**.

---

## 👤 Para usuarios finales

### Descarga

Ve a la pestaña de **[Releases](https://github.com/JuanRomeroHDZ/LESSSO-C2/releases)**
y descarga el instalador para tu sistema operativo.

| SO | Formato | Notas |
|----|---------|-------|
| Linux (Debian/Ubuntu) | `.deb` | Recomendado en Debian/Ubuntu. |
| Linux (Fedora/RHEL) | `.rpm` | Recomendado en Fedora/RHEL. |
| Linux (universal) | `.AppImage` | Portable, sin instalación. |
| Windows | `.msi` o `.exe` | `.msi` requiere permisos de admin. |
| macOS | `.dmg` | Universal (Intel + Apple Silicon). |

### Dependencias del sistema

LESSSO C2 **orquesta herramientas nativas**. Debes instalarlas aparte:

#### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y nmap openvpn pkexec wl-clipboard
# Opcionales:
sudo apt install -y gobuster
# RustScan: ver https://github.com/RustScan/RustScan#-installation
```

#### Linux (Fedora/RHEL)

```bash
sudo dnf install -y nmap openvpn polkit wl-clipboard
# Opcionales:
sudo dnf install -y gobuster
```

#### macOS

```bash
brew install nmap
# Opcionales:
brew install gobuster
```

#### Windows

Descarga los instaladores oficiales:
- [Nmap](https://nmap.org/download.html)
- [RustScan](https://github.com/RustScan/RustScan/releases)
- [Gobuster](https://github.com/OJ/gobuster/releases)

Asegúrate de que estén en `PATH`.

### Instalación

#### Linux — `.deb`

```bash
sudo dpkg -i lessso-c2_0.1.6_amd64.deb
sudo apt-get install -f  # resuelve dependencias
```

#### Linux — `.rpm`

```bash
sudo rpm -i lessso-c2-0.1.6.x86_64.rpm
```

#### Linux — `.AppImage`

```bash
chmod +x LESSSO-C2_0.1.6_amd64.AppImage
./LESSSO-C2_0.1.6_amd64.AppImage
```

> **Nota**: en algunas distros el AppImage puede requerir `--no-sandbox`:
> ```bash
> ./LESSSO-C2_0.1.6_amd64.AppImage --no-sandbox
> ```

#### macOS

Abre el `.dmg` y arrastra LESSSO C2 a Aplicaciones.

Si macOS bloquea la app ("no se puede abrir porque proviene de un
desarrollador no identificado"):

1. Clic derecho sobre el `.app` → **Abrir** → **Abrir** de nuevo.
2. O bien: `xattr -dr com.apple.quarantine /Applications/LESSSO\ C2.app`

#### Windows

Ejecuta el `.msi` o el `.exe` y sigue el asistente.

Si SmartScreen bloquea: **Más información** → **Ejecutar de todas formas**.

### Primer arranque

Al abrir LESSSO C2 por primera vez:

1. La app detecta dependencias (Nmap, etc.).
2. Los stores se inicializan vacíos.
3. **Recomendado**: configurar una master password en el Vault.

### Uso del backend (opcional)

Para habilitar persistencia de escaneos y enriquecimiento de CVEs:

```bash
# En la raíz del repo clonado:
cp .env.example .env
# Edita .env (POSTGRES_PASSWORD, NVD_API_KEY)
docker compose up -d
```

El backend escucha en `http://127.0.0.1:8001`.

---

## 🧑‍💻 Para desarrolladores

### Prerrequisitos

| Herramienta | Versión mínima | Notas |
|-------------|----------------|-------|
| Node.js | **22 LTS** | `nvm install 22` |
| npm | 10+ | Viene con Node 22. |
| Rust | **1.90** | `rustup install stable` |
| Docker | 24+ | Solo si tocas el backend. |
| Docker Compose | v2 | Plugin de Docker. |
| Python | 3.13 | Solo si corres el backend fuera de Docker. |
| Git | 2.40+ | |

Verifica:

```bash
node -v   # v22.x
npm -v    # 10.x
rustc -V  # rustc 1.90.x
cargo -V  # cargo 1.90.x
docker -v
docker compose version
```

### Dependencias del sistema (Linux)

Para compilar Tauri necesitas WebKitGTK y otras libs:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  librsvg2-dev \
  patchelf \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libxdo-dev
```

### Clonar y configurar

```bash
git clone https://github.com/JuanRomeroHDZ/LESSSO-C2.git
cd LESSSO-C2
```

### Backend

```bash
cp .env.example .env
```

Edita `.env` con valores seguros:

```bash
POSTGRES_USER=lessso_admin
POSTGRES_PASSWORD=$(openssl rand -base64 32)
POSTGRES_DB=lessso_c2_db
POSTGRES_HOST_PORT=127.0.0.1:5433
REDIS_HOST_PORT=127.0.0.1:6380
API_HOST_PORT=127.0.0.1:8001
DATABASE_URL=postgresql+asyncpg://lessso_admin:<PASSWORD>@db:5432/lessso_c2_db
REDIS_URL=redis://redis:6379/0
NVD_API_KEY=<tu_api_key>  # opcional, https://nvd.nist.gov/developers/request-an-api-key
```

Levanta el stack:

```bash
docker compose up -d --build
docker compose logs -f api
```

Verifica:

```bash
curl http://127.0.0.1:8001/
# {"status":"ok","service":"LESSSO C2 Backend Engine"}

curl http://127.0.0.1:8001/api/cves/_status
# {"cache_enabled":true,"nvd_key_configured":false,...}
```

### Frontend

```bash
cd frontend
npm ci --legacy-peer-deps
npm run tauri dev
```

La primera compilación tarda varios minutos (compila Rust).

### Tests

```bash
# Frontend
cd frontend
npm run lint
npm test

# Rust
cd frontend/src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --lib

# Backend (pendiente de suite)
cd backend
# pytest
```

### Build de producción

```bash
cd frontend
npm run tauri build
```

Artefactos en `frontend/src-tauri/target/release/bundle/`.

### Estructura de ramas

- `main` → estable.
- `feat/...`, `fix/...`, `docs/...`, `chore/...` → trabajo.

Ver [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 🐳 Stack Docker

`compose.yaml` levanta 3 servicios:

| Servicio | Imagen | Puerto host | Notas |
|----------|--------|-------------|-------|
| `api` | Build local (`backend/Dockerfile`) | `127.0.0.1:8001` | FastAPI + uvicorn. |
| `db` | `postgres:17-alpine` | `127.0.0.1:5433` | Volumen `juanmap_pgdata`. |
| `redis` | `redis:7-alpine` | `127.0.0.1:6380` | Cache CVEs. |

Comandos útiles:

```bash
docker compose ps                 # estado
docker compose logs -f api        # logs del API
docker compose restart api        # reiniciar API
docker compose down               # parar todo
docker compose down -v            # parar + borrar volumen (¡pierde datos!)
```

---

## 🔄 Actualizar

### App

Descarga el nuevo instalador de Releases y repite la instalación.

### Backend (Docker)

```bash
git pull
docker compose up -d --build
```

Las migraciones ligeras se aplican al arrancar.

---

## 📚 Ver también

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — Arquitectura interna.
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — Problemas conocidos.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — Cómo contribuir.
```
