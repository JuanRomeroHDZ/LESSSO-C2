#!/bin/bash

echo "🚀 Iniciando diagnóstico y arranque de LESSSO C2..."
echo "---------------------------------------------------"

# 1. Verificar Dependencias en el host (Requisito para Tauri/Rust)
echo "🔍 Verificando herramientas de seguridad del sistema..."

TOOLS=("nmap" "rustscan" "gobuster" "openvpn" "pkexec")
MISSING_TOOLS=0

for tool in "${TOOLS[@]}"; do
    if ! command -v "$tool" &> /dev/null; then
        echo "  ❌ Falta: $tool"
        MISSING_TOOLS=$((MISSING_TOOLS+1))
    else
        echo "  ✅ Detectado: $tool"
    fi
done

if [ "$MISSING_TOOLS" -gt 0 ]; then
    echo "---------------------------------------------------"
    echo "⚠️ ADVERTENCIA: Faltan $MISSING_TOOLS herramientas en tu sistema."
    echo "💡 Solución rápida en Debian/Ubuntu/Kali:"
    echo "   sudo apt update && sudo apt install nmap gobuster openvpn pkexec"
    echo "   (Para rustscan, instálalo desde su repositorio oficial o usa release .deb)"
    echo "---------------------------------------------------"
    # No detenemos el script porque la app puede funcionar sin algunas herramientas
    sleep 2
else
    echo "✅ Todas las dependencias del sistema están listas."
fi

# 2. Levantar los contenedores del Backend
echo "🐳 Construyendo y levantando contenedores Docker..."
docker compose up -d --build

# 3. Verificar Healthcheck de FastAPI
echo "⏳ Esperando a que FastAPI despierte en el puerto 8001..."
MAX_RETRIES=10
RETRY_COUNT=0
API_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:8001/ | grep -q '"status":"ok"'; then
        API_READY=true
        echo "✅ API Backend: Respondiendo correctamente en http://localhost:8001"
        break
    fi
    echo "   Reintentando en 3 segundos... ($((RETRY_COUNT+1))/$MAX_RETRIES)"
    sleep 3
    RETRY_COUNT=$((RETRY_COUNT+1))
done

if [ "$API_READY" = false ]; then
    echo "❌ ERROR: El backend de FastAPI no está respondiendo."
    echo "💡 Solución: Revisa los logs ejecutando 'docker compose logs api'"
    exit 1
fi

# 4. Preparar el entorno de Tauri
echo "📦 Instalando dependencias de Node.js..."
cd frontend
npm install

echo "🦀 Descargando dependencias de Rust..."
cd src-tauri
cargo fetch
cd ..

# 5. Ejecutar Tauri
echo "---------------------------------------------------"
echo "🖥️  Lanzando LESSSO C2 Desktop..."
echo "⚠️  NOTA: Para probar la integración completa, realiza un escaneo a '127.0.0.1'."
echo "---------------------------------------------------"

npx tauri dev
