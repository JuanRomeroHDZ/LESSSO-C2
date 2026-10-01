// ==========================================================
// useCveEnrichment
// ----------------------------------------------------------
// Efecto que enriquece los puertos abiertos del scan actual
// con CVEs reales de NVD (vía backend) cuando el toggle
// `cveAutoEnrich` del uiStore está activo.
//
// Estrategia:
//   - 1 request al backend por puerto (el backend limita a NVD).
//   - Actualizamos el store tras CADA respuesta → la UI ve
//     resultados incrementalmente.
//   - NVD sin API key tarda ~6s por request; con 10 puertos
//     son ~60s. El timeout del fetch está en 90s.
//   - Si el backend falla, el matching heurístico local sigue
//     funcionando (useDashboardMetrics cae a detectCVEs).
// ==========================================================

import { useEffect, useRef } from 'react'
import { useScanStoreLocal } from '../../../core/store/scanStore'
import { useUiStore } from '../../../core/store/uiStore'
import { enrichCVEs } from '../utils/cve'
import type { CveMatch } from '../utils/cve'
import type { HostInfo } from '../../../core/store/scanStore'

export function useCveEnrichment(): void {
  const parsedData = useScanStoreLocal((s) => s.parsedData)
  const setHostCves = useScanStoreLocal((s) => s.setHostCves)
  const cveAutoEnrich = useUiStore((s) => s.cveAutoEnrich)

  const lastSignatureRef = useRef<string>('')

  useEffect(() => {
    if (!cveAutoEnrich) return
    if (!Array.isArray(parsedData) || parsedData.length === 0) return

    const validHosts: HostInfo[] = parsedData.filter(
      (h): h is HostInfo =>
        !!h && typeof h === 'object' && typeof (h as HostInfo).ip === 'string',
    )
    if (validHosts.length === 0) return

    // Firma del scan actual: si no cambia, no repetimos.
    const signature = validHosts
      .map((h) => {
        const openCount = Array.isArray(h.ports)
          ? h.ports.filter((p) => p.state === 'open').length
          : 0
        return `${h.ip}#${openCount}#${h.end_time ?? ''}`
      })
      .join('|')

    if (signature === lastSignatureRef.current) return
    lastSignatureRef.current = signature

    const ac = new AbortController()

    ;(async () => {
      // Recopilamos todos los puertos abiertos de todos los hosts
      // con su índice para poder actualizar el store por lotes.
      type Pending = {
        hostIp: string
        portKey: string
        service: string
        version: string
        cpe?: string[]
      }

      const pending: Pending[] = []
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

      // eslint-disable-next-line no-console
      console.info(
        `[cve] Enriqueciendo ${pending.length} puertos abiertos con NVD…`,
      )

      // Procesamos 1 a 1 y aplicamos al store tras cada uno.
      // Agrupamos por host para llamar a setHostCves una sola
      // vez por host cuando lleguen todos sus puertos.
      const byHost: Record<string, Record<string, CveMatch[]>> = {}
      let done = 0

      for (let i = 0; i < pending.length; i++) {
        if (ac.signal.aborted) return
        const p = pending[i]

        const [out] = await enrichCVEs(
          [{ service: p.service, version: p.version, cpe: p.cpe }],
          ac.signal,
        )

        done++
        if (!byHost[p.hostIp]) byHost[p.hostIp] = {}
        byHost[p.hostIp][p.portKey] = out?.cves ?? []

        // Aplicamos al store tras cada item → progreso visible.
        setHostCves(p.hostIp, byHost[p.hostIp])

        // Log cada 3 items para no llenar la consola.
        if (done % 3 === 0 || done === pending.length) {
          // eslint-disable-next-line no-console
          console.info(`[cve] ${done}/${pending.length} puertos procesados`)
        }
      }
    })()

    return () => ac.abort()
  }, [parsedData, cveAutoEnrich, setHostCves])
}
