import { useState, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { ScanConfig } from './features/scanner/ScanConfig'
import { TerminalPanel } from './features/scanner/TerminalPanel'
import { DashboardPanel } from './features/dashboard/DashboardPanel'
import { TopologyPanel } from './features/topology/TopologyPanel'
import { NotesPanel } from './features/redteam/NotesPanel'
import { WhiteboardPanel } from './features/redteam/WhiteboardPanel'
import { NetcatTool, PayloadsTool, DecodersTool } from './features/toolbox/ToolboxPanel'
import { useScanStore } from './core/store/useScanStore'

function VaultWorkspace() {
  const { vaultCredentials, addVaultCred, removeVaultCred } = useScanStore();
  const [target, setTarget] = useState('');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [type, setType] = useState<'hash' | 'password' | 'key'>('password');
  const [notes, setNotes] = useState('');

  const handleAdd = () => {
    if(target && secret) {
      addVaultCred({ target, username, secret, type, notes });
      setUsername(''); setSecret(''); setNotes('');
    }
  }

  const exportVault = () => {
    const txt = vaultCredentials.map(c => `${c.target} | ${c.type.toUpperCase()} | ${c.username || 'N/A'} : ${c.secret}`).join('\n');
    navigator.clipboard.writeText(txt);
    alert('Credenciales copiadas al portapapeles.');
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase flex items-center"><span className="mr-2">🔐</span> Bóveda</h2>
        <button onClick={exportVault} className="px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 text-[9px] font-bold rounded hover:bg-indigo-200">Exportar Txt</button>
      </div>
      
      <div className="flex flex-col gap-2 mb-4 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex gap-2">
           <input type="text" value={target} onChange={e=>setTarget(e.target.value)} placeholder="IP/Servicio" className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white" />
           <select value={type} onChange={e=>setType(e.target.value as any)} className="w-20 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white">
             <option value="password">Pass</option><option value="hash">Hash</option><option value="key">Key</option>
           </select>
        </div>
        <input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Usuario" className="w-full px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white" />
        <div className="flex gap-2">
           <input type="text" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Password / Hash" className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white font-mono" />
           <button onClick={handleAdd} className="px-3 py-1 bg-indigo-600 text-white text-[11px] font-bold rounded hover:bg-indigo-500">+</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-left text-[11px] text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-100 dark:bg-slate-800 uppercase font-bold text-[9px] text-slate-500">
            <tr><th className="p-2">Data</th><th className="p-2 w-8"></th></tr>
          </thead>
          <tbody>
            {vaultCredentials.map(c => (
              <tr key={c.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="p-2">
                   <div className="font-bold">{c.target} <span className="text-[8px] font-normal uppercase bg-slate-200 dark:bg-slate-700 px-1 rounded ml-1">{c.type}</span></div>
                   <div className="text-slate-500">User: {c.username || '-'}</div>
                   <div className="font-mono text-emerald-600 dark:text-emerald-400 break-all bg-emerald-50 dark:bg-emerald-900/10 p-1 mt-1 rounded">{c.secret}</div>
                </td>
                <td className="p-2 text-center align-middle"><button onClick={() => removeVaultCred(c.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1 rounded">✕</button></td>
              </tr>
            ))}
            {vaultCredentials.length === 0 && <tr><td colSpan={2} className="p-5 text-center text-slate-400 italic">Bóveda vacía.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<'recon' | 'topo' | 'arsenal' | 'cerebro'>('recon')
  const [cerebroTab, setCerebroTab] = useState<'notes' | 'whiteboard'>('notes')
  const [isTerminalOpen, setIsTerminalOpen] = useState(false)
  
  const { 
    target, setTarget, applyProfile, useRustScan, setField, copyMasterConfig, 
    setParsedData, appendOutput, theme, toggleTheme, vpnIp, connectVpn, disconnectVpn, checkVpnStatus, volume, setVolume, soundEnabled, toggleSound,
    isScanning, clearOutput, getNmapArgs, setScanDuration, notifyCompletion, autoScanInterval, cancelScan
  } = useScanStore()

  const scanTimeoutRef = useRef<any>(null);

  useEffect(() => {
    checkVpnStatus();
    const vpnInterval = setInterval(checkVpnStatus, 5000);
    return () => clearInterval(vpnInterval);
  }, [checkVpnStatus]);

  useEffect(() => {
    const unlistenData = listen<string>('nmap-structured-data', (event) => {
      try {
        const result = JSON.parse(event.payload);
        setParsedData(result.hosts || []);
        setActiveWorkspace('recon');
        useScanStore.getState().syncWithBackend(useScanStore.getState().target, useScanStore.getState().scanDuration, result.hosts || []);
      } catch (err) { appendOutput(`\n[SISTEMA] Error estructurando datos: ${err}`); }
    })
    return () => { unlistenData.then(f => f()) }
  }, [setParsedData, appendOutput])

  const handleScan = async () => {
    if (!target) return;
    setIsTerminalOpen(true);
    useScanStore.getState().setIsScanning(true); 
    clearOutput(); 
    const startTime = Date.now();
    
    if (useRustScan) appendOutput('>>> Inicializando RUSTSCAN (Modo Ultra Rápido)...\n');
    else appendOutput('>>> Inicializando Motor de Auditoría LESSSO C2 (NMAP)...\n');

    if (!('__TAURI_INTERNALS__' in window)) {
       appendOutput('\n[SISTEMA] ⚠️ ENTORNO WEB DETECTADO ⚠️\nLos navegadores bloquean la ejecución de binarios.\n');
       useScanStore.getState().setIsScanning(false); return;
    }
    try {  
      if (useRustScan) await invoke('run_rustscan', { target, nmapArgs: getNmapArgs() });
      else await invoke('run_nmap', { target, args: getNmapArgs() });  

      setScanDuration(`${((Date.now() - startTime) / 1000).toFixed(2)}s`);  
      notifyCompletion();
      const freshState = useScanStore.getState();
      if (freshState.autoScanInterval > 0 && freshState.isScanning) {
        appendOutput(`\n[MONITOR] Esperando ${freshState.autoScanInterval}s para el próximo escaneo...`);
        scanTimeoutRef.current = setTimeout(handleScan, freshState.autoScanInterval * 1000);
      } else { useScanStore.getState().setIsScanning(false); }
    } catch (error) {  
      appendOutput(`\n[ERROR DE SISTEMA]: ${error}`); useScanStore.getState().setIsScanning(false);  
    }
  }

  const stopEverything = () => {  
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);  
    setField('autoScanInterval', 0); cancelScan();  
  }

  return (
    <div className={`${theme} flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-sans transition-colors duration-200 print:bg-white print:text-black`}>
      
      {/* BARRA SUPERIOR GLOBAL (HEADER DE COMANDO) */}
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0 print:hidden z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="font-['Poppins'] font-black text-2xl text-indigo-600 dark:text-indigo-400 tracking-wider flex items-center gap-2">
            <span className="bg-indigo-600 text-white w-8 h-8 rounded-lg flex items-center justify-center text-lg">L</span>
            LESSSO <span className="font-light text-slate-400 text-lg tracking-normal">C2</span>
          </h1>
          <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 mx-1"></div>
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <input type="text" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Objetivo (Ej: 10.10.10.1)" className="w-48 px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded focus:ring-1 focus:ring-indigo-500 text-xs font-bold dark:text-white outline-none" />
            <div className="flex gap-1">
              <button onClick={() => applyProfile('fast')} title="Fast (-F)" className="px-2 py-1 text-[10px] font-bold uppercase bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded hover:bg-fuchsia-50 hover:text-fuchsia-600 transition-colors">Fast</button>
              <button onClick={() => applyProfile('balanced')} title="Normal (-sC -sV)" className="px-2 py-1 text-[10px] font-bold uppercase bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors">Norm</button>
              <button onClick={() => applyProfile('aggressive')} title="Agresivo (-A -p-)" className="px-2 py-1 text-[10px] font-bold uppercase bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded hover:bg-red-50 hover:text-red-600 transition-colors">Agr</button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <label className="flex items-center space-x-1.5 cursor-pointer bg-orange-50 dark:bg-orange-900/20 px-3 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800/50 transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/40">
             <input type="checkbox" checked={useRustScan} onChange={() => setField('useRustScan', !useRustScan)} className="rounded text-orange-500 w-3.5 h-3.5 accent-orange-500" />
             <span className="text-[11px] font-black uppercase text-orange-600 dark:text-orange-400 tracking-wide">⚡ RustScan</span>
           </label>
           
           {isScanning ? (
             <button onClick={stopEverything} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs px-6 py-2 rounded-lg shadow-lg shadow-red-500/30 active:scale-95 transition-transform flex items-center gap-2"><span className="w-2 h-2 bg-white rounded-full animate-ping"></span>DETENER</button>
           ) : (
             <button onClick={handleScan} disabled={!target} className="bg-indigo-600 disabled:bg-slate-400 dark:disabled:bg-slate-700 hover:bg-indigo-700 text-white font-black uppercase text-xs px-6 py-2 rounded-lg shadow-lg shadow-indigo-500/30 active:scale-95 disabled:active:scale-100 transition-transform tracking-wider">LANZAR AUDITORÍA</button>
           )}
           <button onClick={copyMasterConfig} title="Copiar Config JSON" className="text-slate-400 hover:text-indigo-500 transition-colors p-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
           <button onClick={toggleTheme} className="text-slate-400 hover:text-indigo-500 transition-colors p-2">{theme === 'light' ? '🌙' : '☀️'}</button>
        </div>
      </header>

      {/* ÁREA CENTRAL (SIDEBAR + MAIN + TERMINAL) */}
      <div className="flex flex-1 overflow-hidden min-h-0 relative print:h-auto print:overflow-visible">
        
        {/* SIDEBAR OPERATIVA IZQUIERDA */}
        <aside className="w-16 shrink-0 bg-slate-100 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 z-20 print:hidden gap-4">
            <button onClick={() => setActiveWorkspace('recon')} title="Reconocimiento (Nmap/Dashboard)" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'recon' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">📊</span></button>
            <button onClick={() => setActiveWorkspace('topo')} title="Topología de Red" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'topo' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">🕸️</span></button>
            <button onClick={() => setActiveWorkspace('arsenal')} title="Arsenal (Netcat, Payloads, Hashes)" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'arsenal' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">🧰</span></button>
            <button onClick={() => setActiveWorkspace('cerebro')} title="Cerebro (Bóveda y Bitácora)" className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all ${activeWorkspace === 'cerebro' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'}`}><span className="text-xl">🧠</span></button>
        </aside>

        {/* WORKSPACES DINÁMICOS */}
        <main className="flex-1 flex flex-col min-w-0 print:h-auto print:overflow-visible">
            
            {/* 1. RECONOCIMIENTO */}
            {activeWorkspace === 'recon' && (
              <div className="flex flex-1 overflow-hidden print:block print:overflow-visible">
                <div className="w-[320px] border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-y-auto shrink-0 print:hidden"><ScanConfig /></div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50 dark:bg-slate-950 print:p-0"><DashboardPanel /></div>
              </div>
            )}

            {/* 2. TOPOLOGÍA */}
            {activeWorkspace === 'topo' && <div className="flex-1 p-4"><TopologyPanel /></div>}

            {/* 3. ARSENAL (Toolbox + Bash) */}
            {activeWorkspace === 'arsenal' && (
              <div className="flex flex-1 overflow-hidden">
                <div className="w-[320px] border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 overflow-y-auto flex flex-col shrink-0">
                   <div className="h-1/2 overflow-y-auto border-b border-slate-200 dark:border-slate-800"><PayloadsTool /></div>
                   <div className="h-1/2 overflow-y-auto"><DecodersTool /></div>
                </div>
                <div className="flex-1 bg-slate-950 p-2"><NetcatTool /></div>
              </div>
            )}

            {/* 4. CEREBRO (Vault + Notes) */}
            {activeWorkspace === 'cerebro' && (
              <div className="flex flex-1 overflow-hidden">
                <div className="w-[350px] shrink-0 overflow-y-auto bg-slate-50 dark:bg-slate-950"><VaultWorkspace /></div>
                <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
                   <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 pt-3 gap-2 shrink-0 bg-slate-50 dark:bg-slate-950">
                     <button onClick={() => setCerebroTab('notes')} className={`px-4 py-2 text-xs font-bold uppercase rounded-t-lg transition-colors border border-b-0 ${cerebroTab === 'notes' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border-slate-200 dark:border-slate-800 relative top-[1px]' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>📝 Bitácora</button>
                     <button onClick={() => setCerebroTab('whiteboard')} className={`px-4 py-2 text-xs font-bold uppercase rounded-t-lg transition-colors border border-b-0 ${cerebroTab === 'whiteboard' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 border-slate-200 dark:border-slate-800 relative top-[1px]' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>🎨 Pizarra Gráfica</button>
                   </div>
                   <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                     {cerebroTab === 'notes' ? <NotesPanel /> : <WhiteboardPanel />}
                   </div>
                </div>
              </div>
            )}

            {/* PANEL INFERIOR COLAPSABLE: TERMINAL DE LOGS (Solo en Recon y Topo) */}
            {(activeWorkspace === 'recon' || activeWorkspace === 'topo') && (
              <div className={`border-t border-slate-300 dark:border-slate-700 bg-[#0b1120] transition-all duration-300 shrink-0 print:hidden ${isTerminalOpen ? 'h-[30vh]' : 'h-0 hidden'}`}>
                <TerminalPanel />
              </div>
            )}
        </main>
      </div>

      {/* STATUS BAR INFERIOR ESTILO VS CODE */}
      <footer className="h-7 bg-indigo-700 text-white flex items-center justify-between px-3 text-[10px] font-bold shrink-0 print:hidden z-50">
        <div className="flex items-center gap-4">
           <span className="flex items-center gap-1.5" title="Sistema Operativo Nativamente Integrado"><div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div> LESSSO C2 READY</span>
           <div className="w-px h-4 bg-indigo-500"></div>
           <button onClick={() => setIsTerminalOpen(!isTerminalOpen)} className="hover:text-indigo-200 transition-colors flex items-center gap-1 cursor-pointer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 17l6-6-6-6M12 19h8"></path></svg> 
              TERMINAL NMAP {isTerminalOpen ? '▼' : '▲'}
           </button>
        </div>
        
        <div className="flex items-center gap-4">
           <span className="flex items-center gap-1 text-indigo-200" title="Todo el estado de la app se guarda en disco local al instante.">💾 AUTO-GUARDADO ON</span>
           
           <div className="flex items-center gap-1.5 bg-indigo-800 px-2 py-0.5 rounded" title="Ajustar Volumen de Alertas">
              <button onClick={toggleSound} className="hover:scale-110 transition-transform">{soundEnabled ? '🔊' : '🔇'}</button>
              <input type="range" min="0" max="100" step="1" value={volume} onChange={(e) => setVolume(parseInt(e.target.value))} className="w-16 h-1 accent-white appearance-none bg-indigo-600 rounded-lg cursor-pointer" />
           </div>

           <button onClick={vpnIp ? disconnectVpn : connectVpn} className={`px-2 py-0.5 rounded flex items-center gap-1.5 transition-colors ${vpnIp ? 'bg-emerald-500 hover:bg-red-500' : 'bg-red-500 hover:bg-red-400'}`} title={vpnIp ? "Clic para Desconectar de la red de HTB" : "Clic para Conectar usando archivo .ovpn"}>
              <span className={`w-1.5 h-1.5 rounded-full ${vpnIp ? 'bg-white animate-pulse' : 'bg-white'}`}></span>
              {vpnIp ? `HTB: ${vpnIp} (DISCONNECT)` : 'VPN OFFLINE (CONNECT)'}
           </button>
        </div>
      </footer>
    </div>
  )
}
