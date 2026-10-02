import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useScanStoreLocal } from '../../core/store/scanStore';
import { useUiStore } from '../../core/store/uiStore';
import { Play, Square, Copy, Moon, Sun, Zap, Crosshair, Volume2 } from 'lucide-react';
import { ExamTimer } from './ExamTimer';

export function Header() {
  const {
    target, setTarget, applyProfile, useRustScan, setField, copyMasterConfig,
    isScanning, clearOutput, setScanDuration, notifyCompletion,
    cancelScan, appendOutput, getNmapArgs
  } = useScanStoreLocal();
  
  const { theme, toggleTheme, setIsTerminalOpen, volume, setVolume } = useUiStore();

  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleScanRef = useRef<() => Promise<void>>(async () => {});

  const handleScan = useCallback(async () => {
    if (!target) return;
    setIsTerminalOpen(true);
    setField('isScanning', true);
    clearOutput();
    const startTime = Date.now();

    if (useRustScan) appendOutput('>>> Inicializando RUSTSCAN (Modo Ultra Rápido)...\n');
    else appendOutput('>>> Inicializando Motor de Auditoría LESSSO C2 (NMAP)...\n');

    if (!('__TAURI_INTERNALS__' in window)) {
      appendOutput('\n[SYS] ⚠ ENTORNO WEB DETECTADO ⚠\nLos navegadores bloquean la ejecución de binarios.\n');
      setField('isScanning', false);
      return;
    }

    try {
      if (useRustScan) await invoke('run_rustscan', { target, nmapArgs: getNmapArgs() });
      else await invoke('run_nmap', { target, args: getNmapArgs() });

      setScanDuration(`${((Date.now() - startTime) / 1000).toFixed(2)}s`);
      notifyCompletion();

      const currentInterval = useScanStoreLocal.getState().autoScanInterval;
      if (currentInterval > 0 && useScanStoreLocal.getState().isScanning) {
        appendOutput(`\n[SYS] Esperando ${currentInterval}s para el próximo escaneo...`);
        scanTimeoutRef.current = setTimeout(() => { handleScanRef.current(); }, currentInterval * 1000);
      } else {
        setField('isScanning', false);
      }
    } catch (error) {
      appendOutput(`\n[ERR] Error: ${error}`);
      setField('isScanning', false);
    }
  }, [target, useRustScan, clearOutput, setScanDuration, notifyCompletion, setIsTerminalOpen, setField, appendOutput, getNmapArgs]);

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
    cancelScan();
  };

  return (
    <header className="min-h-[56px] py-2 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#020617] flex flex-wrap items-center justify-between gap-y-3 gap-x-4 px-4 shrink-0 print:hidden z-30 shadow-sm">
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <h1 className="font-['Poppins'] font-black text-xl text-[#0b282c] dark:text-white tracking-wider flex items-center gap-2 shrink-0">
          <div className="bg-[#0b282c] dark:bg-teal-500 text-white dark:text-slate-950 w-7 h-7 rounded-md flex items-center justify-center text-sm shadow-sm">
            <Crosshair size={16} strokeWidth={3} />
          </div>
          LESSSO <span className="font-light text-slate-400 dark:text-slate-500 tracking-normal">C2</span>
        </h1>
        
        <div className="flex items-center bg-slate-100 dark:bg-[#0f172a] rounded-md border border-slate-200 dark:border-slate-800 p-1">
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target (Ej: 10.10.10.1)"
            className="w-40 sm:w-48 px-3 py-1 bg-transparent text-sm font-mono font-medium dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600"
          />
          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-2 shrink-0"></div>
          <div className="flex gap-1 pr-1 shrink-0">
            <button onClick={() => applyProfile('fast')} title="Fast (-F)" className="px-2 sm:px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors">Fast</button>
            <button onClick={() => applyProfile('balanced')} title="Normal (-sC -sV)" className="px-2 sm:px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors">Norm</button>
            <button onClick={() => applyProfile('aggressive')} title="Agresivo (-A -p-)" className="px-2 sm:px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase rounded hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors">Agr</button>
          </div>
        </div>

        <div className="shrink-0"><ExamTimer /></div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-md border border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors shrink-0">
          <input type="checkbox" checked={useRustScan} onChange={() => setField('useRustScan', !useRustScan)} className="rounded text-amber-500 w-3.5 h-3.5 accent-amber-500" />
          <span className="text-[11px] font-bold uppercase text-amber-700 dark:text-amber-500 flex items-center gap-1">
            <Zap size={12} className={useRustScan ? "fill-amber-500" : ""} /> RustScan
          </span>
        </label>

        {isScanning ? (
          <button onClick={stopEverything} className="flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-bold uppercase text-xs px-5 py-1.5 rounded-md active:scale-95 transition-all shrink-0">
            <Square size={14} className="fill-current" /> Detener
          </button>
        ) : (
          <button onClick={handleScan} disabled={!target} className="flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 disabled:opacity-50 font-bold uppercase text-xs px-5 py-1.5 rounded-md shadow-sm active:scale-95 transition-all shrink-0">
            <Play size={14} className="fill-current" /> Lanzar
          </button>
        )}

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1 shrink-0 hidden sm:block"></div>

        <div className="flex items-center gap-2 px-2 shrink-0" title="Volumen Notificación Escaneo">
          <Volume2 size={14} className="text-slate-400" />
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={volume}
            onChange={(e) => setVolume?.(parseFloat(e.target.value))}
            className="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={copyMasterConfig} title="Copiar Config" className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
            <Copy size={16} />
          </button>
          <button onClick={toggleTheme} className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}
