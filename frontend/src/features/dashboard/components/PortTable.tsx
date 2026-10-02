import { Fragment, useState } from 'react'
import type { HostInfo } from '../../../core/store/scanStore'
import { IANA_PORTS } from '../utils/constants'
import { detectCVEs } from '../utils/cve'
import type { CveMatch } from '../utils/cve'
import { ScriptBlock } from './ScriptBlock'
import { CveList } from './CveList'
import { ChevronRight, ChevronDown, CheckCircle2, ShieldAlert } from 'lucide-react'

interface PortTableProps {
  host: HostInfo
  historyData: HostInfo[]
  showDiff: boolean
  compactMode: boolean
  expandedPorts: Record<string, boolean>
  togglePortExpand: (id: string) => void
  pyClass: string
}

export function PortTable({
  host,
  historyData,
  showDiff,
  compactMode,
  expandedPorts,
  togglePortExpand,
  pyClass,
}: PortTableProps) {
  // Estado local para colapsar/expandir CVEs por puerto
  const [showCves, setShowCves] = useState<Record<string, boolean>>({});
  const toggleCves = (portKey: string) => {
    setShowCves(prev => ({ ...prev, [portKey]: !prev[portKey] }));
  };

  return (
    <div className="w-full overflow-x-auto print:border-none print:overflow-visible">
      <table className="w-full text-[11px] text-left text-slate-600 dark:text-slate-300 print:text-black">
        <thead className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-[#020617] border-b border-slate-200 dark:border-slate-800/80 print:bg-transparent print:border-slate-300">
          <tr>
            <th className="px-4 py-2.5 font-semibold w-28">Puerto</th>
            <th className="px-4 py-2.5 font-semibold w-24">Estado</th>
            <th className="px-4 py-2.5 font-semibold">Servicio</th>
            <th className="px-4 py-2.5 font-semibold">Versión</th>
            <th className="px-4 py-2.5 font-semibold">Vulnerabilidades</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {!host.ports || host.ports.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-4 text-center text-slate-400 dark:text-slate-500 font-mono text-[10px]">
                No se detectaron puertos abiertos
              </td>
            </tr>
          ) : (
            host.ports.map((port) => {
              const realCves: CveMatch[] = port.cves || []
              const localCves: CveMatch[] = realCves.length === 0 ? detectCVEs(port.service, port.version, port.cpe) : []
              const cvList = realCves.length > 0 ? realCves : localCves

              const ianaDesc = IANA_PORTS[port.portid]
              const pastHost = historyData.find((h) => h.ip === host.ip)
              const isNewPort = showDiff && pastHost && !(pastHost.ports || []).some((p) => p.portid === port.portid)

              const portKey = `${host.ip}-${port.portid}`
              const hasScripts = port.scripts && port.scripts.length > 0
              const isExpanded = expandedPorts[portKey]
              const cpes = port.cpe && port.cpe.length > 0 ? port.cpe : []

              return (
                <Fragment key={portKey}>
                  <tr className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors ${isNewPort ? 'bg-teal-50/30 dark:bg-teal-900/10' : ''} print:border-slate-200 print:break-inside-avoid`}>
                    <td className={`px-4 ${pyClass} font-mono font-medium text-slate-900 dark:text-slate-200 print:text-black align-top`}>
                      <div className="flex items-start gap-1.5">
                        {hasScripts && (
                          <button
                            onClick={() => togglePortExpand(portKey)}
                            className="text-slate-400 hover:text-teal-500 dark:hover:text-teal-400 transition-colors mt-0.5 print:hidden"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                        <div className="flex flex-col mt-0.5">
                          <span>
                            {port.portid}<span className="text-slate-400">/{port.protocol}</span>
                          </span>
                          {isNewPort && (
                            <span className="mt-1 bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider w-fit">
                              Nuevo
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 ${pyClass} align-top pt-3`}>
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border w-fit ${
                        port.state === 'open'
                          ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 print:text-teal-700'
                          : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 print:text-orange-600'
                      }`}>
                        {port.state}
                      </span>
                    </td>
                    <td className={`px-4 ${pyClass} text-slate-700 dark:text-slate-300 print:text-slate-800 align-top pt-3`}>
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{port.service || '-'}</span>
                        {ianaDesc && !compactMode && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-500 leading-snug">
                            {ianaDesc}
                          </span>
                        )}
                        {cpes.length > 0 && !compactMode && (
                          <span className="text-[9px] font-mono text-teal-600/80 dark:text-teal-400/70 print:text-slate-700 mt-1 break-all bg-slate-100 dark:bg-slate-900/50 px-1.5 py-0.5 rounded w-fit">
                            {cpes.join(' · ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={`px-4 ${pyClass} font-mono text-slate-600 dark:text-slate-400 print:text-slate-600 align-top pt-3`}>
                      {port.version || '-'}
                    </td>
                    <td className={`px-4 ${pyClass} align-top pt-2.5`}>
                      {cvList.length > 0 ? (
                        <div className="flex flex-col gap-2 items-start">
                          <button
                            onClick={() => toggleCves(portKey)}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[9px] font-bold uppercase tracking-wider rounded transition-colors"
                          >
                            <ShieldAlert size={12} />
                            {showCves[portKey] ? 'Ocultar CVEs' : `${cvList.length} CVEs`}
                          </button>
                          
                          {showCves[portKey] && (
                            <div className="mt-1 w-full animate-in fade-in slide-in-from-top-2">
                              <CveList cves={cvList} compact={compactMode} />
                            </div>
                          )}
                        </div>
                      ) : (
                        !compactMode && (
                          <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-600 text-[10px] uppercase font-semibold tracking-wider">
                            <CheckCircle2 size={12} /> Seguro
                          </div>
                        )
                      )}
                    </td>
                  </tr>

                  {isExpanded && hasScripts && (
                    <tr className="bg-slate-50 dark:bg-[#020617]/50 print:bg-slate-50 print:break-inside-avoid">
                      <td colSpan={5} className="p-0 border-b border-slate-200 dark:border-slate-800/60 print:border-slate-300">
                        <div className="px-8 py-4 bg-slate-900 dark:bg-black/40 shadow-inner overflow-x-auto custom-scrollbar border-y border-slate-800">
                          {port.scripts?.map((s, sidx) => (
                            <ScriptBlock key={sidx} script={s} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
