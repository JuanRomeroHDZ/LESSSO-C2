import { useState } from 'react';
import { DashboardPanel } from '../../features/dashboard/DashboardPanel';
import { TopologyPanel } from '../../features/topology/TopologyPanel';
import { FuzzingPanel } from '../../features/fuzzing/FuzzingPanel';
import { ArsenalLayout } from '../../features/toolbox/ArsenalLayout';
import { MitrePanel } from '../../features/intel/MitrePanel';
import { VaultWorkspace } from '../../features/vault/VaultWorkspace';
import { NotesPanel } from '../../features/redteam/NotesPanel';
import { WhiteboardPanel } from '../../features/redteam/WhiteboardPanel';
import { InventoryWorkspace } from '../../features/inventory/InventoryWorkspace';

interface WorkspaceRouterProps {
  activeWorkspace: 'recon' | 'topo' | 'inventory' | 'fuzz' | 'arsenal' | 'cerebro' | 'intel';
}

export function WorkspaceRouter({ activeWorkspace }: WorkspaceRouterProps) {
  const [cerebroTab, setCerebroTab] = useState<'notes' | 'whiteboard'>('notes');

  switch (activeWorkspace) {
    case 'recon':
      return (
        <div className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950 print:overflow-visible flex flex-col min-w-0">
          <DashboardPanel />
        </div>
      );

    case 'topo':
      return <div className="flex-1 p-4"><TopologyPanel /></div>;
    case 'inventory':
      return <InventoryWorkspace />;
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
        <div className="flex flex-1 overflow-hidden min-w-0 flex-col md:flex-row">
          <div className="w-full md:w-[320px] lg:w-[350px] shrink-0 overflow-y-auto bg-slate-50 dark:bg-slate-950 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800">
            <VaultWorkspace />
          </div>
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 min-w-0">
            <div className="flex border-b border-slate-200 dark:border-slate-800 px-2 sm:px-4 pt-3 gap-1 sm:gap-2 shrink-0 bg-slate-50 dark:bg-slate-950 overflow-x-auto custom-scrollbar">
              <button onClick={() => setCerebroTab('notes')} className={`px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold uppercase rounded-t-lg transition-colors border border-b-0 whitespace-nowrap ${cerebroTab === 'notes' ? 'bg-white dark:bg-slate-900 text-[#0b282c] dark:text-teal-400 border-slate-200 dark:border-slate-800 relative top-[1px]' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>📝 Bitácora</button>
              <button onClick={() => setCerebroTab('whiteboard')} className={`px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold uppercase rounded-t-lg transition-colors border border-b-0 whitespace-nowrap ${cerebroTab === 'whiteboard' ? 'bg-white dark:bg-slate-900 text-[#0b282c] dark:text-teal-400 border-slate-200 dark:border-slate-800 relative top-[1px]' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>🎨 Pizarra Gráfica</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 custom-scrollbar min-w-0">
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
