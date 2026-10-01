import { useEffect, useRef, useState, useCallback, Component, type ReactNode, memo } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useScanStore } from '../../core/store/useScanStore'
import { Copy, Download, Trash2, Search, TerminalSquare, X, Pause, Square } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

const MAX_BASH_TABS = 5;
const SESSION_PREFIX = 'lessso-bash-';
let sessionCounter = 0;

function newSessionId(): string {
  sessionCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${SESSION_PREFIX}${Date.now()}-${sessionCounter}-${rand}`;
}

const startedSessions = new Set<string>();

interface TabErrorBoundaryProps { children: ReactNode; onClose: () => void; label: string; }
interface TabErrorBoundaryState { hasError: boolean; error?: string; }

class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError(error: Error): TabErrorBoundaryState { return { hasError: true, error: error.message }; }
  componentDidCatch(error: Error) { console.error(`[TabErrorBoundary:${this.props.label}] Crash:`, error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#020617] text-rose-400 p-6">
          <span className="text-3xl mb-3">💥</span>
          <h3 className="text-sm font-bold mb-2">Terminal Crasheada</h3>
          <p className="text-[10px] font-mono opacity-70 mb-4 max-w-md text-center break-all">{this.state.error}</p>
          <button onClick={this.props.onClose} className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-wider rounded">Cerrar pestaña</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ColorizeLine = ({ line }: { line: string }) => {
  // eslint-disable-next-line no-control-regex
  const cleanLine = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
  if (!cleanLine || cleanLine.startsWith('Stats:') || cleanLine.includes('.~-') || cleanLine.includes('| {}') || cleanLine.includes('`-\'')) return null;
  if (cleanLine.includes('Discovered open port')) return <span className="text-teal-400 font-semibold">{cleanLine}</span>;
  if (cleanLine.startsWith('Initiating') || cleanLine.startsWith('Completed') || cleanLine.includes('Open')) return <span className="text-indigo-400 italic">{cleanLine}</span>;
  if (cleanLine.startsWith('NSE:')) return <span className="text-fuchsia-400">{cleanLine}</span>;
  if (cleanLine.includes('[ERR]') || cleanLine.includes('ERROR:')) return <span className="text-rose-500 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('[WARN]') || cleanLine.includes('Warning:')) return <span className="text-amber-400 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('[SYS]')) return <span className="text-sky-400 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('[OK]')) return <span className="text-teal-400 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('Nmap scan report for')) return <span className="text-sky-400 font-bold mt-3 block border-t border-slate-800/60 pt-2">{cleanLine}</span>;

  if (cleanLine.match(/^\d+\/(tcp|udp|sctp)/)) {
    const parts = cleanLine.split(/(\s+)/);
    return (
      <span>
        {parts.map((part, i) => {
          if (part.match(/^\d+\/(tcp|udp|sctp)/)) return <span key={i} className="text-sky-400 font-bold">{part}</span>;
          if (part === 'open') return <span key={i} className="text-teal-400 font-bold">{part}</span>;
          if (part === 'closed' || part === 'filtered') return <span key={i} className="text-orange-400">{part}</span>;
          if (i === 4 && part.trim() !== '') return <span key={i} className="text-fuchsia-400">{part}</span>;
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
        if (part.match(/\d+\.\d+%/)) return <span key={i} className="text-amber-400 font-bold">{part}</span>;
        if (part.match(/\d+:\d+:\d+/)) return <span key={i} className="text-purple-400">{part}</span>;
        return part;
      })}
    </span>
  );
}

interface BashTabInstanceProps {
  sessionId: string;
  isActive: boolean;
  onRemove: (id: string) => void;
  autoLog: boolean;
}

