# Changelog

Todos los cambios notables de LESSSO C2 se documentan aquí.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto sigue [Semantic Versioning](https://semver.org/lang/es/).

---

## [Unreleased]

_(sin cambios pendientes)_

---

## [0.1.6] — 2025-09-30

### Añadido
- `LICENSE` completo (AGPL-3.0) con copyright de Juan Romero.
- `CONTRIBUTING.md` con flujo de contribución, estilo, tests y PRs.
- `README.md` reescrito en formato bilingüe ES/EN con badges, tabla de features,
  estructura del proyecto, sección de seguridad y aviso legal.
- `CHANGELOG.md` (este archivo).
- `docs/ARCHITECTURE.md` con diagramas de capas, comandos Tauri, endpoints
  backend y decisiones de diseño.
- `docs/INSTALL.md` con guía de instalación para usuario final y desarrollador.
- `docs/TROUBLESHOOTING.md` con problemas conocidos y soluciones.
- `docs/THIRD_PARTY.md` con atribuciones de dependencias y recursos.
- `docs/screenshots/` (directorio para capturas).
- `.github/ISSUE_TEMPLATE/bug_report.md`.
- `.github/ISSUE_TEMPLATE/feature_request.md`.
- `.github/PULL_REQUEST_TEMPLATE.md`.
- `.env.example`: añadidas `FRONTEND_URL` y `NVD_BASE_URL` (faltaban).

### Cambiado
- Versión unificada a `0.1.6` en `tauri.conf.json`, `Cargo.toml`,
  `backend/app/main.py` y `frontend/package.json`.
- `frontend/package.json`: `name` pasa de `temp-front` a `lessso-c2`,
  `version` de `0.0.0` a `0.1.6`.
- `backend/app/core/config.py`: fallback de `DATABASE_URL` usa
  `lessso_c2_db` (sigue viniendo del `.env` en producción).

### Notas
- El volumen Docker `juanmap_pgdata`, el nombre del stack (`juanmap-stack`)
  y el identificador Tauri (`com.juanmap.desktop`) **se mantienen** para no
  romper instalaciones existentes. Se renombrarán en una release futura
  con plan de migración.

---

## [0.1.5] — 2025-09-30

### Cambiado
- Unificación de Node 22 LTS en local y CI (`chore: unifica Node 22 LTS (local + CI)`).

> **Nota**: el resto de cambios entre `0.1.3` y `0.1.5` no están documentados
> aquí por falta de detalle en el historial. Se recomienda inspeccionar
> `git log v0.1.3..v0.1.5` para más contexto.

---

## [0.1.4] — 2025-09-30

_(sin entrada específica; ver 0.1.5)_

---

## [0.1.3] — 2025-09-30

### Cambiado
- CI: eliminado `libappindicator3-dev` (conflicto con `libayatana-appindicator3-dev`).

---

## [0.1.1] — 2025-09-27

### Corregido
- `fix(ci)`: corregida indentación en `release.yml` y añadido `ci.yml`.
- `fix(deps)`: añadido `react-is` y subido `@testing-library/react` a v16.

### Cambiado
- `chore`: `node_modules` fuera de git; `.gitignore` actualizado.

---

## [0.1.0] — 2025-09-27

### Añadido
- Versión inicial pública del proyecto.
- Estructura base: backend FastAPI + frontend Tauri/React.
- Scanner Nmap con parser XML.
- Stack Docker (Postgres 17 + Redis 7).
- Matcher de CVEs contra NVD API v2.
- Bóveda de credenciales (Argon2id + AES-256-GCM).
- Arsenal de payloads (shells, vulns, servicios).
- Integración MITRE ATT&CK.
- Módulo de fuzzing (Gobuster).
- Terminales por process group.
- Módulo de VPN (OpenVPN + pkexec).

---

[Unreleased]: https://github.com/JuanRomeroHDZ/LESSSO-C2/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/JuanRomeroHDZ/LESSSO-C2/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/JuanRomeroHDZ/LESSSO-C2/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/JuanRomeroHDZ/LESSSO-C2/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/JuanRomeroHDZ/LESSSO-C2/compare/v0.1.1...v0.1.3
[0.1.1]: https://github.com/JuanRomeroHDZ/LESSSO-C2/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/JuanRomeroHDZ/LESSSO-C2/releases/tag/v0.1.0
