import { useUiStore } from '../../core/store/uiStore';
import { Crosshair, Network, Bomb, ShieldAlert, Cpu, BookOpen, Server } from 'lucide-react';
import { cn } from '../../lib/utils';

const WORKSPACES = [
  { id: 'recon', icon: Crosshair, label: 'Reconocimiento' },
  { id: 'topo', icon: Network, label: 'Topología' },
  { id: 'inventory', icon: Server, label: 'Inventario (Activos)' },
  { id: 'fuzz', icon: Bomb, label: 'Fuzzing & Enum' },
  { id: 'arsenal', icon: ShieldAlert, label: 'Arsenal' },
  { id: 'cerebro', icon: Cpu, label: 'Cerebro (Notas)' },
  { id: 'intel', icon: BookOpen, label: 'OSINT & Intel' },
] as const;

export function Sidebar() {
  const { activeWorkspace, setActiveWorkspace } = useUiStore();

  return (
    <aside className="w-14 shrink-0 bg-slate-50 dark:bg-[#09090b] border-r border-slate-200 dark:border-slate-800/60 flex flex-col items-center py-4 gap-2 z-20 print:hidden">
      {WORKSPACES.map((ws) => {
        const isActive = activeWorkspace === ws.id;
        const Icon = ws.icon;
        return (
          <button
            key={ws.id}
            onClick={() => setActiveWorkspace(ws.id)}
            title={ws.label}
            className={cn(
              "p-2.5 rounded-xl transition-all duration-200 group relative",
              isActive  
                ? "bg-[#0b282c] dark:bg-teal-500/10 text-white dark:text-teal-400"  
                : "text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#0b282c] dark:bg-teal-400 rounded-r-full" />
            )}
          </button>
        );
      })}
    </aside>
  );
}