const BashTabInstance = memo(function BashTabInstance({ sessionId, isActive, onRemove, autoLog }: BashTabInstanceProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const unlistenFuncs = useRef<UnlistenFn[]>([]);
  const sessionLog = useRef<string[]>([]);
  const killedRef = useRef(false);
  const removedRef = useRef(false);

  const killAndClose = useCallback(async () => {
    if (removedRef.current) return;
    removedRef.current = true;
    const killPromise = invoke('kill_terminal', { sessionId }).catch((err) => console.warn(err));
    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 400));
    await Promise.race([killPromise, timeoutPromise]);

    if (autoLog && sessionLog.current.length > 0) {
      try {
        const blob = new Blob([sessionLog.current.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `lessso_bash_${sessionId}.log`; a.click(); URL.revokeObjectURL(url);
      } catch (e) {}
    }
    startedSessions.delete(sessionId);
    onRemove(sessionId);
  }, [sessionId, autoLog, onRemove]);

  useEffect(() => {
    let isMounted = true;
    let fitAddon: FitAddon | null = null;
    const initTerminal = async () => {
      if (!termRef.current) return;
      const term = new Terminal({ theme: { background: '#020617', foreground: '#2dd4bf', cursor: '#2dd4bf' }, fontSize: 13, fontFamily: 'monospace', cursorBlink: true });
      fitAddon = new FitAddon(); term.loadAddon(fitAddon); term.open(termRef.current);
      try { fitAddon.fit(); } catch (e) {}
      terminalInstance.current = term;
      term.writeln(`\x1b[1;36m[*] SESSION ID: ${sessionId.slice(-8)}\x1b[0m`);

      const unlistenOut = await listen<string>(`term-output-${sessionId}`, (e) => {
        if (!isMounted) return; sessionLog.current.push(e.payload); term.write(e.payload.replace(/\n/g, '\r\n'));
      });
      const unlistenExit = await listen(`term-exit-${sessionId}`, () => {
        if (!isMounted) return; term.writeln('\r\n\x1b[1;33m[*] Proceso cerrado.\x1b[0m');
      });
      unlistenFuncs.current.push(unlistenOut, unlistenExit);

      term.onData((data) => { invoke('write_terminal', { sessionId, data }).catch(() => {}); });

      if (startedSessions.has(sessionId)) return;
      startedSessions.add(sessionId);

      try {
        await invoke('start_terminal', { sessionId, cmd: '/usr/bin/script', args: ['-qfc', '/bin/bash -i', '/dev/null'] });
      } catch (err) {
        term.writeln(`\r\n\x1b[1;31m[ERR] ${err}\x1b[0m`); startedSessions.delete(sessionId);
      }

      const resizeHandler = () => { try { fitAddon?.fit(); } catch (e) {} };
      window.addEventListener('resize', resizeHandler);
      unlistenFuncs.current.push(() => window.removeEventListener('resize', resizeHandler));
    };
    initTerminal();

    return () => {
      isMounted = false;
      unlistenFuncs.current.forEach((f) => { try { f(); } catch {} }); unlistenFuncs.current = [];
      if (!killedRef.current && !removedRef.current) {
        killedRef.current = true; startedSessions.delete(sessionId); invoke('kill_terminal', { sessionId }).catch(() => {});
      }
      terminalInstance.current?.dispose(); terminalInstance.current = null;
    };
  }, [sessionId]);

  return (
    <div className={`flex-1 flex-col h-full ${isActive ? 'flex' : 'hidden'}`}>
      <div className="bg-slate-900 border-b border-slate-800 flex justify-between px-3 py-1.5 shrink-0 items-center">
        <div className="flex gap-2">
          <button onClick={() => invoke('send_terminal_signal', { sessionId, signalName: 'SIGINT' }).catch(() => {})} className="flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-2 py-1 rounded text-[10px] font-mono transition-colors" title="Ctrl+C"><Square size={10} className="fill-current"/> SIGINT</button>
          <button onClick={() => invoke('send_terminal_signal', { sessionId, signalName: 'SIGTSTP' }).catch(() => {})} className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2 py-1 rounded text-[10px] font-mono transition-colors" title="Ctrl+Z"><Pause size={10} className="fill-current"/> SIGTSTP</button>
        </div>
        <button onClick={killAndClose} className="text-slate-500 hover:text-rose-400 p-1 transition-colors"><X size={14} /></button>
      </div>
      <div ref={termRef} className="flex-1 w-full h-full p-2 bg-[#020617] overflow-hidden" />
    </div>
  );
});

