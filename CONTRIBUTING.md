# Contribuir a LESSSO C2

¡Gracias por tu interés en contribuir! Este documento describe el flujo
de trabajo, los estándares de código y el proceso de revisión para
LESSSO C2.

---

## 📜 Código de conducta

Al participar en este proyecto aceptas mantener un ambiente respetuoso
y profesional. No se toleran:

- Ataques personales, discriminación o acoso.
- Spam, autopromoción no solicitada o discusiones fuera de tema.
- Publicación de información privada de otros usuarios.

Los maintainers pueden cerrar issues o PRs que violen estas normas.

---

## 🐛 Reportar bugs

Antes de abrir un issue:

1. **Busca** en los issues existentes si ya está reportado.
2. **Reproduce** el bug en la última versión (`main` o último release).
3. **Comprueba** que no sea un problema de entorno (ver
   [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)).

Al abrir el issue, usa la plantilla y adjunta:

- **Versión de LESSSO C2** (`v0.1.6`, etc.).
- **SO y versión** (`uname -a` en Linux, versión de Windows/macOS).
- **Pasos reproducibles** (1, 2, 3...).
- **Comportamiento esperado vs. observado**.
- **Logs** (`docker compose logs api`, salida de la consola de la app).
- **Capturas** si aplica.

---

## 💡 Proponer features

Abre un issue con la plantilla `feature_request.md`. Describe:

- **Problema** que resuelve (no la solución).
- **Alternativas** que consideraste.
- **Contexto** de uso (¿es para CTFs, pentesting profesional, docencia?).

Discutimos el diseño antes de escribir código.

---

## 🛠️ Setup de desarrollo

Guía completa en [`docs/INSTALL.md`](docs/INSTALL.md). Resumen:

```bash
git clone https://github.com/JuanRomeroHDZ/LESSSO-C2.git
cd LESSSO-C2

# Backend + DB + Redis
cp .env.example .env
# Edita .env (POSTGRES_PASSWORD, NVD_API_KEY, etc.)
docker compose up -d --build

# Frontend (Tauri + Vite)
cd frontend
npm ci --legacy-peer-deps
npm run tauri dev
```

---

## 🌿 Flujo de ramas

- `main` → siempre estable, protegida.
- `feat/<nombre-corto>` → nueva feature.
- `fix/<nombre-corto>` → corrección de bug.
- `docs/<nombre-corto>` → solo documentación.
- `chore/<nombre-corto>` → mantenimiento (deps, CI, refactor).

Ejemplos:

```bash
git checkout -b feat/workspace-persistence
git checkout -b fix/vault-decrypt-timeout
git checkout -b docs/install-macos
```

---

## ✍️ Convención de commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<scope>): <descripción corta>
```

Tipos permitidos:

| Tipo       | Uso                                                  |
|------------|------------------------------------------------------|
| `feat`     | Nueva funcionalidad                                  |
| `fix`      | Corrección de bug                                    |
| `docs`     | Cambios en documentación                             |
| `style`    | Formato, puntos y comas (sin cambio de lógica)       |
| `refactor` | Refactor sin cambio funcional                        |
| `test`     | Añadir o corregir tests                              |
| `chore`    | Build, deps, CI, config                              |
| `perf`     | Mejora de rendimiento                                |

Ejemplos:

```
feat(scanner): añade soporte para RustScan
fix(vault): corrige timeout al descifrar con Argon2id
docs(readme): añade badges de CI y release
chore(deps): sube React a 19.2.8
```

Si el commit cierra un issue, añade `Closes #123` en el cuerpo.

---

## 🧹 Estilo de código

### TypeScript / React (frontend)
- **Linter**: `oxlint` (`npm run lint`).
- **Tipos**: estricto. Sin `any` salvo justificación en comentario.
- **Componentes**: funciones con hooks, sin clases.
- **Estado**: Zustand. Un store por dominio (`scanStore`, `vaultStore`, ...).
- **Formato**: 2 espacios, sin punto y coma al final, comillas simples.

### Rust (Tauri)
- **Formato**: `cargo fmt`.
- **Linter**: `cargo clippy --all-targets -- -D warnings`.
- **Errores**: `Result<T, String>` en comandos Tauri (no `panic!`).
- **Unsafe**: solo donde es imprescindible (`libc`, `pre_exec`),
  siempre con comentario justificando.

### Python (backend)
- **Formato**: `ruff format` (o `black` como fallback).
- **Linter**: `ruff check`.
- **Tipos**: anotaciones en todas las funciones públicas.
- **Async**: `async def` para todo lo que toque I/O.
- **Errores**: `HTTPException` en la capa API, `logger.exception` en servicios.

---

## ✅ Tests

Antes de abrir un PR, **todo debe pasar**:

```bash
# Frontend
cd frontend
npm run lint
npm run build
npm test

# Rust
cd frontend/src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --lib

# Backend (si tocaste Python)
cd backend
pytest        # (cuando exista el suite)
```

Añade tests para:

- Nuevas funciones puras → test unitario.
- Nuevos comandos Tauri → test en `#[cfg(test)] mod tests`.
- Nuevos endpoints → test de integración con `httpx.AsyncClient`.

---

## 🔀 Pull Requests

1. **Fork** del repo (si no eres colaborador).
2. **Rama** siguiendo la convención (`feat/...`, `fix/...`).
3. **Commits** atómicos y con mensajes claros.
4. **Rebase** sobre `main` antes de abrir el PR (nada de merges raros).
5. **Rellena** la plantilla del PR.
6. **CI debe pasar** (frontend + rust + lint).
7. **Un maintainer** revisará. Resuelve comentarios o discute.

Reglas del PR:

- Un PR = un cambio lógico. No mezcles refactor masivo con feature.
- Si el PR es grande, divide en varios.
- Actualiza `CHANGELOG.md` si el cambio es visible para el usuario.
- Actualiza `docs/` si tocas comportamiento documentado.

---

## 🎨 Recursos gráficos

- Iconos: PNG 32/128/256 + `.icns` + `.ico` en `frontend/src-tauri/icons/`.
- Capturas: `docs/screenshots/` (formato PNG, 1280x800 recomendado).
- Logo: pendiente de definir. Si propones uno, abre issue primero.

---

## 📦 Releases

Los maintainers hacen releases con tags `vX.Y.Z`. El workflow
`.github/workflows/release.yml` construye artefactos para:

- Linux: `.deb`, `.rpm`, `.AppImage`
- Windows: `.msi`, `.exe`
- macOS: `.dmg` (Intel + Apple Silicon)

No abras PRs que toquen el tag o el workflow de release sin discusión previa.

---

## 📬 Contacto

- Issues: https://github.com/JuanRomeroHDZ/LESSSO-C2/issues
- Discussions: https://github.com/JuanRomeroHDZ/LESSSO-C2/discussions

---

**Gracias por contribuir a LESSSO C2.** 🔰
