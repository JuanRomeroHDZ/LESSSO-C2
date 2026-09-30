import { useMemo } from 'react'
import type { HostInfo } from '../../../core/store/useScanStore'
import { detectCVEs } from '../utils/cve'

export function useDashboardMetrics(parsedData: HostInfo[]) {
  return useMemo(() => {
    let open = 0
    let filtered = 0
    let closed = 0
    let crit = 0
    let high = 0
    let med = 0
    const osMap: Record<string, number> = {}
    const srvMap: Record<string, number> = {}

    ;(parsedData || []).forEach(h => {
      const osName = h.os ? h.os.split(' ')[0] : 'Unknown'
      osMap[osName] = (osMap[osName] || 0) + 1
      ;(h.ports || []).forEach(p => {
        if (p.state === 'open') {
          open++
          const cves = detectCVEs(p.service, p.version)
          cves.forEach(c => {
            if (c.severity === 'critical') crit++
            else if (c.severity === 'high') high++
            else med++
          })
          const srv = p.service || 'unknown'
          srvMap[srv] = (srvMap[srv] || 0) + 1
        } else if (p.state === 'filtered') filtered++
        else closed++
      })
    })

    const topServices = Object.entries(srvMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      upHosts: (parsedData || []).filter(h => h.status === 'up').length,
      sevMetrics: { crit, high, med, total: crit + high + med },
      portChartData: [
        { name: 'Abiertos', value: open },
        { name: 'Filtrados', value: filtered },
        { name: 'Cerrados', value: closed },
      ].filter(d => d.value > 0),
      osChartData: Object.entries(osMap).map(([name, value]) => ({ name, value })),
      topServicesData: topServices,
    }
  }, [parsedData])
}
