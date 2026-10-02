import React, { useState } from 'react';
import { Monitor, Apple, Terminal, Server, ShieldAlert, Activity, ChevronDown, ChevronRight, Network, ShieldCheck } from 'lucide-react';
import type { HostInfo } from '../../../core/store/useScanStore';
import { calculateScore } from '../../dashboard/utils/score';

interface AssetsTableProps {
  hosts: HostInfo[];
  selectedIps: Set<string>;
  onToggleSelect: (ip: string) => void;
  onToggleAll: () => void;
}

export function AssetsTable({ hosts, selectedIps, onToggleSelect, onToggleAll }: AssetsTableProps) {
  const allSelected = hosts.length > 0 && selectedIps.size === hosts.length;
  const indeterminate = selectedIps.size > 0 && selectedIps.size < hosts.length;
  
  // Estado para manejar qué fila está expandida (Acordeón)
  const [expandedIp, setExpandedIp] = useState<string | null>(null);

  const toggleExpand = (ip: string) => {
    setExpandedIp(prev => prev === ip ? null : ip);
  };

  return (
    <div className="w-full h-full overflow-auto custom-scrollbar bg-white dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
      <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
        <thead className="bg-slate-50 dark:bg-slate-900/80 uppercase font-black text-[10px] tracking-widest text-slate-500 border-b border-slate-200 dark:border-slate-800/80 sticky top-0 z-10 shadow-sm">
          <tr>
            <th className="p-3 w-10 text-center">
              <input
                type="checkbox"
                checked={allSelected}
                ref={input => { if (input) input.indeterminate = indeterminate; }}
                onChange={onToggleAll}
                className="w-3.5 h-3.5 accent-teal-500 cursor-pointer rounded border-slate-300 dark:border-slate-700"
              />
            </th>
            <th className="p-3 w-10 text-center"></th> {/* Columna para el ícono de expandir */}
            <th className="p-3">Objetivo (IP / Host)</th>
            <th className="p-3">Sistema Operativo</th>
            <th className="p-3 text-center">Estado</th>
            <th className="p-3 text-center">Puertos</th>
            <th className="p-3 text-center">Riesgo (CVEs)</th>
            <th className="p-3 text-center">Sec Grade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {hosts.length === 0 ? (
            <tr>
              <td colSpan={8} className="p-12 text-center text-slate-400 font-mono text-xs">
                No hay activos que coincidan con la búsqueda.
              </td>
            </tr>
          ) : (
            hosts.map((host) => {
              const { grade, color, vulns } = calculateScore(host);
              const isSelected = selectedIps.has(host.ip);
              const isExpanded = expandedIp === host.ip;
              
              // Lógica visual del SO
              let OsIcon = Server;
              const osLower = (host.os || '').toLowerCase();
              if (osLower.includes('win')) OsIcon = Monitor;
              if (osLower.includes('linux')) OsIcon = Terminal;
              if (osLower.includes('mac') || osLower.includes('apple')) OsIcon = Apple;

              // Lógica de la barra de densidad de puertos
              const openPortsCount = (host.ports || []).filter(p => p.state === 'open').length;
              const totalPorts = (host.ports || []).length;
              const openRatio = totalPorts > 0 ? (openPortsCount / totalPorts) * 100 : 0;

              return (
                <React.Fragment key={host.ip}>
                  {/* FILA PRINCIPAL */}
                  <tr 
                    className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30 group ${
                      isSelected ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''
                    } ${isExpanded ? 'bg-slate-50 dark:bg-slate-800/20' : ''}`}
                  >
                    <td className="p-3 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(host.ip)}
                        className="w-3.5 h-3.5 accent-teal-500 cursor-pointer rounded border-slate-300 dark:border-slate-700"
                      />
                    </td>
                    <td className="p-3 text-center align-middle">
                      <button 
                        onClick={() => toggleExpand(host.ip)}
                        className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 transition-colors focus:outline-none"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="p-3 font-mono align-middle">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white text-[13px]">{host.ip}</span>
                        {host.hostname && (
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[150px]">
                            {host.hostname}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 align-middle">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                          <OsIcon size={14} />
                        </div>
                        <span className="truncate max-w-[180px] font-medium text-slate-700 dark:text-slate-300" title={host.os || 'Desconocido'}>
                          {host.os || 'Desconocido'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-center align-middle">
                      <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border shadow-sm ${
                        host.status === 'up' ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                      }`}>
                        <Activity size={10} /> {host.status}
                      </span>
                    </td>
                    <td className="p-3 text-center align-middle">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                          {openPortsCount} <span className="text-[9px] text-slate-400 font-normal">/ {totalPorts}</span>
                        </span>
                        <div className="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden" title={`${openRatio.toFixed(1)}% de los puertos detectados están abiertos`}>
                          <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${openRatio}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center align-middle">
                      {vulns > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-md shadow-sm">
                          <ShieldAlert size={12} /> {vulns} CVEs
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-teal-600 dark:text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-1 rounded-md shadow-sm opacity-50 group-hover:opacity-100 transition-opacity">
                          <ShieldCheck size={12} /> Seguro
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center align-middle">
                      <span className={`inline-flex justify-center items-center w-6 h-6 text-[10px] font-black uppercase rounded-md tracking-widest border ${color} shadow-sm`}>
                        {grade}
                      </span>
                    </td>
                  </tr>

                  {/* ACORDEÓN DESPLEGABLE CON SUB-MÓDULO DE SERVICIOS */}
                  {isExpanded && (
                    <tr className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800">
                      <td colSpan={8} className="p-0">
                        <div className="p-4 sm:p-6 animate-in slide-in-from-top-2 fade-in duration-200">
                          <div className="bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-700/50 rounded-xl p-5 shadow-sm">
                            
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
                              <Network size={14} className="text-indigo-500" />
                              Desglose de Servicios ({host.ip})
                            </h4>
                            
                            {host.ports && host.ports.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                {host.ports.map((port, idx) => {
                                  const cvesCount = port.cves?.length || 0;
                                  return (
                                    <div key={`${port.portid}-${idx}`} className="flex flex-col p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                          {port.portid}/{port.protocol}
                                        </div>
                                        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm ${port.state === 'open' ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20' : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20'}`}>
                                          {port.state}
                                        </span>
                                      </div>
                                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate" title={port.service || 'unknown'}>
                                        {port.service || 'unknown'}
                                      </div>
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title={port.version || 'Sin versión'}>
                                        {port.version || 'Sin versión detectada'}
                                      </div>
                                      
                                      {cvesCount > 0 && (
                                        <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700/50">
                                          <span className="text-[9px] font-bold text-rose-500 dark:text-rose-400 flex items-center gap-1.5 bg-rose-500/10 w-fit px-2 py-0.5 rounded border border-rose-500/20">
                                            <ShieldAlert size={10} /> {cvesCount} Vulnerabilidad{cvesCount > 1 ? 'es' : ''}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-center p-6 text-[11px] text-slate-400 font-mono italic bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                                No se descubrieron puertos ni servicios en este host.
                              </div>
                            )}

                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
