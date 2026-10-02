import { Monitor, Apple, Terminal, Server } from 'lucide-react';
import type { HostInfo } from '../../../core/store/useScanStore';
import { calculateScore } from '../utils/score';

interface HostListSidebarProps {
  hosts: HostInfo[];
  selectedIp: string | null;
  onSelectHost: (ip: string) => void;
}

export function HostListSidebar({ hosts, selectedIp, onSelectHost }: HostListSidebarProps) {
  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800/80 rounded-xl shadow-sm overflow-hidden print:hidden">
      <div className="bg-slate-50 dark:bg-slate-900/40 px-4 py-3 border-b border-slate-200 dark:border-slate-800/80 shrink-0">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Objetivos ({hosts.length})
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {hosts.map((host) => {
          const isSelected = selectedIp === host.ip;
          const { grade, vulns } = calculateScore(host);
          
          let OsIcon = Server;
          const osLower = (host.os || '').toLowerCase();
          if (osLower.includes('win')) OsIcon = Monitor;
          if (osLower.includes('linux')) OsIcon = Terminal;
          if (osLower.includes('mac') || osLower.includes('apple')) OsIcon = Apple;

          return (
            <button
              key={host.ip}
              onClick={() => onSelectHost(host.ip)}
              className={`w-full text-left flex items-center justify-between p-2.5 rounded-lg transition-all border ${
                isSelected 
                  ? 'bg-teal-500/10 border-teal-500/30 text-teal-700 dark:text-teal-400 shadow-sm' 
                  : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative">
                  <OsIcon size={16} className={isSelected ? 'text-teal-500' : 'text-slate-400'} />
                  <span className={`absolute -bottom-1 -right-1 w-2 h-2 rounded-full border border-white dark:border-[#020617] ${host.status === 'up' ? 'bg-teal-500' : 'bg-rose-500'}`} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-xs font-bold truncate">{host.ip}</span>
                  {host.hostname && (
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">
                      {host.hostname}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                <span className={`text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded uppercase ${
                  grade === 'A' || grade === 'B' ? 'bg-emerald-500/10 text-emerald-500' :
                  grade === 'C' ? 'bg-amber-500/10 text-amber-500' :
                  'bg-rose-500/10 text-rose-500'
                }`}>
                  {grade}
                </span>
                {vulns > 0 && (
                  <span className="text-[8px] font-bold text-rose-500 animate-pulse">
                    {vulns} CVEs
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
