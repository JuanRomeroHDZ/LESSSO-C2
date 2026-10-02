import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useScanStore } from './core/store/useScanStore';
import { useUiStore } from './core/store/uiStore';
import { TerminalPanel } from './features/scanner/TerminalPanel';

import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { WorkspaceRouter } from './components/layout/WorkspaceRouter';

type WorkspaceType = 'recon' | 'topo' | 'inventory' | 'fuzz' | 'arsenal' | 'cerebro' | 'intel';

export default function App() {
  const { theme, activeWorkspace, isTerminalOpen } = useUiStore();
  const { setParsedData, appendOutput, checkVpnStatus, pingBackend } = useScanStore();

  useEffect(() => {
    checkVpnStatus();
    const vpnInterval = setInterval(checkVpnStatus, 5000);
    return () => clearInterval(vpnInterval);
  }, [checkVpnStatus]);

  useEffect(() => {
    pingBackend();
    const interval = setInterval(() => pingBackend(), 30_000);
    return () => clearInterval(interval);
  }, [pingBackend]);

  useEffect(() => {
    const unlistenData = listen<string>('nmap-structured-data', (event) => {
      try {
        const result = JSON.parse(event.payload);
        setParsedData(result.hosts || []);
        useScanStore.getState().syncWithBackend(
          useScanStore.getState().target,
          useScanStore.getState().scanDuration,
          result.hosts || []
        );
      } catch (err) {
        appendOutput(`\n[SYS] Error estructurando datos: ${err}`);
      }
    });

    const unlistenFuzz = listen<string>('fuzzer-output', (event) => {
      useScanStore.setState((s) => ({ fuzzerRawOutput: s.fuzzerRawOutput + event.payload + '\n' }));
    });

    const unlistenFuzzEnd = listen('fuzzer-finished', () => {
      useScanStore.setState({ isFuzzing: false });
    });

    return () => {
      unlistenData.then(f => f());
      unlistenFuzz.then(f => f());
      unlistenFuzzEnd.then(f => f());
    };
  }, [setParsedData, appendOutput]);

  return (
    <div className={`${theme} flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-sans transition-colors duration-200 print:bg-white print:text-black`}>
      <Header />

      <div className="flex flex-1 overflow-hidden min-h-0 relative print:h-auto print:overflow-visible">
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 relative print:h-auto print:overflow-visible">
          
          <WorkspaceRouter activeWorkspace={activeWorkspace as WorkspaceType} />

          {/* Cajón de Terminal Colapsable (Estilo VS Code) */}
          <div 
            className={`absolute bottom-0 left-0 right-0 border-t border-slate-300 dark:border-slate-700 bg-[#0b1120] transition-transform duration-300 ease-in-out z-40 print:hidden shadow-[0_-10px_40px_rgba(0,0,0,0.2)] ${
              isTerminalOpen ? 'translate-y-0 h-[35vh]' : 'translate-y-full h-[35vh]'
            }`}
          >
            <TerminalPanel />
          </div>

        </main>
      </div>

      <Footer />
    </div>
  );
}
