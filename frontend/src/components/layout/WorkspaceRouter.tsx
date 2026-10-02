import { DashboardPanel } from '../../features/dashboard/DashboardPanel';
import { TopologyPanel } from '../../features/topology/TopologyPanel';
import { FuzzingPanel } from '../../features/fuzzing/FuzzingPanel';
import { ArsenalLayout } from '../../features/toolbox/ArsenalLayout';
import { MitrePanel } from '../../features/intel/MitrePanel';
import { VaultWorkspace } from '../../features/vault/VaultWorkspace';
import { NotesPanel } from '../../features/redteam/NotesPanel';
import { WhiteboardPanel } from '../../features/redteam/WhiteboardPanel';
import { InventoryWorkspace } from '../../features/inventory/InventoryWorkspace';
import { ScanConfig } from '../../features/scanner/ScanConfig';
import { ReportStudio } from '../../features/reports/ReportStudio'; // <--- IMPORTACIÓN AÑADIDA

interface WorkspaceRouterProps {
  activeWorkspace: string;
}

export function WorkspaceRouter({ activeWorkspace }: WorkspaceRouterProps) {
  switch (activeWorkspace) {
    
    case 'scanner':
      return (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 flex justify-center custom-scrollbar">
          <div className="w-full max-w-4xl bg-white dark:bg-[#0b1120] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
              Motor de Ataque y Descubrimiento
            </h2>
            <ScanConfig />
          </div>
        </div>
      );

    case 'dashboard':
      return (
        <div className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950 print:overflow-visible flex flex-col min-w-0">
          <DashboardPanel />
        </div>
      );

    case 'topo':
      return <div className="flex-1 p-4 bg-slate-100 dark:bg-slate-950"><TopologyPanel /></div>;
    
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

    case 'vault':
      return <div className="flex-1 bg-slate-50 dark:bg-slate-950 p-2 sm:p-4"><VaultWorkspace /></div>;
    
    case 'notes':
      return <div className="flex-1 bg-slate-50 dark:bg-slate-950 p-2 sm:p-4"><NotesPanel /></div>;
    
    case 'whiteboard':
      return <div className="flex-1 bg-slate-50 dark:bg-slate-950 p-2 sm:p-4"><WhiteboardPanel /></div>;

    case 'intel':
      return (
        <div className="flex-1 flex overflow-hidden bg-slate-100 dark:bg-slate-950">
          <div className="w-full h-full mx-auto max-w-6xl"><MitrePanel /></div>
        </div>
      );

    // --- FASE 2: REPORT STUDIO CONECTADO ---
    case 'reports':
      return <ReportStudio />;

    default:
      return null;
  }
}
