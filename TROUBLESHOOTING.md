# Troubleshooting de LESSSO C2

Problemas conocidos y sus soluciones.

---

## 🐧 Linux

### `pkexec` no abre diálogo gráfico

**Síntoma**: al conectar VPN o lanzar Nmap con `-sS`, no aparece el
diálogo de autenticación.

**Causa**: falta un agente polkit.

**Solución**:

```bash
# Debian/Ubuntu
sudo apt install policykit-1 lxpolkit
# o en escritorios modernos:
sudo apt install polkit-kde-agent-1   # KDE
sudo apt install gnome-shell          # GNOME (ya viene)

# Fedora/RHEL
sudo dnf install polkit
```

Verifica que `pkexec` funciona:

```bash
pkexec echo "ok"
```

### La app no arranca (AppImage)

**Síntoma**: `./LESSSO-C2_0.1.6_amd64.AppImage` no hace nada o falla
con error de sandbox.

**Solución**:

```bash
chmod +x LESSSO-C2_0.1.6_amd64.AppImage
./LESSSO-C2_0.1.6_amd64.AppImage --no-sandbox
```

Si el problema persiste, prueba con `WEBKIT_DISABLE_COMPOSITING_MODE=1`:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 ./LESSSO-C2_0.1.6_amd64.AppImage
```

### Pegar imágenes del portapapeles no funciona

**Síntoma**: `paste_and_save_image` devuelve error "No se pudo leer la
imagen del portapapeles".

**Causa**: en Wayland, WebKitGTK no expone el paste al DOM. Necesitas
una herramienta externa.

**Solución**:

```bash
# Opción 1 (recomendado en Wayland):
sudo apt install wl-clipboard

# Opción 2 (X11 o fallback):
sudo apt install xclip
```

La app prueba en cascada: `arboard` → `wl-paste` → `xclip`.

### `libwebkit2gtk-4.1-dev` no encontrado

**Síntoma**: al compilar Tauri, error de dependencia.

**Solución** (Debian/Ubuntu):

```bash
sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev patchelf libgtk-3-dev
```

En Ubuntu 22.04 viene de `universe`. Si no lo encuentras:

```bash
sudo add-apt-repository universe
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev
```

### Error `Failed to load module canberra-gtk-module`

**Síntoma**: warning al arrancar la app (no bloquea).

**Solución**:

```bash
sudo apt install libcanberra-gtk-module libcanberra-gtk3-module
```

### Nmap requiere root pero no lo pide

**Síntoma**: `run_nmap` con `-sS` falla silenciosamente.

**Causa**: `pkexec` no está instalado o no funciona.

**Solución**:

```bash
sudo apt install pkexec
pkexec nmap --version
```

Si `pkexec` funciona pero la app no lo usa, verifica que estás en
Linux (`#[cfg(target_os = "linux")]` en `lib.rs`).

### Permisos en Docker (`permission denied` en socket)

**Síntoma**: `docker compose up` falla con "permission denied while
trying to connect to the Docker daemon socket".

**Solución**:

```bash
sudo usermod -aG docker $USER
newgrp docker   # o cierra sesión y vuelve a entrar
docker ps
```

---

## 🪟 Windows

### SmartScreen bloquea el instalador

**Síntoma**: "Windows protegió su PC".

**Solución**: **Más información** → **Ejecutar de todas formas**.

