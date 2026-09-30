import { useEffect, useRef, useState, useCallback } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useScanStore } from '../../core/store/useScanStore'
import '@xterm/xterm/css/xterm.css'

// ==========================================
// 1. COMPONENTE: COLORIZADOR DEL ESCÁNER NMAP
// ==========================================
const ColorizeLine = ({ line }: { line: string }) => {
  const cleanLine = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
  if (!cleanLine || cleanLine.startsWith('Stats:') || cleanLine.includes('.~-') || cleanLine.includes('| {}') || cleanLine.includes('`-\'')) return null;
  if (cleanLine.includes('Discovered open port')) return <span className="text-emerald-400 font-semibold">{cleanLine}</span>;
  if (cleanLine.startsWith('Initiating') || cleanLine.startsWith('Completed') || cleanLine.includes('Open')) return <span className="text-indigo-400 italic">{cleanLine}</span>;
  if (cleanLine.startsWith('NSE:')) return <span className="text-fuchsia-400">{cleanLine}</span>;
  if (cleanLine.includes('Warning:') || cleanLine.includes('QUITTING') || cleanLine.includes('ERROR:')) return <span className="text-red-500 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('Nmap scan report for')) return <span className="text-sky-300 font-bold mt-3 block border-t border-slate-700/50 pt-2">{cleanLine}</span>;

  if (cleanLine.match(/^\d+\/(tcp|udp|sctp)/)) {
    const parts = cleanLine.split(/(\s+)/);
    return (
      <span>
        {parts.map((part, i) => {
          if (part.match(/^\d+\/(tcp|udp|sctp)/)) return <span key={i} className="text-sky-400 font-bold">{part}</span>;
          if (part === 'open') return <span key={i} className="text-emerald-400 font-bold">{part}</span>;
          if (part === 'closed' || part === 'filtered') return <span key={i} className="text-orange-400">{part}</span>;
          if (i === 4 && part.trim() !== '') return <span key={i} className="text-pink-400">{part}</span>;
          return <span key={i} className="text-slate-400">{part}</span>;
        })}
      </span>
    );
  }
  const parts = cleanLine.split(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\d+\.\d+%|\d+:\d+:\d+)/g);
  return (
    <span className="text-slate-300 block">
      {parts.map((part, i) => {
        if (part.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)) return <span key={i} className="text-blue-400 font-medium">{part}</span>;
        if (part.match(/\d+\.\d+%/)) return <span key={i} className="text-yellow-400 font-bold">{part}</span>;
        if (part.match(/\d+:\d+:\d+/)) return <span key={i} className="text-purple-400">{part}</span>;
        return part;
      })}
    </span>
  );
}

