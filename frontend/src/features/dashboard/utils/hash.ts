// ==========================================================
// LESSSO C2 — Hash de integridad del reporte
// ----------------------------------------------------------
// Objetivo: firmar el JSON exportado con un hash reproducible para
// detectar manipulación posterior. Se muestra en el header del
// reporte MD/HTML y se embebe en el propio JSON.
//
// Estrategia:
//   1. Intentar crypto.subtle.digest('SHA-256', ...) — criptográfico.
//      Requiere secure context: HTTPS, localhost, o tauri://localhost.
//   2. Fallback: djb2 (no criptográfico, pero determinista).
//      Se prefija con "djb2:" para que sea evidente en el reporte.
//
// El hash SIEMPRE se devuelve en minúsculas, sin prefijo "sha256:"
// para el caso criptográfico. El fallback SÍ lleva prefijo.
// ==========================================================

const encoder = new TextEncoder()

/**
 * SHA-256 criptográfico. Devuelve hex en minúsculas.
 * Lanza si crypto.subtle no está disponible.
 */
async function sha256Subtle(input: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('crypto.subtle no disponible')
  }
  const data = encoder.encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * djb2: no criptográfico, pero determinista y suficiente como
 * checksum de integridad en ausencia de crypto.subtle.
 * Devuelve 8 hex chars (32 bits).
 */
function djb2Hex(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    // h * 33 + c  →  shift+add, con |0 para forzar int32
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  // Convertir a unsigned y a hex de 8 chars
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Calcula el hash de integridad de un string.
 *
 * @returns string hex. Si empieza con "djb2:" es el fallback.
 *          En cualquier otro caso es SHA-256 real.
 */
export async function sha256Hex(input: string): Promise<string> {
  try {
    return await sha256Subtle(input)
  } catch {
    return `djb2:${djb2Hex(input)}`
  }
}

/**
 * Versión sync del fallback, por si algún caller no puede await.
 * NO intenta crypto.subtle.
 */
export function sha256HexSyncFallback(input: string): string {
  return `djb2:${djb2Hex(input)}`
}

/**
 * Etiqueta legible para mostrar en el reporte.
 *   - hash sha256 (64 hex)  →  "SHA-256"
 *   - hash djb2 (djb2:xxxx) →  "djb2 (fallback, no criptográfico)"
 */
export function hashAlgorithmLabel(hash: string): string {
  if (hash.startsWith('djb2:')) return 'djb2 (fallback, no criptográfico)'
  if (/^[0-9a-f]{64}$/i.test(hash)) return 'SHA-256'
  return 'desconocido'
}
