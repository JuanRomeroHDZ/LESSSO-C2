import { Fragment } from 'react'
import type { HostInfo } from '../../../core/store/scanStore'
import { IANA_PORTS } from '../utils/constants'
import { detectCVEs } from '../utils/cve'
import type { CveMatch } from '../utils/cve'
import { ScriptBlock } from './ScriptBlock'
import { CveList } from './CveList'

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
  return (
    <div className="w-full overflow-x-auto print:border-none print:overflow-visible">
      <table className="w-full text-[11px] text-left text-slate-600 dark:text-slate-300 print:text-black">
        <thead className="text-[9px] text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-700 print:bg-transparent print:border-slate-300">
          <tr>
            <th className="px-3 py-1.5 font-bold w-24">Puerto</th>
            <th className="px-3 py-1.5 font-bold w-20">Estado</th>
            <th className="px-3 py-1.5 font-bold">Servicio</th>
            <th className="px-3 py-1.5 font-bold">Versión</th>
            <th className="px-3 py-1.5 font-bold">CVEs</th>
          </tr>
        </thead>
        <tbody>
          {!host.ports || host.ports.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-2 text-center text-slate-400 text-[10px]">
                Sin puertos abiertos
              </td>
            </tr>
          ) : (
            host.ports.map((port) => {
              // 1. Preferimos los CVEs enriquecidos (reales, NVD).
              // 2. Si no hay, caemos al matching heurístico local.
              const realCves: CveMatch[] = port.cves || []
              const localCves: CveMatch[] =
                realCves.length === 0
                  ? detectCVEs(port.service, port.version, port.cpe)
                  : []
              const cvList = realCves.length > 0 ? realCves : localCves

              const ianaDesc = IANA_PORTS[port.portid]
              const pastHost = historyData.find((h) => h.ip === host.ip)
              const isNewPort =
                showDiff &&
                pastHost &&
                !(pastHost.ports || []).some((p) => p.portid === port.portid)

              const portKey = `${host.ip}-${port.portid}`
              const hasScripts = port.scripts && port.scripts.length > 0
              const isExpanded = expandedPorts[portKey]
              const cpes = port.cpe && port.cpe.length > 0 ? port.cpe : []

              return (
                <Fragment key={portKey}>
                  <tr
                    className={`border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors ${
                      isNewPort ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''
                    } print:border-slate-200 print:break-inside-avoid`}
                  >
                    <td
                      className={`px-3 ${pyClass} font-bold text-slate-900 dark:text-slate-200 print:text-black align-top`}
                    >
                      <div className="flex items-start gap-1">
                        {hasScripts && (
                          <button
                            onClick={() => togglePortExpand(portKey)}
                            className="text-[9px] w-4 h-4 flex items-center justify-center bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400 font-black rounded hover:bg-teal-500 hover:text-white transition-colors print:hidden shrink-0 mt-0.5"
                          >
                            {isExpanded ? '-' : '+'}
                          </button>
                        )}
                        <div className="flex flex-col">
                          <span>
                            {port.portid}/{port.protocol}
                          </span>
                          {isNewPort && (
                            <span className="mt-0.5 bg-emerald-500 text-white text-[8px] px-1 py-0.5 rounded-sm w-fit">
                              NUEVO
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`px-3 ${pyClass} align-top`}>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase w-fit ${
                          port.state === 'open'
                            ? 'text-emerald-600 dark:text-emerald-400 print:text-emerald-700'
                            : 'text-orange-500 dark:text-orange-400 print:text-orange-600'
                        }`}
                      >
                        {port.state}
                      </span>
                    </td>
                    <td
                      className={`px-3 ${pyClass} font-medium text-slate-700 dark:text-slate-300 print:text-slate-800 align-top`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold">{port.service || '-'}</span>
                        {ianaDesc && !compactMode && (
                          <span className="text-[9px] text-slate-500 dark:text-slate-400">
                            {ianaDesc}
                          </span>
                        )}
                        {cpes.length > 0 && !compactMode && (
                          <span className="text-[9px] font-mono text-teal-600 dark:text-teal-400 print:text-slate-700 mt-0.5 break-all leading-tight">
                            {cpes.join(' · ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={`px-3 ${pyClass} text-slate-500 dark:text-slate-400 print:text-slate-600 align-top`}
                    >
                      {port.version || '-'}
                    </td>
                    <td className={`px-3 ${pyClass} align-top`}>
                      {cvList.length > 0 ? (
                        <CveList cves={cvList} compact={compactMode} />
                      ) : (
                        !compactMode && (
                          <span className="text-[9px] text-slate-400 print:text-slate-500">
                            Ok
                          </span>
                        )
                      )}
                    </td>
                  </tr>

                  {isExpanded && hasScripts && (
                    <tr className="bg-slate-100 dark:bg-slate-900/50 print:bg-slate-50 print:break-inside-avoid">
                      <td
                        colSpan={5}
                        className="p-0 border-b border-slate-200 dark:border-slate-800 print:border-slate-300"
                      >
                        <div className="p-3 m-2 bg-[#0b1120] rounded-lg shadow-inner overflow-x-auto custom-scrollbar print:bg-transparent print:shadow-none print:border print:border-slate-200">
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
