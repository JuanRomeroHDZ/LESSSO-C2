#!/bin/bash

echo "🚀 Iniciando diagnóstico y arranque de JuanMap..."
echo "---------------------------------------------------"

# 1. Verificar Nmap en el host (Requisito para Tauri/Rust)
if ! command -v nmap &> /dev/null; then
    echo "❌ ERROR: nmap no está instalado en el sistema base."
    echo "💡 Solución: Ejecuta 'sudo apt update && sudo apt install nmap'"
    exit 1
else
    echo "✅ Dependencia local: Nmap detectado."
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
    # Usamos curl para ver si la ruta raíz devuelve un 200 OK
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
echo "🖥️  Lanzando JuanMap Desktop..."
echo "⚠️  NOTA: Para probar la integración completa, realiza un escaneo a '127.0.0.1' cuando se abra la ventana."
echo "---------------------------------------------------"

npx tauri dev
