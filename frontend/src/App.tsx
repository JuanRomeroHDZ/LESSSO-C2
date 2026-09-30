import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useScanStore } from './core/store/useScanStore';
import { TerminalPanel } from './features/scanner/TerminalPanel';

import { Header } from './components/layout/Header';
import { Sidebar, type ActiveWorkspace } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { WorkspaceRouter } from './components/layout/WorkspaceRouter';

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<ActiveWorkspace>('recon');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const { theme, setParsedData, appendOutput, checkVpnStatus, pingBackend } = useScanStore();

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
      <Header setIsTerminalOpen={setIsTerminalOpen} />

      <div className="flex flex-1 overflow-hidden min-h-0 relative print:h-auto print:overflow-visible">
        <Sidebar activeWorkspace={activeWorkspace} setActiveWorkspace={setActiveWorkspace} />

        <main className="flex-1 flex flex-col min-w-0 print:h-auto print:overflow-visible">
          <WorkspaceRouter activeWorkspace={activeWorkspace} />

          {(activeWorkspace === 'recon' || activeWorkspace === 'topo') && (
            <div className={`border-t border-slate-300 dark:border-slate-700 bg-[#0b1120] transition-all duration-300 shrink-0 print:hidden ${isTerminalOpen ? 'h-[30vh]' : 'h-0 hidden'}`}>
              <TerminalPanel />
            </div>
          )}
        </main>
      </div>

      <Footer isTerminalOpen={isTerminalOpen} setIsTerminalOpen={setIsTerminalOpen} />
    </div>
  );
}
