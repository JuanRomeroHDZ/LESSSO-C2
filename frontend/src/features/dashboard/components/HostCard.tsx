import { useMemo } from 'react'
import type { HostInfo } from '../../../core/store/scanStore'
import { calculateScore } from '../utils/score'
import { PortTable } from './PortTable'
import { ScriptBlock } from './ScriptBlock'
import { CveList } from './CveList'
import { detectCVEs } from '../utils/cve'
import type { CveMatch } from '../utils/cve'
import { Monitor, Apple, Terminal, Server, Clock, Route, ShieldAlert, Code2 } from 'lucide-react'

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
      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
      : maxSeverity >= 3
        ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/20'
        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20'

  const hostCveKey = `cves-${host.ip}`
  const showHostCves = expandedHosts[hostCveKey]

  let OsIcon = Server
  if (host.os.toLowerCase().includes('win')) OsIcon = Monitor
  if (host.os.toLowerCase().includes('linux')) OsIcon = Terminal
  if (
    host.os.toLowerCase().includes('mac') ||
    host.os.toLowerCase().includes('apple')
  )
    OsIcon = Apple

  const uptime = formatUptime(host.uptime_seconds)
  const distance = host.distance && host.distance > 0 ? host.distance : null

  return (
    <div
      className={`print-page-break print-force-colors bg-white dark:bg-[#020617] rounded-xl shadow-sm border ${
        vulns > 0
          ? 'border-rose-500/30 dark:border-rose-900/50 print:border-slate-300'
          : 'border-slate-200 dark:border-slate-800/60 print:border-slate-300'
      } overflow-hidden flex flex-col print:shadow-none print:bg-white print:text-black`}
    >
      <div className="bg-slate-50 dark:bg-slate-900/40 px-4 py-3 border-b border-slate-200 dark:border-slate-800/80 print:bg-white print:border-slate-300">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-[14px] font-mono font-black text-slate-900 dark:text-white print:text-black flex items-center gap-1.5 tracking-tight">
                <OsIcon size={16} className="text-slate-400" /> {host.ip}
              </h2>
              {host.hostname && (
                <span className="text-[10px] font-bold text-slate-500 bg-slate-200/50 dark:bg-slate-800/50 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-300/50 dark:border-slate-700/50 print:bg-slate-100 print:text-slate-800 tracking-wider uppercase">
                  {host.hostname}
                </span>
              )}
              {host.mac && (
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500 print:text-slate-700">
                  {host.mac}
                  {host.mac_vendor ? ` (${host.mac_vendor})` : ''}
                </span>
              )}
            </div>

            <div className="flex gap-2 items-center mt-2 flex-wrap">
              <span
                className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider border ${
                  host.status === 'up'
                    ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                } print:border print:bg-slate-100 print:text-black`}
              >
                {host.status}
              </span>
              <span
                title={`Score: ${score}/100`}
                className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md tracking-wider border ${color} print:bg-slate-100 print:text-black print:border`}
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
                  className="flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 print:bg-slate-100 print:text-black print:border tracking-wider"
                >
                  <Clock size={10} /> {uptime}
                </span>
              )}

              {distance !== null && (
                <span
                  title={`Saltos de red: ${distance}`}
                  className="flex items-center gap-1 text-[9px] font-bold uppercase px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 print:bg-slate-100 print:text-black print:border tracking-wider"
                >
                  <Route size={10} /> {distance} hop{distance === 1 ? '' : 's'}
                </span>
              )}

              {hostCves.length > 0 && (
                <button
                  onClick={() => toggleHostExpand(hostCveKey)}
                  className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-md border transition-all flex items-center gap-1 tracking-wider ${cveBadgeColor}`}
                >
                  <ShieldAlert size={10} />
                  {showHostCves ? 'Ocultar CVEs' : `${hostCves.length} CVEs`}
                </button>
              )}

              {hasHostScripts && (
                <button
                  onClick={() => toggleHostExpand(host.ip)}
                  className="px-2 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold uppercase rounded-md border border-indigo-500/20 hover:bg-indigo-500/20 flex items-center gap-1 transition-all tracking-wider print:hidden"
                >
                  <Code2 size={10} />
                  {hostExpanded ? 'Ocultar Scripts' : `${host.scripts!.length} Scripts`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showHostCves && hostCves.length > 0 && (
        <div className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/80 p-4 print:bg-white print:border-slate-300 print:break-inside-avoid">
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <ShieldAlert size={12} /> CVEs detectados en este host
          </div>
          <CveList cves={hostCves} />
        </div>
      )}

      {hostExpanded && hasHostScripts && (
        <div className="bg-slate-900 dark:bg-black/40 border-b border-slate-800/80 p-4 overflow-x-auto custom-scrollbar shadow-inner print:bg-slate-50 print:border-slate-300 print:shadow-none print:break-inside-avoid">
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
