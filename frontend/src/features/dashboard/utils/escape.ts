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
export function escapeMdCell(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '-'
  return String(unsafe)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .replace(/`/g, "'")
}
export function escapeMdCode(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return ''
  return String(unsafe).replace(/```/g, "'''")
}
export function escapeMdInline(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '-'
  return String(unsafe).replace(/`/g, "'")
}