El instalador no está firmado digitalmente (coste del certificado).
Si quieres firmarlo, mira [Tauri code signing](https://tauri.app/v1/guides/distribution/sign-windows/).

### Nmap no se encuentra en `PATH`

**Síntoma**: `run_nmap` falla con "os error 2".

**Solución**: reinstala Nmap marcando "Add to PATH", o añade manualmente:

```powershell
$env:PATH += ";C:\Program Files (x86)\Nmap"
```

Verifica en PowerShell:

```powershell
nmap --version
```

### WebView2 no instalado

**Síntoma**: la app no arranca, error de WebView2.

**Solución**: descarga e instala
[WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
En Windows 10+ suele venir preinstalado; en versiones antiguas no.

---

## 🍎 macOS

### "No se puede abrir porque proviene de un desarrollador no identificado"

**Solución**:

```bash
xattr -dr com.apple.quarantine "/Applications/LESSSO C2.app"
```

O clic derecho → **Abrir** → **Abrir**.

### Apple Silicon: app dice "dañada"

**Síntoma**: al abrir el `.dmg` en M1/M2/M3, macOS dice que la app
está dañada.

**Causa**: binario no firmado + Gatekeeper.

**Solución**:

```bash
sudo xattr -cr "/Applications/LESSSO C2.app"
```

Si persiste, verifica el binario:

```bash
codesign -dv "/Applications/LESSSO C2.app"
```

---

## 🐍 Backend / Docker

### `Connection refused` al backend

**Síntoma**: la app no puede conectar a `http://127.0.0.1:8001`.

**Solución**:

```bash
docker compose ps        # ¿api está up?
docker compose logs api  # ¿errores?
curl http://127.0.0.1:8001/
```

Si el puerto está ocupado:

```bash
sudo lsof -i :8001
# Cambia API_HOST_PORT en .env
```

### Postgres: puerto ocupado

**Síntoma**: `docker compose up` falla porque `5433` está ocupado.

**Solución**: cambia `POSTGRES_HOST_PORT` en `.env`:

```bash
POSTGRES_HOST_PORT=127.0.0.1:5434
```

Y reinicia:

```bash
docker compose down
docker compose up -d
```

### Redis: cache deshabilitado

**Síntoma**: `/api/cves/_status` devuelve `"cache_enabled": false`.

**Causa**: Redis no responde, o `CVE_CACHE_REQUIRED=false` (best-effort).

**Solución**:

```bash
docker compose logs redis
docker compose restart redis
```

Si `CVE_CACHE_REQUIRED=true`, la API no arranca sin Redis. Cámbialo a
`false` en `.env` para modo best-effort.

### NVD 403 / 429 (rate limit)

**Síntoma**: matching de CVEs lento o con errores HTTP.

**Causa**: sin API key, NVD limita a 5 req / 30s.

**Solución**: pide una key gratis:

1. https://nvd.nist.gov/developers/request-an-api-key
2. Añádela a `.env`: `NVD_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
3. Reinicia: `docker compose restart api`

Verifica:

```bash
curl http://127.0.0.1:8001/api/cves/_status
# "nvd_key_configured": true
```

### Migraciones: columna `cpe` no existe

**Síntoma**: `column ports.cpe does not exist`.

**Causa**: tabla creada por versión antigua sin las columnas nuevas.

**Solución**: reinicia el API (aplica `_run_light_migrations`):

```bash
docker compose restart api
docker compose logs api | grep -i migra
```

Si persiste, borra el volumen (**pierdes datos**):

```bash
docker compose down -v
docker compose up -d --build
```

### CORS bloquea el frontend

**Síntoma**: en la consola del WebView: `CORS policy: No 'Access-Control-Allow-Origin'`.

**Causa**: `FRONTEND_URL` en `.env` no incluye el origen del frontend.

**Solución**: edita `.env`:

```bash
FRONTEND_URL=http://localhost:5173,tauri://localhost,http://tauri.localhost
```

Reinicia: `docker compose restart api`.

---

## 🦀 Tauri / Rust

### `cargo build` falla por `libssl`

**Síntoma**: error de `openssl-sys`.

**Solución**:

```bash
# Debian/Ubuntu
sudo apt install libssl-dev pkg-config

# Fedora
sudo dnf install openssl-devel
```

### `cargo test` falla por falta de display

**Síntoma**: tests de Tauri fallan en CI/headless.

**Solución**: usa `xvfb-run`:

```bash
xvfb-run cargo test --lib
```

En CI el workflow ya usa `ubuntu-22.04` con deps instaladas.

### `setsid()` falla en el hijo

**Síntoma**: log `[pre_exec_setsid] setsid() falló`.

**Causa**: el hijo ya es líder de sesión (raro).

**Impacto**: mínimo. `kill(-pgid)` podría no funcionar; el `pkill` de
`kill_sweep` cubre el caso.

---

## 🧪 Frontend / Build

### `npm ci` falla con peer deps

**Síntoma**: `ERESOLVE unable to resolve dependency tree`.

**Solución**: usa `--legacy-peer-deps` (ya está en CI):

```bash
npm ci --legacy-peer-deps
```

### `vite` no encuentra `@tauri-apps/api`

**Síntoma**: error de import en dev.

**Solución**:

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### `parsedData.map is not a function`

**Síntoma**: crash al arrancar la app tras actualizar.

**Causa**: `localStorage` con esquema antiguo.

**Solución**:

1. Abre DevTools (clic derecho → Inspeccionar) → Application → Local Storage.
2. Borra las keys `lessso-c2-*`.
3. Recarga.

El `scanStore` ya tiene `sanitizeHosts` y `onRehydrateStorage` para
prevenir esto, pero versiones muy antiguas pueden colarse.

---

## 🆘 ¿Nada de esto funciona?

1. Busca en los [issues existentes](https://github.com/JuanRomeroHDZ/LESSSO-C2/issues).
2. Abre un issue nuevo con la plantilla y adjunta:
   - Versión de LESSSO C2.
   - SO y versión.
   - Logs (app + `docker compose logs api`).
   - Pasos reproducibles.
```
