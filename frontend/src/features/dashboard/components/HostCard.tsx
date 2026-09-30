import type { HostInfo } from '../../../core/store/useScanStore';
import { calculateScore } from '../utils/score';
import { PortTable } from './PortTable';
import { ScriptBlock } from './ScriptBlock';

interface HostCardProps {
  host: HostInfo;
  historyData: HostInfo[];
  showDiff: boolean;
  compactMode: boolean;
  expandedPorts: Record<string, boolean>;
  expandedHosts: Record<string, boolean>;
  togglePortExpand: (id: string) => void;
  toggleHostExpand: (id: string) => void;
  pyClass: string;
}

export function HostCard({
  host, historyData, showDiff, compactMode, 
  expandedPorts, expandedHosts, togglePortExpand, toggleHostExpand, pyClass
}: HostCardProps) {
  const { score, grade, color, vulns } = calculateScore(host);
  const hasHostScripts = host.scripts && host.scripts.length > 0;
  const hostExpanded = expandedHosts[host.ip];

  let osIcon = '💻';
  if (host.os.toLowerCase().includes('win')) osIcon = '🪟';
  if (host.os.toLowerCase().includes('linux')) osIcon = '🐧';
  if (host.os.toLowerCase().includes('mac') || host.os.toLowerCase().includes('apple')) osIcon = '🍎';

  return (
    <div className={`print-page-break print-force-colors bg-white dark:bg-slate-800 rounded-lg shadow-sm border ${vulns > 0 ? 'border-red-300 dark:border-red-900/50 print:border-slate-300' : 'border-slate-200 dark:border-slate-700 print:border-slate-300'} overflow-hidden flex flex-col print:shadow-none print:bg-white print:text-black`}>
      <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center print:bg-white print:border-slate-300">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-black text-[#0b282c] dark:text-white print:text-black flex items-center gap-1">
              {osIcon} {host.ip}
            </h2>
            {host.hostname && (
              <span className="text-[9px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 print:bg-slate-100 print:text-slate-800">
                {host.hostname}
              </span>
            )}
          </div>
          <div className="flex gap-1.5 items-center mt-0.5">
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${host.status === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'} print:border print:bg-slate-100 print:text-black`}>
              {host.status}
            </span>
            <span title={`Score: ${score}/100`} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${color} print:bg-slate-100 print:text-black print:border`}>
              Sec Grade: {grade}
            </span>

            {hasHostScripts && (
              <button 
                onClick={() => toggleHostExpand(host.ip)} 
                className="ml-2 px-1.5 py-0.5 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 text-[9px] font-bold uppercase rounded-md border border-teal-300 dark:border-teal-800/50 hover:bg-teal-200 flex items-center gap-1 transition-colors print:hidden"
              >
                {hostExpanded ? 'Ocultar Info Extra' : `[+] ${host.scripts!.length} Scripts de Host`}
              </button>
            )}
          </div>
        </div>
      </div>

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
  );
}
