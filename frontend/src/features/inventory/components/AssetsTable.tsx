import { Monitor, Apple, Terminal, Server, ShieldAlert, Activity } from 'lucide-react';
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

  return (
    <div className="w-full h-full overflow-auto custom-scrollbar bg-white dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
      <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
        <thead className="bg-slate-50 dark:bg-slate-900/80 uppercase font-black text-[10px] tracking-widest text-slate-500 border-b border-slate-200 dark:border-slate-800/80 sticky top-0 z-10">
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
              <td colSpan={7} className="p-12 text-center text-slate-400 font-mono text-xs">
                No hay activos que coincidan con la búsqueda.
              </td>
            </tr>
          ) : (
            hosts.map((host) => {
              const { grade, color, vulns } = calculateScore(host);
              const isSelected = selectedIps.has(host.ip);
              
              let OsIcon = Server;
              const osLower = (host.os || '').toLowerCase();
              if (osLower.includes('win')) OsIcon = Monitor;
              if (osLower.includes('linux')) OsIcon = Terminal;
              if (osLower.includes('mac') || osLower.includes('apple')) OsIcon = Apple;

              const openPortsCount = (host.ports || []).filter(p => p.state === 'open').length;

              return (
                <tr 
                  key={host.ip} 
                  className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30 ${
                    isSelected ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''
                  }`}
                >
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(host.ip)}
                      className="w-3.5 h-3.5 accent-teal-500 cursor-pointer rounded border-slate-300 dark:border-slate-700"
                    />
                  </td>
                  <td className="p-3 font-mono">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 dark:text-white text-[13px]">{host.ip}</span>
                      {host.hostname && (
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                          {host.hostname}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <OsIcon size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate max-w-[180px]" title={host.os || 'Desconocido'}>
                        {host.os || 'Desconocido'}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                      host.status === 'up' ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                    }`}>
                      <Activity size={10} /> {host.status}
                    </span>
                  </td>
                  <td className="p-3 text-center font-mono font-bold">
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded">
                      {openPortsCount}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {vulns > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                        <ShieldAlert size={12} /> {vulns} CVEs
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-bold tracking-wider">-</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-widest border ${color}`}>
                      {grade}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
