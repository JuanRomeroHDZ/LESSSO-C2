// ==========================================================
// CVE matching (frontend)
// ----------------------------------------------------------
// Dos capas:
//
//   1. detectCVEs(...)   → matching local, sync, sin red.
//                          Es el que usan los tests y el
//                          fallback offline.
//
//   2. enrichCVEs(...)   → llama al backend /api/cves/match
//                          y devuelve CVEs reales con CVSS.
//                          Se usa desde un efecto al recibir
//                          un scan.
//
// El resultado enriquecido se persiste en `port.cves` del
// store, y `useDashboardMetrics` lo lee si existe.
// ==========================================================

import { api } from '../../../services/api'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown'

export interface CveMatch {
  id: string
  severity: Severity
  cvss?: number
  source: 'cpe' | 'heuristic' | 'nvd' | 'cache' | 'fallback'
  description?: string
  cwe?: string[]
}

// ==========================================================
// CACHE LOCAL (matching heurístico)
// ==========================================================
const cveCache = new Map<string, CveMatch[]>()

function parseCpe(cpe: string): { vendor: string; product: string; version: string } | null {
  if (!cpe) return null
  const parts = cpe.split(':')
  if (parts[0] !== 'cpe' || parts[1] !== '2.3') return null
  const vendor = (parts[3] || '').replace(/\*/g, '')
  const product = (parts[4] || '').replace(/\*/g, '')
  const version = (parts[5] || '').replace(/\*/g, '')
  return { vendor, product, version }
}

// ==========================================================
// MATCHING HEURÍSTICO (fallback offline, usado por tests)
// ==========================================================
function heuristicMatch(service: string, version: string): CveMatch[] {
  const cves: CveMatch[] = []
  const s = `${service || ''} ${version || ''}`.toLowerCase()

  if (s.includes('openssh 8.') || s.includes('openssh 9.0') || s.includes('openssh 9.1'))
    cves.push({ id: 'CVE-2023-38408', severity: 'critical', cvss: 9.8, source: 'heuristic' })

  if (s.includes('vsftpd 2.3.4'))
    cves.push({ id: 'CVE-2011-2523', severity: 'high', cvss: 7.5, source: 'heuristic' })

  if ((s.includes('smb') || s.includes('microsoft-ds')) && (s.includes('windows 7') || s.includes('windows server 2008')))
    cves.push({ id: 'MS17-010', severity: 'critical', cvss: 9.8, source: 'heuristic' })

  if (s.includes('apache') && s.includes('2.4.49'))
    cves.push({ id: 'CVE-2021-41773', severity: 'high', cvss: 7.5, source: 'heuristic' })

  if (s.includes('proftpd 1.3.5'))
    cves.push({ id: 'CVE-2015-3306', severity: 'high', cvss: 7.5, source: 'heuristic' })

  return cves
}

function cpeMatch(cpeList: string[]): CveMatch[] {
  const cves: CveMatch[] = []

  for (const cpe of cpeList) {
    const parsed = parseCpe(cpe)
    if (!parsed) continue

    const { vendor, product, version } = parsed

    if (product === 'openssh' && version.startsWith('8.'))
      cves.push({ id: 'CVE-2023-38408', severity: 'critical', cvss: 9.8, source: 'cpe' })

    if (product === 'vsftpd' && version === '2.3.4')
      cves.push({ id: 'CVE-2011-2523', severity: 'high', cvss: 7.5, source: 'cpe' })

    if (product === 'http_server' && vendor === 'apache' && version === '2.4.49')
      cves.push({ id: 'CVE-2021-41773', severity: 'high', cvss: 7.5, source: 'cpe' })

    if (product === 'proftpd' && version === '1.3.5')
      cves.push({ id: 'CVE-2015-3306', severity: 'high', cvss: 7.5, source: 'cpe' })
  }

  return cves
}

