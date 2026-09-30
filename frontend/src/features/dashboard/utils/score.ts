import type { HostInfo } from '../../../core/store/useScanStore'
import { detectCVEs } from './cve'

export const calculateScore = (host: HostInfo) => {
  let score = 100
  let vulns = 0
  ;(host.ports || []).forEach(p => {
    if (p.state === 'open') {
      score -= 5
      if (['21', '22', '23', '445', '3389'].includes(p.portid)) score -= 15
      const cves = detectCVEs(p.service, p.version)
      if (cves.length > 0) {
        cves.forEach(c => {
          if (c.severity === 'critical') score -= 40
          else if (c.severity === 'high') score -= 25
          else score -= 10
        })
        vulns += cves.length
      }
    }
  })
  if (score < 0) score = 0

  let grade = 'A'
  let color = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
  if (score < 90) { grade = 'B'; color = 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' }
  if (score < 70) { grade = 'C'; color = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400' }
  if (score < 50) { grade = 'D'; color = 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400' }
  if (score < 30) { grade = 'F'; color = 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 border-red-500 border' }
  return { score, grade, color, vulns }
}
