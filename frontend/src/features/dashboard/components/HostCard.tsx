import { useMemo } from 'react'
import type { HostInfo } from '../../../core/store/scanStore'
import { calculateScore } from '../utils/score'
import { PortTable } from './PortTable'
import { ScriptBlock } from './ScriptBlock'
import { CveList } from './CveList'
import { detectCVEs } from '../utils/cve'
import type { CveMatch } from '../utils/cve'

interface HostCardProps {
  host: HostInfo
  historyData: HostInfo[]
  showDiff: boolean
  compactMode: boolean
  expandedPorts: Record<string, boolean>
  expandedHosts: Record<string, boolean>
  togglePortExpand: (id: string) => void
  toggleHostExpand: (id: string) => void
  pyClass: string
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return ''
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 && d === 0) parts.push(`${m}m`)
  return parts.join(' ')
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
}

export function HostCard({
  host,
  historyData,
  showDiff,
  compactMode,
  expandedPorts,
  expandedHosts,
  togglePortExpand,
  toggleHostExpand,
  pyClass,
}: HostCardProps) {
  const { score, grade, color, vulns } = calculateScore(host)
  const hasHostScripts = host.scripts && host.scripts.length > 0
  const hostExpanded = expandedHosts[host.ip]

  // ------------------------------------------------------
  // CVEs agregados del host
  // ------------------------------------------------------
  const hostCves = useMemo<CveMatch[]>(() => {
    const out: CveMatch[] = []
    for (const port of host.ports || []) {
      const real = port.cves || []
      if (real.length > 0) {
        out.push(...real)
      } else {
        out.push(...detectCVEs(port.service, port.version, port.cpe))
      }
    }
    // Dedup por id, quedándonos con la severidad más alta.
    const byId = new Map<string, CveMatch>()
    for (const c of out) {
      const prev = byId.get(c.id)
      if (!prev) {
        byId.set(c.id, c)
        continue
      }
      const prevSev = SEVERITY_ORDER[prev.severity] ?? 0
      const newSev = SEVERITY_ORDER[c.severity] ?? 0
      if (newSev > prevSev) byId.set(c.id, c)
    }
    return Array.from(byId.values())
  }, [host.ports])

  const maxSeverity = hostCves.reduce(
    (acc, c) => Math.max(acc, SEVERITY_ORDER[c.severity] ?? 0),
    0,
  )
  const cveBadgeColor =
    maxSeverity >= 4
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-800/50'
      : maxSeverity >= 3
        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300 dark:border-orange-800/50'
        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800/50'

  const hostCveKey = `cves-${host.ip}`
  const showHostCves = expandedHosts[hostCveKey]

  let osIcon = '💻'
  if (host.os.toLowerCase().includes('win')) osIcon = '🪟'
  if (host.os.toLowerCase().includes('linux')) osIcon = '🐧'
  if (
    host.os.toLowerCase().includes('mac') ||
    host.os.toLowerCase().includes('apple')
  )
    osIcon = '🍎'

  const uptime = formatUptime(host.uptime_seconds)
  const distance = host.distance && host.distance > 0 ? host.distance : null

  return (
    <div
      className={`print-page-break print-force-colors bg-white dark:bg-slate-800 rounded-lg shadow-sm border ${
        vulns > 0
          ? 'border-red-300 dark:border-red-900/50 print:border-slate-300'
          : 'border-slate-200 dark:border-slate-700 print:border-slate-300'
      } overflow-hidden flex flex-col print:shadow-none print:bg-white print:text-black`}
    >
      <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700 print:bg-white print:border-slate-300">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[13px] font-black text-[#0b282c] dark:text-white print:text-black flex items-center gap-1">
                {osIcon} {host.ip}
              </h2>
              {host.hostname && (
                <span className="text-[9px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 print:bg-slate-100 print:text-slate-800">
                  {host.hostname}
                </span>
              )}
              {host.mac && (
                <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 print:text-slate-700">
                  {host.mac}
                  {host.mac_vendor ? ` (${host.mac_vendor})` : ''}
                </span>
              )}
            </div>

            <div className="flex gap-1.5 items-center mt-1 flex-wrap">
              <span
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                  host.status === 'up'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                } print:border print:bg-slate-100 print:text-black`}
              >
                {host.status}
              </span>
              <span
                title={`Score: ${score}/100`}
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${color} print:bg-slate-100 print:text-black print:border`}
              >
                Sec Grade: {grade}
              </span>

              {uptime && (
                <span
                  title={
                    host.uptime_lastboot
                      ? `Último arranque: ${host.uptime_lastboot}`
                      : 'Uptime'
                  }
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 print:bg-slate-100 print:text-black print:border"
                >
                  ⏱ {uptime}
                </span>
              )}

              {distance !== null && (
                <span
                  title={`Saltos de red: ${distance}`}
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 print:bg-slate-100 print:text-black print:border"
                >
                  ⇢ {distance} hop{distance === 1 ? '' : 's'}
                </span>
              )}

              {hostCves.length > 0 && (
                <button
                  onClick={() => toggleHostExpand(hostCveKey)}
                  className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-md border hover:opacity-80 transition-opacity flex items-center gap-1 ${cveBadgeColor}`}
                >
                  {showHostCves ? 'Ocultar CVEs' : `[+] ${hostCves.length} CVEs`}
                </button>
              )}

              {hasHostScripts && (
                <button
                  onClick={() => toggleHostExpand(host.ip)}
                  className="px-1.5 py-0.5 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 text-[9px] font-bold uppercase rounded-md border border-teal-300 dark:border-teal-800/50 hover:bg-teal-200 flex items-center gap-1 transition-colors print:hidden"
                >
                  {hostExpanded
                    ? 'Ocultar Info Extra'
                    : `[+] ${host.scripts!.length} Scripts de Host`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showHostCves && hostCves.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 p-3 print:bg-white print:border-slate-300 print:break-inside-avoid">
          <div className="text-[9px] font-bold text-slate-500 uppercase mb-2">
            CVEs detectados en este host
          </div>
          <CveList cves={hostCves} />
        </div>
      )}

      {hostExpanded && hasHostScripts && (
        <div className="bg-[#0b1120] border-b border-slate-700 p-3 overflow-x-auto custom-scrollbar shadow-inner print:bg-slate-50 print:border-slate-300 print:shadow-none print:break-inside-avoid">
          {host.scripts?.map((s, sidx) => (
            <ScriptBlock key={sidx} script={s} />
          ))}
        </div>
      )}

      <PortTable
        host={host}
        historyData={historyData}
        showDiff={showDiff}
        compactMode={compactMode}
        expandedPorts={expandedPorts}
        togglePortExpand={togglePortExpand}
        pyClass={pyClass}
      />
    </div>
  )
}
