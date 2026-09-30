import { useState } from 'react'
import type { HostInfo } from '../../../core/store/useScanStore'

export function useHostExpansion() {
  const [expandedPorts, setExpandedPorts] = useState<Record<string, boolean>>({})
  const [expandedHosts, setExpandedHosts] = useState<Record<string, boolean>>({})

  const togglePortExpand = (id: string) => setExpandedPorts(prev => ({ ...prev, [id]: !prev[id] }))
  const toggleHostExpand = (id: string) => setExpandedHosts(prev => ({ ...prev, [id]: !prev[id] }))

  const expandAllWithScripts = (filteredData: HostInfo[]) => {
    const allPorts: Record<string, boolean> = {}
    const allHosts: Record<string, boolean> = {}
    filteredData.forEach(h => {
      if (h.scripts?.length) allHosts[h.ip] = true
      h.ports?.forEach(p => {
        if (p.scripts?.length) allPorts[`${h.ip}-${p.portid}`] = true
      })
    })
    setExpandedHosts(allHosts)
    setExpandedPorts(allPorts)
  }

  return {
    expandedPorts, setExpandedPorts,
    togglePortExpand,
    expandedHosts, setExpandedHosts,
    toggleHostExpand,
    expandAllWithScripts,
  }
}