export function TerminalPanel() {
  const { output, appendOutput, setIsScanning, commandString, progressText, setProgressText, isScanning, clearOutput } = useScanStore()
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [autoScroll, setAutoScroll] = useState(true)
  const [searchGrep, setSearchGrep] = useState('')
  const [copied, setCopied] = useState(false)

  const [activeTab, setActiveTab] = useState<'scanner' | string>('scanner');
  const [bashTabs, setBashTabs] = useState<{ id: string; name: string }[]>([]);
  const [autoLogEnabled, setAutoLogEnabled] = useState(false);

  useEffect(() => {
    if (!isScanning && output.length > 0 && autoLogEnabled) exportRawLog(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  const addBashTab = () => {
    if (bashTabs.length >= MAX_BASH_TABS) { alert(`Máximo ${MAX_BASH_TABS} terminales simultáneas.`); return; }
    const id = newSessionId();
    setBashTabs((prev) => [...prev, { id, name: `Bash ${bashTabs.length + 1}` }]);
    setActiveTab(id);
  };

  const removeBashTab = useCallback((idToRemove: string) => {
    setBashTabs((prev) => prev.filter((t) => t.id !== idToRemove));
    setActiveTab((current) => (current === idToRemove ? 'scanner' : current));
  }, []);

  const exportRawLog = (isSilent: boolean = false) => {
    if (output.length === 0) return;
    const blob = new Blob([output.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `nmap_log_${Date.now()}.txt`; a.click(); URL.revokeObjectURL(url);
    if (!isSilent) alert('Log exportado a Descargas.');
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(commandString); setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (autoScroll && activeTab === 'scanner') terminalEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [output.length, autoScroll, activeTab]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  useEffect(() => {
    const unlistenOutput = listen<string>('nmap-output', (event) => {
      const line = event.payload;
      if (line.startsWith('Stats:')) {
        const perc = line.match(/(\d+\.\d+)% done/);
        const eta = line.match(/(\d+:\d+:\d+) remaining/);
        if (perc && eta) setProgressText(`${perc[1]}% | ETA: ${eta[1]}`);
      } else if (line.trim().length > 2) appendOutput(line);
    });

    const unlistenFinished = listen<string>('nmap-finished', (event) => {
      appendOutput(`\n${event.payload}`); setIsScanning(false); setProgressText('Completado');
    });

    return () => { unlistenOutput.then(f => f()); unlistenFinished.then(f => f()); };
  }, [appendOutput, setIsScanning, setProgressText]);

  const filteredOutput = searchGrep ? output.filter((line) => line.toLowerCase().includes(searchGrep.toLowerCase())) : output;

  return (
    <section className="flex flex-col h-full min-h-0 bg-[#020617] relative border-t border-slate-800/80">
      
      {/* TABS BAR */}
      <div className="bg-slate-950 flex justify-between items-center pr-3 shrink-0 border-b border-slate-800/80 z-10">
        <div className="flex overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'scanner' ? 'bg-[#020617] text-teal-400 border-t-2 border-teal-500' : 'text-slate-500 hover:bg-slate-900 border-t-2 border-transparent'
            }`}
          >
            <TerminalSquare size={14} className={isScanning ? "text-teal-500 animate-pulse" : ""} />
            ESCANER NMAP
          </button>

          {bashTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-2 border-r border-slate-800/50 ${
                activeTab === tab.id ? 'bg-[#020617] text-sky-400 border-t-2 border-sky-500' : 'text-slate-500 hover:bg-slate-900 border-t-2 border-transparent'
              }`}
            >
              <span className="text-sky-500">~</span> {tab.name}
            </button>
          ))}

          <button
            onClick={addBashTab}
            disabled={bashTabs.length >= MAX_BASH_TABS}
            className="px-4 py-2 text-slate-500 hover:text-sky-400 hover:bg-slate-900 disabled:opacity-30 transition-colors flex items-center"
          >
            +
          </button>
        </div>

        <label className="flex items-center space-x-1.5 cursor-pointer" title="Guardar logs autom.">
          <input type="checkbox" checked={autoLogEnabled} onChange={() => setAutoLogEnabled(!autoLogEnabled)} className="rounded text-fuchsia-500 accent-fuchsia-500 w-3 h-3" />
          <span className={`text-[9px] font-bold uppercase tracking-wider ${autoLogEnabled ? 'text-fuchsia-400' : 'text-slate-500'}`}>Auto-Log</span>
        </label>
      </div>

      {/* SCANNER TAB */}
      <div className={`flex-col flex-1 h-full min-h-0 ${activeTab === 'scanner' ? 'flex' : 'hidden'}`}>
        <div className="bg-slate-900/50 px-4 py-2 flex justify-between items-center border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-[11px] font-mono text-slate-400 truncate max-w-md hidden md:block">
              <span className="text-teal-500 mr-2">❯</span>{commandString}
            </span>
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2 text-slate-500" />
              <input
                type="text"
                value={searchGrep}
                onChange={(e) => setSearchGrep(e.target.value)}
                placeholder="Grep..."
                className="bg-[#020617] border border-slate-800 text-teal-400 text-[10px] pl-6 pr-2 py-1 rounded w-32 focus:ring-1 focus:ring-teal-500/50 outline-none font-mono"
              />
            </div>
            {isScanning && progressText && (
              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 shrink-0">
                {progressText}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={copyCommand} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors" title={copied ? 'Copiado!' : 'Copiar CLI'}><Copy size={14} className={copied ? "text-teal-400" : ""} /></button>
            <button onClick={() => exportRawLog(false)} disabled={output.length === 0} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors disabled:opacity-30" title="Descargar Log"><Download size={14} /></button>
            <button onClick={clearOutput} disabled={isScanning} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors disabled:opacity-30" title="Limpiar"><Trash2 size={14} /></button>
          </div>
        </div>

        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap scroll-smooth relative custom-scrollbar">
          {filteredOutput.length > 0 ? filteredOutput.map((line, i) => <ColorizeLine key={i} line={line} />) : <span className="text-slate-600">Esperando ejecución...</span>}
          <div ref={terminalEndRef} />
        </div>

        {!autoScroll && isScanning && !searchGrep && (
          <button onClick={() => setAutoScroll(true)} className="absolute bottom-6 right-6 bg-teal-500 text-slate-950 text-[10px] font-bold px-4 py-2 rounded-full shadow-lg hover:bg-teal-400 animate-bounce uppercase tracking-wider">
            ↓ Seguir logs
          </button>
        )}
      </div>

      {/* PESTAÑAS BASH */}
      {bashTabs.map((tab) => (
        <TabErrorBoundary
          key={tab.id}
          label={tab.name}
          onClose={() => removeBashTab(tab.id)}
        >
          <BashTabInstance
            sessionId={tab.id}
            isActive={activeTab === tab.id}
            onRemove={removeBashTab}
            autoLog={autoLogEnabled}
          />
        </TabErrorBoundary>
      ))}
    </section>
  );
}
