// ==========================================================
// useCveEnrichment (v3)
// ----------------------------------------------------------
// Enriquece los puertos abiertos con CVEs reales de NVD.
//
// Diferencias vs v2:
//   - setHostCves se llama UNA VEZ al final (no en cada batch).
//     Esto elimina los re-renders en cascada que bloqueaban
//     Recharts y el iframe del preview.
//   - Concurrencia 3 en paralelo.
//   - Progreso por consola, no en UI (evita re-renders).
// ==========================================================

import { useEffect, useRef } from 'react'
import { useScanStoreLocal } from '../../../core/store/scanStore'
import { useUiStore } from '../../../core/store/uiStore'
import { enrichCVEs } from '../utils/cve'
import type { CveMatch } from '../utils/cve'
import type { HostInfo } from '../../../core/store/scanStore'

const CONCURRENCY = 3

interface PendingPort {
  hostIp: string
  portKey: string
  service: string
  version: string
  cpe?: string[]
}

export function useCveEnrichment(): void {
  const parsedData = useScanStoreLocal((s) => s.parsedData)
  const setHostCves = useScanStoreLocal((s) => s.setHostCves)
  const cveAutoEnrich = useUiStore((s) => s.cveAutoEnrich)

  const processingSignatureRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!cveAutoEnrich) {
      abortRef.current?.abort()
      abortRef.current = null
      processingSignatureRef.current = ''
      return
    }

    if (!Array.isArray(parsedData) || parsedData.length === 0) return

    const validHosts: HostInfo[] = parsedData.filter(
      (h): h is HostInfo =>
        !!h && typeof h === 'object' && typeof (h as HostInfo).ip === 'string',
    )
    if (validHosts.length === 0) return

    const signature = validHosts
      .map((h) => {
        const openCount = Array.isArray(h.ports)
          ? h.ports.filter((p) => p.state === 'open').length
          : 0
        return `${h.ip}#${openCount}#${h.end_time ?? ''}`
      })
      .join('|')

    if (processingSignatureRef.current === signature) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const ac = abortRef.current
    processingSignatureRef.current = signature

    const pending: PendingPort[] = []
    for (const host of validHosts) {
      const openPorts = Array.isArray(host.ports)
        ? host.ports.filter((p) => p.state === 'open')
        : []
      for (const p of openPorts) {
        pending.push({
          hostIp: host.ip,
          portKey: `${p.protocol}/${p.portid}`,
          service: p.service || '',
          version: p.version || '',
          cpe: p.cpe,
        })
      }
    }

    if (pending.length === 0) return

    console.info(
      `[cve] Enriqueciendo ${pending.length} puertos (concurrencia=${CONCURRENCY})…`,
    )

    ;(async () => {
      try {
        let done = 0
        // Acumulador final: solo flush al terminar.
        const buffer: Record<string, Record<string, CveMatch[]>> = {}

        for (let i = 0; i < pending.length; i += CONCURRENCY) {
          if (ac.signal.aborted) return
          const chunk = pending.slice(i, i + CONCURRENCY)

          const results = await Promise.allSettled(
            chunk.map((p) =>
              enrichCVEs(
                [{ service: p.service, version: p.version, cpe: p.cpe }],
                ac.signal,
              ),
            ),
          )

          if (ac.signal.aborted) return

          for (let j = 0; j < chunk.length; j++) {
            const p = chunk[j]
            const r = results[j]
            const cves: CveMatch[] =
              r.status === 'fulfilled' && r.value[0] ? r.value[0].cves : []
            if (!buffer[p.hostIp]) buffer[p.hostIp] = {}
            buffer[p.hostIp][p.portKey] = cves
          }

          done += chunk.length
          console.info(`[cve] ${done}/${pending.length} puertos procesados`)
        }

        // ─────────────────────────────────────────────
        // ÚNICO setHostCves, al final.
        // ─────────────────────────────────────────────
        if (ac.signal.aborted) return
        for (const [hostIp, mapping] of Object.entries(buffer)) {
          setHostCves(hostIp, mapping)
        }
        console.info(`[cve] Enriquecimiento completo (${pending.length} puertos)`)
      } catch (err) {
        console.warn('[cve] enrich batch falló:', err)
      } finally {
        if (processingSignatureRef.current === signature) {
          processingSignatureRef.current = ''
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedData, cveAutoEnrich, setHostCves])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
      processingSignatureRef.current = ''
    }
  }, [])
}
