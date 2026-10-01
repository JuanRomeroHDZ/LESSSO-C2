// ==========================================================
// LESSSO C2 — Utilidades de escape
// ----------------------------------------------------------
// Centraliza el escapado para MD y HTML. Reglas:
//   - escapeHtml: para texto visible en HTML (escapa todo)
//   - escapeUrl:  para atributos href/src (NO escapa &, ?, =, :)
//   - escapeMdCell: para celdas de tabla MD
//   - escapeMdCode: para bloques ```...```
//   - escapeMdInline: para `code` inline
//   - nvdUrl: construye la URL canónica de NVD para un CVE
// ==========================================================

/**
 * Escapa texto para insertarlo como contenido visible en HTML.
 * Escapa TODO, incluidos backticks (defensa contra XSS en contextos
 * donde el navegador interpreta el backtick como template literal
 * en atributos `on*`).
 */
export function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
}

/**
 * Escapa una URL para usarla en `href`/`src`.
 *
 * A diferencia de `escapeHtml`, NO escapamos `&`, `?`, `=`, `:` ni `/`
 * porque forman parte de la sintaxis de la URL. Sí escapamos:
 *   - `"` y `'` → evita romper el atributo
 *   - `<` y `>` → evita inyección de tags
 *   - backtick  → evita template literals en atributos `on*`
 *
 * No valida el esquema (eso lo hace el caller con `isSafeUrl`).
 */
export function escapeUrl(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return ''
  return String(unsafe)
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/`/g, '%60')
}

/**
 * Solo permitimos http(s):// en hrefs generados. Bloquea
 * javascript:, data:, vbscript:, file:, etc.
 */
export function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

/**
 * Construye la URL canónica de NVD para un CVE.
 * Acepta `CVE-2024-1234` (case-insensitive). Si el id no matchea el
 * patrón, devuelve cadena vacía para que el caller no renderice link.
 */
export function nvdUrl(cveId: string | undefined | null): string {
  if (!cveId) return ''
  const m = String(cveId).trim().match(/^(CVE-\d{4}-\d{4,})$/i)
  if (!m) return ''
  return `https://nvd.nist.gov/vuln/detail/${m[1].toUpperCase()}`
}

/**
 * Escapa una celda de tabla Markdown.
 *   - `|` → `\|` (no rompe columnas)
 *   - saltos de línea → espacio
 *   - backtick → apóstrofo (evita code spans accidentales)
 */
export function escapeMdCell(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '-'
  return String(unsafe)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .replace(/`/g, "'")
}

/**
 * Escapa contenido dentro de un bloque ```...```.
 * Solo neutralizamos la secuencia de cierre.
 */
export function escapeMdCode(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return ''
  return String(unsafe).replace(/```/g, "'''")
}

/**
 * Escapa contenido dentro de `code` inline en Markdown.
 */
export function escapeMdInline(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '-'
  return String(unsafe).replace(/`/g, "'")
}

/**
 * Escapa el texto visible de un link Markdown.
 * Los `[]` romperían la sintaxis, los `()` también.
 */
export function escapeMdLinkText(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return ''
  return String(unsafe)
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\r?\n/g, ' ')
}

/**
 * Construye un link Markdown seguro a NVD.
 * Si el id no es un CVE válido, devuelve el id escapado sin link.
 */
export function nvdMdLink(cveId: string | undefined | null): string {
  if (!cveId) return '-'
  const url = nvdUrl(cveId)
  const text = escapeMdLinkText(String(cveId).toUpperCase())
  if (!url) return `\`${escapeMdInline(text)}\``
  return `[\`${escapeMdInline(text)}\`](${url})`
}
