import { useState } from 'react';
import { ScanConfig } from '../../features/scanner/ScanConfig';
import { DashboardPanel } from '../../features/dashboard/DashboardPanel';
import { TopologyPanel } from '../../features/topology/TopologyPanel';
import { FuzzingPanel } from '../../features/fuzzing/FuzzingPanel';
import { ArsenalLayout } from '../../features/toolbox/ArsenalLayout';
import { MitrePanel } from '../../features/intel/MitrePanel';
import { VaultWorkspace } from '../../features/vault/VaultWorkspace';
import { NotesPanel } from '../../features/redteam/NotesPanel';
import { WhiteboardPanel } from '../../features/redteam/WhiteboardPanel';

interface WorkspaceRouterProps {
  activeWorkspace: 'recon' | 'topo' | 'fuzz' | 'arsenal' | 'cerebro' | 'intel';
}

export function WorkspaceRouter({ activeWorkspace }: WorkspaceRouterProps) {
  const [cerebroTab, setCerebroTab] = useState<'notes' | 'whiteboard'>('notes');

  switch (activeWorkspace) {
    case 'recon':
      return (
        <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
          <div className="w-[320px] border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-y-auto shrink-0 print:hidden">
            <ScanConfig />
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50 dark:bg-slate-950 print:p-0">
            <DashboardPanel />
          </div>
        </div>
      );
    case 'topo':
      return <div className="flex-1 p-4"><TopologyPanel /></div>;
    case 'fuzz':
      return (
        <div className="flex-1 p-4 bg-slate-100 dark:bg-slate-950 overflow-hidden">
          <div className="h-full mx-auto max-w-7xl"><FuzzingPanel /></div>
        </div>
      );
    case 'arsenal':
      return <ArsenalLayout />;
    case 'cerebro':
      return (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[350px] shrink-0 overflow-y-auto bg-slate-50 dark:bg-slate-950">
            <VaultWorkspace />
          </div>
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
            <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 pt-3 gap-2 shrink-0 bg-slate-50 dark:bg-slate-950">
              <button onClick={() => setCerebroTab('notes')} className={`px-4 py-2 text-xs font-bold uppercase rounded-t-lg transition-colors border border-b-0 ${cerebroTab === 'notes' ? 'bg-white dark:bg-slate-900 text-[#0b282c] dark:text-teal-400 border-slate-200 dark:border-slate-800 relative top-[1px]' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>📝 Bitácora</button>
              <button onClick={() => setCerebroTab('whiteboard')} className={`px-4 py-2 text-xs font-bold uppercase rounded-t-lg transition-colors border border-b-0 ${cerebroTab === 'whiteboard' ? 'bg-white dark:bg-slate-900 text-[#0b282c] dark:text-teal-400 border-slate-200 dark:border-slate-800 relative top-[1px]' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>🎨 Pizarra Gráfica</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {cerebroTab === 'notes' ? <NotesPanel /> : <WhiteboardPanel />}
            </div>
          </div>
        </div>
      );
    case 'intel':
      return (
        <div className="flex-1 flex overflow-hidden bg-slate-100 dark:bg-slate-950">
          <div className="w-full h-full mx-auto max-w-6xl"><MitrePanel /></div>
        </div>
      );
    default:
      return null;
  }
}
