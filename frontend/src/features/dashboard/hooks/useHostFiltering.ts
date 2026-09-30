import { useState, useMemo } from 'react'
import type { HostInfo } from '../../../core/store/useScanStore'
import { detectCVEs } from '../utils/cve'

export function useHostFiltering(parsedData: HostInfo[]) {
  const [search, setSearch] = useState('')
  const [filterUp, setFilterUp] = useState(false)
  const [filterVuln, setFilterVuln] = useState(false)
  const [filterWeb, setFilterWeb] = useState(false)
  const [filterOS, setFilterOS] = useState<'all'|'windows'|'linux'>('all')
  const [filterCritPorts, setFilterCritPorts] = useState(false)
  const [visibleCount, setVisibleCount] = useState(20)

  const filteredData = useMemo(() => {
    return (parsedData || []).filter(host => {
      if (filterUp && host.status !== 'up') return false
      
      if (filterVuln) {
        const isVuln = (host.ports || []).some(p => detectCVEs(p.service, p.version).length > 0)
        if (!isVuln) return false
      }
      
      if (filterWeb) {
        const hasWeb = (host.ports || []).some(p => ['80', '443', '8080', '8443'].includes(p.portid) && p.state === 'open')
        if (!hasWeb) return false
      }
      
      if (filterOS !== 'all') {
         const osL = (host.os || '').toLowerCase();
         if (filterOS === 'windows' && !osL.includes('win')) return false;
         // Fix OS filter
         if (filterOS === 'linux' && !(osL.includes('linux') || osL.includes('mac') || osL.includes('darwin'))) return false;
      }
      
      if (filterCritPorts) {
          const hasCrit = (host.ports || []).some(p => ['21', '22', '23', '445', '3389'].includes(p.portid) && p.state === 'open')
          if (!hasCrit) return false
      }

      if (!search) return true
      const q = search.toLowerCase()
      
      // FIX: Parser port seguro
      if (q.includes('port:')) {
         const match = q.match(/port:(\d+)/);
         if (match && match[1]) {
            return (host.ports || []).some(p => p.portid === match[1]);
         }
         return false;
      }

      return (
        host.ip.includes(q) ||
        (host.hostname && host.hostname.toLowerCase().includes(q)) ||
        (host.alias && host.alias.toLowerCase().includes(q)) ||
        (host.ports || []).some(p => (p.service || '').toLowerCase().includes(q))
      )
    })
  }, [parsedData, filterUp, filterVuln, filterWeb, filterOS, filterCritPorts, search]);

  return {
    search, setSearch,
    filterUp, setFilterUp,
    filterVuln, setFilterVuln,
    filterWeb, setFilterWeb,
    filterOS, setFilterOS,
    filterCritPorts, setFilterCritPorts,
    visibleCount, setVisibleCount,
    filteredData
  }
}
