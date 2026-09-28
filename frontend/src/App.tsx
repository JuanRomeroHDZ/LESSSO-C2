import { useState, useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
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
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 min-h-[500px]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase flex items-center"><span className="mr-2">🔐</span> Bóveda de Credenciales</h2>
        <button onClick={exportVault} className="px-3 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400 text-[10px] font-bold rounded hover:bg-indigo-200">Exportar Txt</button>
      </div>
      
      <div className="flex gap-2 mb-4 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex-wrap">
        <input type="text" value={target} onChange={e=>setTarget(e.target.value)} placeholder="IP/Servicio" className="w-28 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white" />
        <input type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Usuario" className="w-28 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white" />
        <input type="text" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Password / Hash" className="flex-1 min-w-[150px] px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white font-mono" />
        <select value={type} onChange={e=>setType(e.target.value as any)} className="w-20 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white">
          <option value="password">Pass</option><option value="hash">Hash</option><option value="key">Key</option>
        </select>
        <button onClick={handleAdd} className="px-3 py-1 bg-indigo-600 text-white text-[11px] font-bold rounded hover:bg-indigo-500">+</button>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-left text-[11px] text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-100 dark:bg-slate-800 uppercase font-bold text-[9px] text-slate-500">
            <tr><th className="p-2.5">Target</th><th className="p-2.5">User</th><th className="p-2.5">Secret</th><th className="p-2.5">Tipo</th><th className="p-2.5 w-10"></th></tr>
          </thead>
          <tbody>
            {vaultCredentials.map(c => (
              <tr key={c.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="p-2.5 font-bold">{c.target}</td><td className="p-2.5">{c.username || '-'}</td>
                <td className="p-2.5 font-mono text-emerald-600 dark:text-emerald-400 break-all">{c.secret}</td>
                <td className="p-2.5 uppercase text-[9px] font-bold">{c.type}</td>
                <td className="p-2.5 text-center"><button onClick={() => removeVaultCred(c.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1 rounded">✕</button></td>
              </tr>
            ))}
            {vaultCredentials.length === 0 && <tr><td colSpan={5} className="p-5 text-center text-slate-400 italic">Bóveda vacía. Registra tus hallazgos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function App() {
  const [activeTool, setActiveTool] = useState<'nmap' | 'netcat' | 'payloads' | 'decoders'>('nmap')
  const [activeWorkspace, setActiveWorkspace] = useState<'dashboard' | 'topology' | 'vault' | 'notes' | 'whiteboard'>('dashboard')
  
  const { setParsedData, appendOutput, theme, toggleTheme, zenMode, toggleZenMode, vpnIp, connectVpn, disconnectVpn, checkVpnStatus, volume, setVolume } = useScanStore()

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
        setActiveWorkspace('dashboard');
        
        useScanStore.getState().syncWithBackend(
          useScanStore.getState().target,
          useScanStore.getState().scanDuration,
          result.hosts || []
        );
      } catch (err) { appendOutput(`\n[SISTEMA] Error estructurando datos: ${err}`); }
    })
    return () => { unlistenData.then(f => f()) }
  }, [setParsedData, appendOutput])

  return (
    <div className={`${theme} flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-sans transition-colors duration-200 print:bg-white print:text-black`}>
      
      {!zenMode && (
        <aside className="w-14 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-3 z-20 print:hidden">
          <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black text-lg mb-5 shadow-sm shadow-indigo-500/30">J</div>
          <div className="flex flex-col space-y-3 w-full px-1.5">
            <button onClick={() => setActiveTool('nmap')} title="Nmap Scanner" className={`w-full aspect-square rounded-lg flex flex-col items-center justify-center transition-all ${activeTool === 'nmap' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><span className="text-lg">💻</span><span className="text-[7px] font-bold mt-0.5">NMAP</span></button>
            <button onClick={() => setActiveTool('netcat')} title="Netcat GUI" className={`w-full aspect-square rounded-lg flex flex-col items-center justify-center transition-all ${activeTool === 'netcat' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><span className="text-lg">🔌</span><span className="text-[7px] font-bold mt-0.5">NC</span></button>
            <button onClick={() => setActiveTool('payloads')} title="Generadores CLI" className={`w-full aspect-square rounded-lg flex flex-col items-center justify-center transition-all ${activeTool === 'payloads' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><span className="text-lg">🔥</span><span className="text-[7px] font-bold mt-0.5">PAYLOAD</span></button>
            <button onClick={() => setActiveTool('decoders')} title="Decoders & Hashes" className={`w-full aspect-square rounded-lg flex flex-col items-center justify-center transition-all ${activeTool === 'decoders' ? 'bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-900/50 dark:text-fuchsia-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><span className="text-lg">🗝️</span><span className="text-[7px] font-bold mt-0.5">HASH</span></button>
          </div>
          <div className="mt-auto">
            <button onClick={toggleTheme} className="p-2 text-slate-400 hover:text-indigo-500 transition-colors text-sm">{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
        </aside>
      )}

      {!zenMode && (
        <section className="w-[300px] shrink-0 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col z-10 print:hidden">
          <header className="h-10 border-b border-slate-200 dark:border-slate-800 flex items-center px-3 bg-white dark:bg-slate-900 shrink-0">
             <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
               {activeTool === 'nmap' ? 'Auditoría Nmap' : activeTool === 'netcat' ? 'Escucha & Conexión' : activeTool === 'payloads' ? 'Armamento Local' : 'Criptografía Lite'}
             </h2>
          </header>
          <div className="flex-1 overflow-hidden p-2.5">
             <div className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                {activeTool === 'nmap' && <ScanConfig />}
                {activeTool === 'netcat' && <NetcatTool />}
                {activeTool === 'payloads' && <PayloadsTool />}
                {activeTool === 'decoders' && <DecodersTool />}
             </div>
          </div>
        </section>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950 print:bg-white print:overflow-visible print:h-auto">
        
        <header className="h-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-end px-3 gap-0.5 shrink-0 overflow-x-auto custom-scrollbar justify-between print:hidden">
          
          <div className="flex items-end gap-0.5">
            <button onClick={toggleZenMode} className="mb-1.5 mr-2 p-1 text-slate-400 hover:text-indigo-500"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg></button>
            
            {/* NUEVO SLIDER DE VOLUMEN */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2 py-1 h-7 mb-1.5 mr-2 hidden sm:flex">
              <span className="text-[10px] mr-1.5">{volume === 0 ? '🔇' : '🔊'}</span>
              <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-16 h-1 accent-indigo-500 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer" />
            </div>
            
            <button onClick={() => setActiveWorkspace('dashboard')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-t-md transition-colors border border-b-0 ${activeWorkspace === 'dashboard' ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>📊 Score/Reporte</button>
            <button onClick={() => setActiveWorkspace('topology')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-t-md transition-colors border border-b-0 ${activeWorkspace === 'topology' ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>🕸️ Topología</button>
            <button onClick={() => setActiveWorkspace('vault')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-t-md transition-colors border border-b-0 ${activeWorkspace === 'vault' ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>🔐 Bóveda</button>
            <button onClick={() => setActiveWorkspace('notes')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-t-md transition-colors border border-b-0 ${activeWorkspace === 'notes' ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>📝 Bitácora</button>
            <button onClick={() => setActiveWorkspace('whiteboard')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-t-md transition-colors border border-b-0 ${activeWorkspace === 'whiteboard' ? 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>🎨 Pizarra</button>
          </div>

          <div className="mb-1.5 flex items-center">
            {/* BOTÓN MÓDULO VPN HTB - AHORA PUEDE DESCONECTAR */}
            <button onClick={vpnIp ? disconnectVpn : connectVpn} title={vpnIp ? "Haz clic para desconectar" : "Conectar a HackTheBox VPN"} className={`px-2 py-1 rounded border text-[9px] font-bold flex items-center gap-1.5 transition-colors ${vpnIp ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700/50 hover:bg-red-100 hover:text-red-600 hover:border-red-300' : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50 hover:bg-red-100'}`}>
              <span className={`w-2 h-2 rounded-full ${vpnIp ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
              {vpnIp ? `HTB: ${vpnIp} (✖)` : 'VPN OFFLINE'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar flex flex-col print:overflow-visible print:h-auto">
          {activeWorkspace === 'dashboard' && (
            <div className="flex flex-col xl:flex-row gap-4 h-full print:block print:h-auto">
              <div className="flex-1 min-w-0 bg-transparent print:w-full"><DashboardPanel /></div>
              <div className="w-full xl:w-[350px] shrink-0 h-[500px] xl:h-full bg-transparent print:hidden"><TerminalPanel /></div>
            </div>
          )}
          {activeWorkspace === 'topology' && <TopologyPanel />}
          {activeWorkspace === 'vault' && <VaultWorkspace />}
          {activeWorkspace === 'notes' && <NotesPanel />}
          {activeWorkspace === 'whiteboard' && <WhiteboardPanel />}
        </div>
      </main>
    </div>
  )
}
