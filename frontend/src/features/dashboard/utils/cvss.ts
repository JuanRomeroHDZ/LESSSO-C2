// ==========================================================
// LESSSO C2 — Utilidades de presentación CVSS
// ----------------------------------------------------------
// Centraliza:
//   - Bandas por rango CVSS v3.1
//   - Colores para HTML (bg/fg/border)
//   - Etiqueta para Markdown (texto plano con severidad)
// ==========================================================

export type CvssBand = 'low' | 'medium' | 'high' | 'critical' | 'unknown'

/**
 * Bandas según CVSS v3.1:
 *   0.0         → none (lo tratamos como unknown)
 *   0.1 – 3.9   → low
 *   4.0 – 6.9   → medium
 *   7.0 – 8.9   → high
 *   9.0 – 10.0  → critical
 */
export function cvssBand(score: number | undefined | null): CvssBand {
  if (score === undefined || score === null || isNaN(score)) return 'unknown'
  if (score >= 9.0) return 'critical'
  if (score >= 7.0) return 'high'
  if (score >= 4.0) return 'medium'
  if (score > 0) return 'low'
  return 'unknown'
}

export interface CvssStyle {
  bg: string
  fg: string
  border: string
  label: string
}

/**
 * Estilos para HTML inline. Mismos tonos que las clases `.sev-*`
 * del CSS embebido para que sea consistente.
 */
export function cvssHtmlStyle(score: number | undefined | null): CvssStyle {
  const band = cvssBand(score)
  switch (band) {
    case 'critical':
      return { bg: '#fee2e2', fg: '#991b1b', border: '#ef4444', label: 'CRITICAL' }
    case 'high':
      return { bg: '#ffedd5', fg: '#9a3412', border: '#f97316', label: 'HIGH' }
    case 'medium':
      return { bg: '#fef9c3', fg: '#854d0e', border: '#eab308', label: 'MEDIUM' }
    case 'low':
      return { bg: '#dbeafe', fg: '#1e40af', border: '#3b82f6', label: 'LOW' }
    default:
      return { bg: '#f1f5f9', fg: '#475569', border: '#94a3b8', label: 'N/A' }
  }
}

/**
 * Devuelve el score formateado + etiqueta de banda para MD.
 * Ej: `9.8 (CRITICAL)`, o `N/A` si no hay score.
 * NO incluye markdown (el caller decide si va en **bold** o no).
 */
export function cvssMdLabel(score: number | undefined | null): string {
  if (score === undefined || score === null || isNaN(score)) return 'N/A'
  const band = cvssBand(score)
  const upper = band.toUpperCase()
  return `${score.toFixed(1)} (${upper})`
}

/**
 * Devuelve la celda MD completa, en bold, para la columna CVSS.
 * Ej: `**9.8 (CRITICAL)**` o `-`.
 */
export function cvssMdCell(score: number | undefined | null): string {
  if (score === undefined || score === null || isNaN(score)) return '-'
  return `**${cvssMdLabel(score)}**`
}
