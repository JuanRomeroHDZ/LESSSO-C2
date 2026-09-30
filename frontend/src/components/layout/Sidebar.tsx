export type ActiveWorkspace = 'recon' | 'topo' | 'fuzz' | 'arsenal' | 'cerebro' | 'intel';

interface SidebarProps {
  activeWorkspace: ActiveWorkspace;
  setActiveWorkspace: (w: ActiveWorkspace) => void;
}

export function Sidebar({ activeWorkspace, setActiveWorkspace }: SidebarProps) {
  return (
    <aside className="w-16 shrink-0 bg-slate-100 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 z-20 print:hidden gap-4">
      <button onClick={() => setActiveWorkspace('recon')} title="Reconocimiento (Nmap/Dashboard)" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'recon' ? 'bg-[#0b282c] text-white shadow-lg shadow-[#0b282c]/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">📊</span></button>
      <button onClick={() => setActiveWorkspace('topo')} title="Topología de Red" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'topo' ? 'bg-[#0b282c] text-white shadow-lg shadow-[#0b282c]/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">🕸</span></button>
      <button onClick={() => setActiveWorkspace('fuzz')} title="Web Fuzzer Visualizer" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'fuzz' ? 'bg-[#0b282c] text-white shadow-lg shadow-[#0b282c]/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">🌐</span></button>
      <button onClick={() => setActiveWorkspace('arsenal')} title="Arsenal (Shells, Vulns, Services, Crypto, Listener)" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'arsenal' ? 'bg-[#0b282c] text-white shadow-lg shadow-[#0b282c]/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">🧰</span></button>
      <button onClick={() => setActiveWorkspace('cerebro')} title="Cerebro (Bóveda y Bitácora)" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'cerebro' ? 'bg-[#0b282c] text-white shadow-lg shadow-[#0b282c]/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">🧠</span></button>
      <button onClick={() => setActiveWorkspace('intel')} title="Threat Intelligence (MITRE ATT&CK)" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'intel' ? 'bg-[#0b282c] text-white shadow-lg shadow-[#0b282c]/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">📖</span></button>
    </aside>
  );
}
