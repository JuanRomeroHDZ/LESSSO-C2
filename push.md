1. frontend/src-tauri/tauri.conf.json
2. frontend/src-tauri/Cargo.toml
3. backend/app/main.py
4. frontend/package.json
5. Modificar:
git add .
git commit -m "chore: bump versión a 0.2.0"
git push origin main

# Cuando el CI esté verde:
git tag -a v0.2.0 -m "Release v0.2.0 — Actualización UI/UX"
git push origin v0.2.0