// ==========================================
// 2. COMPONENTE: PESTAÑA BASH INDEPENDIENTE
// ==========================================
function BashTabInstance({ sessionId, isActive, onRemove, autoLog }: { sessionId: string, isActive: boolean, onRemove: (id: string) => void, autoLog: boolean }) {
    const termRef = useRef<HTMLDivElement>(null);
    const terminalInstance = useRef<Terminal | null>(null);
    const unlistenFuncs = useRef<UnlistenFn[]>([]);
    const sessionLog = useRef<string[]>([]);

    const killAndClose = useCallback(async () => {
      await invoke('kill_terminal', { sessionId });

      // AUTO-LOGGING DE EVIDENCIA BASH
      if (autoLog && sessionLog.current.length > 0) {
          const blob = new Blob([sessionLog.current.join('\n')], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `lessso_bash_evidencia_${sessionId}.log`; a.click();
      }
      onRemove(sessionId);
    }, [sessionId, autoLog, onRemove]);

    useEffect(() => {
      let isMounted = true;
      const initTerminal = async () => {
        if (!termRef.current) return;
        const term = new Terminal({ theme: { background: '#0b1120', foreground: '#34d399', cursor: '#34d399' }, fontSize: 13, fontFamily: 'monospace', cursorBlink: true });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(termRef.current);
        fitAddon.fit();
        terminalInstance.current = term;

        term.writeln(`\x1b[1;36m[*] LESSSO C2 - Terminal Activa (ID: ${sessionId.slice(-4)})\x1b[0m`);

        const unlistenOut = await listen<string>(`term-output-${sessionId}`, (e) => {
          if (!isMounted) return;
          sessionLog.current.push(e.payload);
          term.write(e.payload.replace(/\n/g, '\r\n'));
        });

        const unlistenExit = await listen(`term-exit-${sessionId}`, () => {
          if (!isMounted) return;
          term.writeln('\r\n\x1b[1;33m[*] Proceso finalizado.\x1b[0m');
        });

        unlistenFuncs.current.push(unlistenOut, unlistenExit);
        term.onData(data => { invoke('write_terminal', { sessionId, data }).catch(() => {}); });

        try {
          await invoke('start_terminal', { sessionId, cmd: '/bin/bash', args: ['-i'] });
        } catch (err) {
          term.writeln(`\r\n\x1b[1;31m[!] Error del Sistema: ${err}\x1b[0m`);
        }

        const resizeHandler = () => fitAddon.fit();
        window.addEventListener('resize', resizeHandler);
        unlistenFuncs.current.push(() => window.removeEventListener('resize', resizeHandler));
      };

      initTerminal();
      return () => {
        isMounted = false;
        unlistenFuncs.current.forEach(f => f());
        invoke('kill_terminal', { sessionId }).catch(()=>{});
      };
    }, [sessionId]);

    return (
      <div className={`flex-1 flex-col h-full ${isActive ? 'flex' : 'hidden'}`}>
        <div className="bg-slate-800 border-b border-slate-700 flex justify-between p-1.5 shrink-0 items-center">
            <div className="flex gap-2">
                <button
                  onClick={() => invoke('send_terminal_signal', { sessionId, signalName: 'SIGINT' })}
                  className="bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm transition-colors border border-red-500/30"
                  title="Interrumpir proceso actual (SIGINT al process group)"
                >
                  Ctrl+C (Kill)
                </button>
                <button
                  onClick={() => invoke('send_terminal_signal', { sessionId, signalName: 'SIGTSTP' })}
                  className="bg-orange-900/50 hover:bg-orange-600 text-orange-200 hover:text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm transition-colors border border-orange-500/30"
                  title="Pausar proceso (SIGTSTP al process group)"
                >
                  Ctrl+Z (Bg)
                </button>
            </div>
            <button onClick={killAndClose} className="text-[10px] font-bold uppercase text-slate-400 hover:text-red-400 pr-2">Cerrar Sesión ✕</button>
        </div>
        <div ref={termRef} className="flex-1 w-full h-full p-2 bg-[#0b1120] overflow-hidden" />
      </div>
    )
}

// ==========================================
// 3. COMPONENTE PRINCIPAL: TERMINAL PANEL
// ==========================================
export function TerminalPanel() {
  const { output, appendOutput, setIsScanning, commandString, progressText, setProgressText, isScanning, clearOutput } = useScanStore()
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [autoScroll, setAutoScroll] = useState(true)
  const [searchGrep, setSearchGrep] = useState('')
  const [copied, setCopied] = useState(false)

  const [activeTab, setActiveTab] = useState<'scanner' | string>('scanner');
  const [bashTabs, setBashTabs] = useState<{id: string, name: string}[]>([]);
  const [autoLogEnabled, setAutoLogEnabled] = useState(false);

  useEffect(() => {
     if (!isScanning && output.length > 0 && autoLogEnabled) {
         exportRawLog(true);
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  const addBashTab = () => {
      const id = Date.now().toString();
      const newTabName = `Terminal ${bashTabs.length + 1}`;
      setBashTabs([...bashTabs, { id, name: newTabName }]);
      setActiveTab(id);
  }

  const removeBashTab = (idToRemove: string) => {
      setBashTabs(bashTabs.filter(t => t.id !== idToRemove));
      if (activeTab === idToRemove) setActiveTab('scanner');
  }

  const exportRawLog = (isSilent: boolean = false) => {
    if (output.length === 0) return;
    const blob = new Blob([output.join('\n')], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `lessso_nmap_evidencia_${Date.now()}.log`; a.click();
    if(!isSilent) alert("Log exportado correctamente a tu carpeta de Descargas.");
  }

  const copyCommand = () => {
    navigator.clipboard.writeText(commandString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => { if (autoScroll && activeTab === 'scanner') terminalEndRef.current?.scrollIntoView({ behavior: 'auto' }) }, [output.length, autoScroll, activeTab])

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  }

  useEffect(() => {
    const unlistenOutput = listen<string>('nmap-output', (event) => {
      const line = event.payload;
      if (line.startsWith('Stats:')) {
        const percentageMatch = line.match(/(\d+\.\d+)% done/);
        const etaMatch = line.match(/(\d+:\d+:\d+) remaining/);
        if (percentageMatch && etaMatch) setProgressText(`${percentageMatch[1]}% Completado | ETA: ${etaMatch[1]}`);
      } else {
        if (line.trim().length > 2) appendOutput(line);
      }
    })

    const unlistenFinished = listen<string>('nmap-finished', (event) => {
      appendOutput(`\n${event.payload}`);
      setIsScanning(false);
      setProgressText('Auditoría Finalizada');
    })

    return () => { unlistenOutput.then(f => f()); unlistenFinished.then(f => f()); }
  }, [appendOutput, setIsScanning, setProgressText])

  const filteredOutput = searchGrep ? output.filter(line => line.toLowerCase().includes(searchGrep.toLowerCase())) : output;

  return (
    <section className="flex flex-col h-full min-h-0 bg-[#0b1120] relative border-t-2 border-[#144249]">
        {/* BARRA DE PESTAÑAS Y CONTROLES GENERALES */}
        <div className="bg-slate-950 flex justify-between items-center pr-2 shrink-0 shadow-md relative z-10">

           <div className="flex overflow-x-auto custom-scrollbar">
              <button onClick={() => setActiveTab('scanner')} className={`px-4 py-2 text-[10px] font-bold uppercase transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'scanner' ? 'bg-[#0b1120] text-emerald-400 border-t-2 border-emerald-500' : 'text-slate-500 hover:bg-slate-900 border-t-2 border-transparent'}`}>
                 <span className={`h-2 w-2 rounded-full ${isScanning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span> SCANNER NMAP
              </button>

              {bashTabs.map(tab => (
                 <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 text-[10px] font-bold uppercase transition-colors whitespace-nowrap flex items-center gap-2 border-r border-slate-800 ${activeTab === tab.id ? 'bg-[#0b1120] text-teal-400 border-t-2 border-teal-500' : 'text-slate-500 hover:bg-slate-900 border-t-2 border-transparent'}`}>
                    ▶ {tab.name}
                 </button>
              ))}
              <button onClick={addBashTab} title="Abrir nueva terminal Bash local" className="px-3 py-2 text-slate-500 hover:text-teal-400 hover:bg-slate-900 transition-colors font-black">+</button>
           </div>

           <div className="flex items-center gap-3 shrink-0">
               <label className="flex items-center space-x-1 cursor-pointer" title="Guarda automáticamente la salida de Nmap y Bash en disco duro al terminar">
                   <input type="checkbox" checked={autoLogEnabled} onChange={() => setAutoLogEnabled(!autoLogEnabled)} className="rounded text-fuchsia-500 accent-fuchsia-500 w-3 h-3" />
                   <span className={`text-[9px] font-bold uppercase tracking-wider ${autoLogEnabled ? 'text-fuchsia-400' : 'text-slate-500'}`}>Auto-Log</span>
               </label>
           </div>
        </div>

        {/* CONTENEDOR DE LA PESTAÑA DEL ESCÁNER NMAP */}
        <div className={`flex-col flex-1 h-full min-h-0 ${activeTab === 'scanner' ? 'flex' : 'hidden'}`}>
            <div className="bg-slate-900 px-4 py-1.5 flex justify-between items-center border-b border-slate-700 shrink-0">
                <div className="flex items-center space-x-3 overflow-hidden">
                    <span className="text-[10px] font-mono text-emerald-400 bg-black/30 px-2 py-0.5 rounded border border-slate-700 truncate max-w-md hidden md:block" title="Comando actual">
                    $ {commandString}
                    </span>
                    <input type="text" value={searchGrep} onChange={(e) => setSearchGrep(e.target.value)} placeholder="Grep: filtrar..." className="bg-slate-950 border border-slate-700 text-emerald-400 text-[10px] px-2 py-1 rounded w-32 focus:ring-1 focus:ring-indigo-500 outline-none font-mono shrink-0" />
                    {isScanning && progressText && <span className="text-[10px] text-indigo-300 font-bold bg-indigo-900/40 px-2 py-0.5 rounded border border-indigo-500/30 shrink-0">{progressText}</span>}
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                    <button onClick={copyCommand} className="text-[10px] text-slate-400 hover:text-white transition-colors uppercase font-bold">{copied ? 'Copiado!' : 'Copiar CLI'}</button>
                    <button onClick={() => exportRawLog(false)} disabled={output.length === 0} className="text-[10px] text-slate-400 hover:text-white transition-colors disabled:opacity-30 uppercase font-bold">Descargar Log</button>
                    <button onClick={clearOutput} disabled={isScanning} className="text-[10px] text-slate-400 hover:text-white transition-colors disabled:opacity-30 uppercase font-bold">Limpiar</button>
                </div>
            </div>

            <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap scroll-smooth relative custom-scrollbar">
                {filteredOutput.length > 0
                ? filteredOutput.map((line, i) => <ColorizeLine key={i} line={line} />)
                : <span className="text-slate-600">Terminal inactiva. Esperando comandos de LESSSO C2...</span>
                }
                <div ref={terminalEndRef} />
            </div>

            {!autoScroll && isScanning && !searchGrep && (
                <button onClick={() => setAutoScroll(true)} className="absolute bottom-6 right-6 bg-[#0b282c] text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg opacity-90 hover:opacity-100 animate-bounce uppercase tracking-wider border border-teal-500/30">↓ Ver logs recientes</button>
            )}
        </div>

        {/* CONTENEDORES DE LAS PESTAÑAS BASH */}
        {bashTabs.map(tab => (
           <BashTabInstance key={tab.id} sessionId={tab.id} isActive={activeTab === tab.id} onRemove={removeBashTab} autoLog={autoLogEnabled} />
        ))}
    </section>
  )
}
