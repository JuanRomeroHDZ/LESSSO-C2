// ==========================================================
// CVE matching (frontend)
// ----------------------------------------------------------
// Dos capas:
//
//   1. detectCVEs(...)   → matching local, sync, sin red.
//                          Fallback para la UI cuando el
//                          backend no responde. Sus CVEs
//                          vienen con `source: 'heuristic'`
//                          y NO se incluyen en el reporte.
//
//   2. enrichCVEs(...)   → llama al backend /api/cves/match
//                          y devuelve CVEs reales con CVSS,
//                          filtrados por versión. Fuente de
//                          verdad para el reporte.
//
// El resultado enriquecido se persiste en `port.cves` del
// store, y el reporte solo lee de ahí.
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
// MATCHING HEURÍSTICO (fallback offline, usado por la UI)
// ----------------------------------------------------------
// CVEs conocidos de versiones concretas. NO reemplaza al
// backend; solo sirve para que la UI no quede vacía mientras
// el enrichment corre o si el backend falla.
//
// Estos CVEs NO se incluyen en el reporte exportable.
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
// API PÚBLICA SYNC
// ----------------------------------------------------------
// Fallback local. La UI la usa para no quedar vacía.
// El reporte la IGNORA (solo acepta source !== 'heuristic').
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

// Timeout para batch. Con API key real, NVD tarda ~1s por item.
// 25 items = ~25s. 60s da margen.
const ENRICH_BATCH_TIMEOUT_MS = 60000
const ENRICH_SINGLE_TIMEOUT_MS = 30000

function normalizeResult(
  r: Partial<EnrichPortOutput> | undefined,
  fallbackService: string,
  fallbackVersion: string,
): EnrichPortOutput {
  return {
    service: r?.service ?? fallbackService,
    version: r?.version ?? fallbackVersion,
    cpes: r?.cpes ?? [],
    cves: (r?.cves ?? []).map((c: any) => ({
      id: c.id,
      severity: (c.severity as Severity) || 'unknown',
      cvss: c.cvss,
      source: (c.source as CveMatch['source']) || 'nvd',
      description: c.description,
      cwe: c.cwe,
    })),
    source: r?.source ?? 'nvd',
    cached: !!r?.cached,
  }
}

function emptyResult(service: string, version: string, source = 'fallback'): EnrichPortOutput {
  return {
    service,
    version,
    cpes: [],
    cves: [],
    source,
    cached: false,
  }
}

// ----------------------------------------------------------
// BATCH (recomendado: 1 request con todos los items)
// ----------------------------------------------------------
export async function enrichCVEsBatch(
  items: EnrichPortInput[],
  signal?: AbortSignal,
): Promise<EnrichPortOutput[]> {
  if (!items.length) return []

  try {
    const res = await api.post<MatchResponse>(
      '/api/cves/match',
      {
        items: items.map((i) => ({
          service: i.service || '',
          version: i.version || '',
          cpe: i.cpe && i.cpe.length ? i.cpe : undefined,
        })),
      },
      { signal, timeoutMs: ENRICH_BATCH_TIMEOUT_MS },
    )

    const results = res.results || []
    return items.map((it, idx) =>
      normalizeResult(results[idx], it.service, it.version),
    )
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      return items.map((i) => emptyResult(i.service, i.version, 'fallback'))
    }
    console.warn('[cve] enrichCVEsBatch falló:', err?.message || err)
    return items.map((i) => emptyResult(i.service, i.version, 'fallback'))
  }
}

// ----------------------------------------------------------
// SINGLE (compat legacy)
// ----------------------------------------------------------
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
        { signal, timeoutMs: ENRICH_SINGLE_TIMEOUT_MS },
      )

      const normalized = normalizeResult(
        (res.results || [])[0],
        item.service,
        item.version,
      )
      all.push(normalized)
      onBatch?.(normalized, i)
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal?.aborted) {
        break
      }
      const empty = emptyResult(item.service, item.version, 'fallback')
      all.push(empty)
      onBatch?.(empty, i)
    }
  }

  return all
}