// ==========================================================
// API PÚBLICA SYNC (intacta, usada por tests y UI offline)
// ==========================================================
export function detectCVEs(
  service: string,
  version: string,
  cpeList?: string[],
): CveMatch[] {
  const cacheKey = `${service}|${version}|${(cpeList || []).join(',')}`
  if (cveCache.has(cacheKey)) return cveCache.get(cacheKey)!

  const fromCpe = cpeList && cpeList.length > 0 ? cpeMatch(cpeList) : []
  const fromHeuristic = heuristicMatch(service, version)

  const merged = new Map<string, CveMatch>()
  for (const c of fromCpe) merged.set(c.id, c)
  for (const c of fromHeuristic) {
    if (!merged.has(c.id)) merged.set(c.id, c)
  }

  const result = Array.from(merged.values())
  cveCache.set(cacheKey, result)
  return result
}

export function clearCveCache(): void {
  cveCache.clear()
}

// ==========================================================
// ENRIQUECIMIENTO ASYNC (backend → NVD)
// ==========================================================
export interface EnrichPortInput {
  service: string
  version: string
  cpe?: string[]
}

export interface EnrichPortOutput {
  service: string
  version: string
  cpes: string[]
  cves: CveMatch[]
  source: string
  cached: boolean
}

interface MatchResponse {
  results: EnrichPortOutput[]
}

/**
 * Timeout del enriquecimiento. NVD sin API key permite 5 req/30s,
 * así que cada request tarda ~6s. Un scan con 5 puertos abiertos
 * tarda ~30s. Damos margen.
 */
const ENRICH_TIMEOUT_MS = 90000

/**
 * Llama al backend para obtener CVEs reales (con CVSS de NVD).
 *
 * Es best-effort: si el backend o NVD fallan, devuelve un array
 * vacío por item y NO lanza. El llamador puede caer a
 * `detectCVEs(...)` como fallback.
 *
 * Procesamos en LOTES pequeños (uno por uno) para que la UI vea
 * progreso incremental en vez de esperar un batch enorme.
 */
export async function enrichCVEs(
  items: EnrichPortInput[],
  signal?: AbortSignal,
  onBatch?: (batch: EnrichPortOutput, index: number) => void,
): Promise<EnrichPortOutput[]> {
  if (!items.length) return []

  const all: EnrichPortOutput[] = []

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) break
    const item = items[i]

    try {
      const res = await api.post<MatchResponse>(
        '/api/cves/match',
        {
          items: [
            {
              service: item.service || '',
              version: item.version || '',
              cpe: item.cpe && item.cpe.length ? item.cpe : undefined,
            },
          ],
        },
        { signal, timeoutMs: ENRICH_TIMEOUT_MS },
      )

      const normalized: EnrichPortOutput = (res.results || []).map((r) => ({
        service: r.service ?? '',
        version: r.version ?? '',
        cpes: r.cpes ?? [],
        cves: (r.cves ?? []).map((c) => ({
          id: c.id,
          severity: (c.severity as Severity) || 'unknown',
          cvss: c.cvss,
          source: (c.source as CveMatch['source']) || 'nvd',
          description: c.description,
          cwe: (c as any).cwe,
        })),
        source: r.source ?? 'nvd',
        cached: !!r.cached,
      }))[0] ?? {
        service: item.service,
        version: item.version,
        cpes: [],
        cves: [],
        source: 'fallback',
        cached: false,
      }

      all.push(normalized)
      onBatch?.(normalized, i)
    } catch (err) {
      // No relanzamos: seguimos con el siguiente item.
      // eslint-disable-next-line no-console
      console.warn(
        `[cve] enrichCVEs falló para ${item.service} ${item.version}, usando fallback`,
        err,
      )
      const empty: EnrichPortOutput = {
        service: item.service,
        version: item.version,
        cpes: [],
        cves: [],
        source: 'fallback',
        cached: false,
      }
      all.push(empty)
      onBatch?.(empty, i)
    }
  }

  return all
}
