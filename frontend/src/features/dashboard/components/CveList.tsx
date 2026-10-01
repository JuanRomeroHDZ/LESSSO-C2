import { useState } from 'react'
import type { CveMatch } from '../utils/cve'

interface CveListProps {
  cves: CveMatch[]
  compact?: boolean
  maxItems?: number
}

const SEVERITY_STYLE: Record<string, string> = {
  critical:
    'bg-red-600 text-white border-red-700 dark:bg-red-700 dark:border-red-800',
  high: 'bg-orange-500 text-white border-orange-600 dark:bg-orange-600 dark:border-orange-700',
  medium:
    'bg-yellow-500 text-white border-yellow-600 dark:bg-yellow-600 dark:border-yellow-700',
  low: 'bg-sky-500 text-white border-sky-600 dark:bg-sky-600 dark:border-sky-700',
  unknown:
    'bg-slate-400 text-white border-slate-500 dark:bg-slate-600 dark:border-slate-700',
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRIT',
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
  unknown: '?',
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
    <div className={`flex flex-col gap-1 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
      {visible.map((cve) => {
        const sev = SEVERITY_STYLE[cve.severity] || SEVERITY_STYLE.unknown
        const label = SEVERITY_LABEL[cve.severity] || '?'
        const isOpen = expanded.has(cve.id)
        return (
          <div key={cve.id} className="flex flex-col">
            <button
              type="button"
              onClick={() => cve.description && toggle(cve.id)}
              className={`inline-flex items-center gap-1.5 ${sev} border rounded px-1.5 py-0.5 font-bold w-fit max-w-full hover:opacity-90 transition-opacity text-left`}
              title={cve.description || cve.id}
            >
              <span className="shrink-0">{label}</span>
              <span className="font-mono truncate">{cve.id}</span>
              {cve.cvss !== undefined && (
                <span className="shrink-0 opacity-80">
                  {cve.cvss.toFixed(1)}
                </span>
              )}
              {cve.source === 'nvd' && (
                <span className="shrink-0 text-[8px] opacity-70">NVD</span>
              )}
              {cve.source === 'cache' && (
                <span className="shrink-0 text-[8px] opacity-70">💾</span>
              )}
              {cve.description && (
                <span className="shrink-0 opacity-70">
                  {isOpen ? '▾' : '▸'}
                </span>
              )}
            </button>
            {isOpen && cve.description && (
              <div className="mt-1 ml-1 pl-2 border-l-2 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 leading-snug">
                {cve.description}
                {cve.cwe && cve.cwe.length > 0 && (
                  <div className="mt-0.5 text-[8px] uppercase tracking-wider opacity-70">
                    {cve.cwe.join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {hidden > 0 && (
        <span className="text-[9px] text-slate-500 italic">
          +{hidden} más…
        </span>
      )}
    </div>
  )
}
