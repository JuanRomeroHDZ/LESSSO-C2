import { useState } from 'react'
import type { CveMatch } from '../utils/cve'
import { ChevronRight, ChevronDown, Database } from 'lucide-react'

interface CveListProps {
  cves: CveMatch[]
  compact?: boolean
  maxItems?: number
}

// Estilo Shadcn/Tactical: Fondos translúcidos (10-20% opacidad), bordes sutiles y texto brillante
const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  low: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  unknown: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRIT',
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
  unknown: 'UNK',
}

export function CveList({ cves, compact = false, maxItems }: CveListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (!cves || cves.length === 0) return null

  const visible = maxItems ? cves.slice(0, maxItems) : cves
  const hidden = maxItems && cves.length > maxItems ? cves.length - maxItems : 0

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={`flex flex-col gap-1.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
      {visible.map((cve) => {
        const sev = SEVERITY_STYLE[cve.severity] || SEVERITY_STYLE.unknown
        const label = SEVERITY_LABEL[cve.severity] || 'UNK'
        const isOpen = expanded.has(cve.id)
        
        return (
          <div key={cve.id} className="flex flex-col">
            <button
              type="button"
              onClick={() => cve.description && toggle(cve.id)}
              className={`inline-flex items-center gap-1.5 ${sev} border rounded-md px-2 py-0.5 font-semibold w-fit max-w-full hover:bg-opacity-80 transition-all text-left group`}
              title={cve.description || cve.id}
            >
              <span className="shrink-0 text-[9px] uppercase tracking-wider opacity-80">{label}</span>
              <span className="font-mono tracking-tight">{cve.id}</span>
              
              {cve.cvss !== undefined && (
                <span className="shrink-0 opacity-70 border-l border-current pl-1.5 ml-0.5">
                  {cve.cvss.toFixed(1)}
                </span>
              )}
              
              {cve.source === 'nvd' && (
                <span className="shrink-0 text-[8px] opacity-60 font-mono border border-current rounded px-1 ml-1">NVD</span>
              )}
              {cve.source === 'cache' && (
                <Database size={10} className="shrink-0 opacity-60 ml-1" />
              )}
              
              {cve.description && (
                <span className="shrink-0 opacity-50 group-hover:opacity-100 ml-1">
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              )}
            </button>
            
            {isOpen && cve.description && (
              <div className="mt-1.5 ml-2 pl-3 border-l-2 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 leading-relaxed text-[10px]">
                {cve.description}
                {cve.cwe && cve.cwe.length > 0 && (
                  <div className="mt-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-500">
                    {cve.cwe.join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {hidden > 0 && (
        <span className="text-[10px] text-slate-500 dark:text-slate-500 font-mono mt-0.5 ml-1">
          +{hidden} vulnerabilidades más...
        </span>
      )}
    </div>
  )
}
