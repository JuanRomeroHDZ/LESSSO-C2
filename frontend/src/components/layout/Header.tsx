import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useScanStore } from '../../core/store/useScanStore';
import { ExamTimer } from './ExamTimer';

interface HeaderProps {
  setIsTerminalOpen: (v: boolean) => void;
}

export function Header({ setIsTerminalOpen }: HeaderProps) {
  const {
    target, setTarget, applyProfile, useRustScan, setField, copyMasterConfig,
    theme, toggleTheme, isScanning, clearOutput, setScanDuration, notifyCompletion,
  } = useScanStore();

  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScanRef = useRef<() => Promise<void>>(async () => {});

  const handleScan = useCallback(async () => {
    if (!target) return;

    setIsTerminalOpen(true);

    const store = useScanStore.getState();
    store.setIsScanning(true);
    clearOutput();
    const startTime = Date.now();

    if (useRustScan) store.appendOutput('>>> Inicializando RUSTSCAN (Modo Ultra Rápido)...\n');
    else store.appendOutput('>>> Inicializando Motor de Auditoría LESSSO C2 (NMAP)...\n');

    if (!('__TAURI_INTERNALS__' in window)) {
      store.appendOutput('\n[SYS] ⚠ ENTORNO WEB DETECTADO ⚠\nLos navegadores bloquean la ejecución de binarios.\n');
      store.setIsScanning(false);
      return;
    }

    try {
      if (useRustScan) await invoke('run_rustscan', { target, nmapArgs: store.getNmapArgs() });
      else await invoke('run_nmap', { target, args: store.getNmapArgs() });

      setScanDuration(`${((Date.now() - startTime) / 1000).toFixed(2)}s`);
      notifyCompletion();

      const freshState = useScanStore.getState();
      if (freshState.autoScanInterval > 0 && freshState.isScanning) {
        store.appendOutput(`\n[SYS] Esperando ${freshState.autoScanInterval}s para el próximo escaneo...`);
        scanTimeoutRef.current = setTimeout(() => { handleScanRef.current(); }, freshState.autoScanInterval * 1000);
      } else {
        freshState.setIsScanning(false);
      }
    } catch (error) {
      store.appendOutput(`\n[ERR] Error: ${error}`);
      useScanStore.getState().setIsScanning(false);
    }
  }, [target, useRustScan, clearOutput, setScanDuration, notifyCompletion, setIsTerminalOpen]);

  useEffect(() => {
    handleScanRef.current = handleScan;
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
    };
  }, [handleScan]);

  const stopEverything = () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    setField('autoScanInterval', 0);
    useScanStore.getState().cancelScan();
  };

  return (
    <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0 print:hidden z-30 shadow-sm">
      <div className="flex items-center gap-4">
        <h1 className="font-['Poppins'] font-black text-2xl text-[#0b282c] dark:text-teal-400 tracking-wider flex items-center gap-2">
          <span className="bg-[#0b282c] text-white w-8 h-8 rounded-lg flex items-center justify-center text-lg shadow-sm">L</span>
          LESSSO <span className="font-light text-slate-400 text-lg tracking-normal">C2</span>
        </h1>
        <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 mx-1"></div>
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Objetivo (Ej: 10.10.10.1)"
            className="w-48 px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded focus:ring-1 focus:ring-[#0b282c] text-xs font-bold dark:text-white outline-none"
          />
          <div className="flex gap-1">
            <button onClick={() => applyProfile('fast')} title="Fast (-F --top-ports 1000)" className="px-2 py-1 text-[10px] font-bold uppercase bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded hover:bg-[#0b282c]/10 hover:text-[#0b282c] dark:hover:bg-[#0b282c]/50 dark:hover:text-teal-400 transition-colors">Fast</button>
            <button onClick={() => applyProfile('balanced')} title="Normal (-sC -sV)" className="px-2 py-1 text-[10px] font-bold uppercase bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors">Norm</button>
            <button onClick={() => applyProfile('aggressive')} title="Agresivo (-A -p-)" className="px-2 py-1 text-[10px] font-bold uppercase bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded hover:bg-red-50 hover:text-red-600 transition-colors">Agr</button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ExamTimer />

        <label className="flex items-center space-x-1.5 cursor-pointer bg-orange-50 dark:bg-orange-900/20 px-3 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800/50 transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/40">
          <input type="checkbox" checked={useRustScan} onChange={() => setField('useRustScan', !useRustScan)} className="rounded text-orange-500 w-3.5 h-3.5 accent-orange-500" />
          <span className="text-[11px] font-black uppercase text-orange-600 dark:text-orange-400 tracking-wide">⚡ RustScan</span>
        </label>
        {isScanning ? (
          <button onClick={stopEverything} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs px-6 py-2 rounded-lg shadow-lg shadow-red-500/30 active:scale-95 transition-transform flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>DETENER
          </button>
        ) : (
          <button onClick={handleScan} disabled={!target} className="bg-[#0b282c] disabled:bg-slate-400 dark:disabled:bg-slate-700 hover:bg-[#081e21] text-white font-black uppercase text-xs px-6 py-2 rounded-lg shadow-lg shadow-[#0b282c]/30 active:scale-95 disabled:active:scale-100 transition-transform tracking-wider">
            LANZAR AUDITORÍA
          </button>
        )}
        <button onClick={copyMasterConfig} title="Copiar Config JSON" className="text-slate-400 hover:text-[#0b282c] dark:hover:text-teal-400 transition-colors p-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button onClick={toggleTheme} className="text-slate-400 hover:text-[#0b282c] dark:hover:text-teal-400 transition-colors p-2">
          {theme === 'light' ? '🌙' : '☀'}
        </button>
      </div>
    </header>
  );
}
