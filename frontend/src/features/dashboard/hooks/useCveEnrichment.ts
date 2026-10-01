// ==========================================================
// useCveEnrichment
// ----------------------------------------------------------
// Enriquece los puertos abiertos del scan actual con CVEs
// reales de NVD (vía backend).
//
// Reglas clave para no auto-cancelarse:
//   1. La "firma" del scan debe depender SOLO de datos que
//      NO cambian durante el enriquecimiento (ip + end_time
//      + nº de puertos abiertos). NO contar CVEs.
//   2. El AbortController NO se recrea en cada render de
//      parsedData: vive en un ref, y solo se aborta cuando
//      cambia la firma o se desactiva el toggle.
//   3. Cuando una firma ya se procesó (o está procesándose),
//      el efecto sale sin tocar nada.
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

  // Firma actual + firma en proceso
  const currentSignatureRef = useRef<string>('')
  const processingSignatureRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // ------------------------------------------------------
    // Toggle OFF → abortar lo que haya y limpiar.
    // ------------------------------------------------------
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

    // ------------------------------------------------------
    // FIRMA ESTABLE
    // ------------------------------------------------------
    // Solo datos que NO cambian al enriquecer:
    //   - ip
    //   - end_time (marca del scan)
    //   - nº de puertos abiertos (ya está en parsedData al
    //     llegar el scan, no cambia al enriquecer)
    // NO incluimos la firma de los CVEs ni las descripciones,
    // porque esos SÍ cambian al hacer setHostCves y harían
    // que el efecto se auto-abortara en bucle.
    // ------------------------------------------------------
    const signature = validHosts
      .map((h) => {
        const openCount = Array.isArray(h.ports)
          ? h.ports.filter((p) => p.state === 'open').length
          : 0
        return `${h.ip}#${openCount}#${h.end_time ?? ''}`
      })
      .join('|')

    currentSignatureRef.current = signature

    // Si ya estamos procesando esta misma firma, no hacemos nada.
    if (processingSignatureRef.current === signature) return

    // Si hay algo en curso, lo abortamos antes de empezar
    // una nueva firma (scan nuevo, target distinto…).
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const ac = abortRef.current
    processingSignatureRef.current = signature

    ;(async () => {
      try {
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

        const byHost: Record<string, Record<string, CveMatch[]>> = {}
        let done = 0

        for (let i = 0; i < pending.length; i++) {
          if (ac.signal.aborted) return
          const p = pending[i]

          const [out] = await enrichCVEs(
            [{ service: p.service, version: p.version, cpe: p.cpe }],
            ac.signal,
          )

          if (ac.signal.aborted) return

          done++
          if (!byHost[p.hostIp]) byHost[p.hostIp] = {}
          byHost[p.hostIp][p.portKey] = out?.cves ?? []

          // Actualizamos el store tras cada item → progreso
          // incremental. La firma del efecto NO cambia porque
          // no depende de los CVEs.
          setHostCves(p.hostIp, byHost[p.hostIp])

          if (done % 3 === 0 || done === pending.length) {
            // eslint-disable-next-line no-console
            console.info(`[cve] ${done}/${pending.length} puertos procesados`)
          }
        }
      } finally {
        // Solo limpiamos si seguimos siendo la firma activa.
        if (processingSignatureRef.current === signature) {
          processingSignatureRef.current = ''
        }
      }
    })()
    // Importante: NO abortamos en el cleanup del efecto por
    // cambios de parsedData. Solo limpiamos al desmontar.
    // El abort real lo disparan: (a) toggle OFF arriba,
    // (b) nueva firma detectada arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedData, cveAutoEnrich, setHostCves])

  // ------------------------------------------------------
  // Abortar al desmontar
  // ------------------------------------------------------
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
      processingSignatureRef.current = ''
    }
  }, [])
}
