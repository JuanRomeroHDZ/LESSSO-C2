import { useMemo } from 'react';
import type { HostInfo } from '../../../core/store/useScanStore';
import { calculateScore } from '../utils/score';
import { PortTable } from './PortTable';
import { ScriptBlock } from './ScriptBlock';
import { CveList } from './CveList';
import { detectCVEs } from '../utils/cve';
import type { CveMatch } from '../utils/cve';
import { Monitor, Apple, Terminal, Server, Clock, Route, ShieldAlert, Code2 } from 'lucide-react';

interface HostDetailViewProps {
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

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 && d === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };

export function HostDetailView({
  host, historyData, showDiff, compactMode, expandedPorts, expandedHosts, togglePortExpand, toggleHostExpand, pyClass,
}: HostDetailViewProps) {
  const { score, grade, color, vulns } = calculateScore(host);
  const hasHostScripts = host.scripts && host.scripts.length > 0;
  const hostExpanded = expandedHosts[host.ip];

  const hostCves = useMemo<CveMatch[]>(() => {
    const out: CveMatch[] = [];
    for (const port of host.ports || []) {
      const real = port.cves || [];
      if (real.length > 0) out.push(...real);
      else out.push(...detectCVEs(port.service, port.version, port.cpe));
    }
    const byId = new Map<string, CveMatch>();
    for (const c of out) {
      const prev = byId.get(c.id);
      if (!prev) { byId.set(c.id, c); continue; }
      if ((SEVERITY_ORDER[c.severity] ?? 0) > (SEVERITY_ORDER[prev.severity] ?? 0)) byId.set(c.id, c);
    }
    return Array.from(byId.values());
  }, [host.ports]);

  const maxSeverity = hostCves.reduce((acc, c) => Math.max(acc, SEVERITY_ORDER[c.severity] ?? 0), 0);
  const cveBadgeColor = maxSeverity >= 4 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' : maxSeverity >= 3 ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  const hostCveKey = `cves-${host.ip}`;
  const showHostCves = expandedHosts[hostCveKey];

  let OsIcon = Server;
  const osLower = (host.os || '').toLowerCase();
  if (osLower.includes('win')) OsIcon = Monitor;
  if (osLower.includes('linux')) OsIcon = Terminal;
  if (osLower.includes('mac') || osLower.includes('apple')) OsIcon = Apple;

  const uptime = formatUptime(host.uptime_seconds);
  const distance = host.distance && host.distance > 0 ? host.distance : null;

  return (
    <div className={`h-full flex flex-col bg-white dark:bg-[#020617] rounded-xl shadow-sm border ${vulns > 0 ? 'border-rose-500/30 dark:border-rose-900/50' : 'border-slate-200 dark:border-slate-800/80'} overflow-hidden`}>
      <div className="bg-slate-50 dark:bg-slate-900/40 px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-mono font-black text-slate-900 dark:text-white flex items-center gap-2 tracking-tight">
                <OsIcon size={20} className="text-slate-400" /> {host.ip}
              </h2>
              {host.hostname && (
                <span className="text-[11px] font-bold text-slate-500 bg-slate-200/50 dark:bg-slate-800/50 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-300/50 dark:border-slate-700/50 uppercase tracking-wider">
                  {host.hostname}
                </span>
              )}
            </div>

            <div className="flex gap-2 items-center mt-3 flex-wrap">
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-md tracking-wider border ${host.status === 'up' ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'}`}>
                {host.status}
              </span>
              <span title={`Score: ${score}/100`} className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-md tracking-wider border ${color}`}>
                Sec Grade: {grade}
              </span>

              {uptime && (
                <span title={host.uptime_lastboot ? `Último arranque: ${host.uptime_lastboot}` : 'Uptime'} className="flex items-center gap-1.5 text-[10px] font-bold uppercase px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 tracking-wider">
                  <Clock size={12} /> {uptime}
                </span>
              )}

              {distance !== null && (
                <span title={`Saltos de red: ${distance}`} className="flex items-center gap-1.5 text-[10px] font-bold uppercase px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 tracking-wider">
                  <Route size={12} /> {distance} hop{distance === 1 ? '' : 's'}
                </span>
              )}

              {hostCves.length > 0 && (
                <button onClick={() => toggleHostExpand(hostCveKey)} className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-md border transition-all flex items-center gap-1.5 tracking-wider hover:bg-opacity-80 ${cveBadgeColor}`}>
                  <ShieldAlert size={12} /> {showHostCves ? 'Ocultar CVEs' : `${hostCves.length} CVEs`}
                </button>
              )}

              {hasHostScripts && (
                <button onClick={() => toggleHostExpand(host.ip)} className="px-2.5 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase rounded-md border border-indigo-500/20 hover:bg-indigo-500/20 flex items-center gap-1.5 transition-all tracking-wider">
                  <Code2 size={12} /> {hostExpanded ? 'Ocultar Scripts' : `${host.scripts!.length} Scripts`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-900/10">
        {showHostCves && hostCves.length > 0 && (
          <div className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-200 dark:border-slate-800/80 p-5">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <ShieldAlert size={14} /> CVEs detectados en este host
            </div>
            <CveList cves={hostCves} />
          </div>
        )}

        {hostExpanded && hasHostScripts && (
          <div className="bg-slate-900 dark:bg-black/40 border-b border-slate-800/80 p-5 overflow-x-auto custom-scrollbar shadow-inner">
            {host.scripts?.map((s, sidx) => <ScriptBlock key={sidx} script={s} />)}
          </div>
        )}

        <div className="p-4">
          <PortTable host={host} historyData={historyData} showDiff={showDiff} compactMode={compactMode} expandedPorts={expandedPorts} togglePortExpand={togglePortExpand} pyClass={pyClass} />
        </div>
      </div>
    </div>
  );
}
