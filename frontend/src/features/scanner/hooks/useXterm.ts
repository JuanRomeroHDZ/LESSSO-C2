import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

// Guard global anti-doble-spawn (evita múltiples procesos en StrictMode)
const startedSessions = new Set<string>();

export function useXterm(sessionId: string, autoLog: boolean, onRemove: (id: string) => void) {
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
        a.href = url; 
        a.download = `lessso_bash_${sessionId}.log`; 
        a.click(); 
        URL.revokeObjectURL(url);
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
      
      const term = new Terminal({ 
        theme: { background: '#020617', foreground: '#2dd4bf', cursor: '#2dd4bf' }, 
        fontSize: 13, 
        fontFamily: 'monospace', 
        cursorBlink: true 
      });
      
      fitAddon = new FitAddon(); 
      term.loadAddon(fitAddon); 
      term.open(termRef.current);
      
      try { fitAddon.fit(); } catch (e) {}
      
      terminalInstance.current = term;
      term.writeln(`\x1b[1;36m[*] SESSION ID: ${sessionId.slice(-8)}\x1b[0m`);

      const unlistenOut = await listen<string>(`term-output-${sessionId}`, (e) => {
        if (!isMounted) return; 
        sessionLog.current.push(e.payload); 
        term.write(e.payload.replace(/\n/g, '\r\n'));
      });
      
      const unlistenExit = await listen(`term-exit-${sessionId}`, () => {
        if (!isMounted) return; 
        term.writeln('\r\n\x1b[1;33m[*] Proceso cerrado.\x1b[0m');
      });
      
      unlistenFuncs.current.push(unlistenOut, unlistenExit);

      term.onData((data) => { 
        invoke('write_terminal', { sessionId, data }).catch(() => {}); 
      });

      if (startedSessions.has(sessionId)) return;
      startedSessions.add(sessionId);

      try {
        await invoke('start_terminal', { 
          sessionId, 
          cmd: '/usr/bin/script', 
          args: ['-qfc', '/bin/bash -i', '/dev/null'] 
        });
      } catch (err) {
        term.writeln(`\r\n\x1b[1;31m[ERR] ${err}\x1b[0m`); 
        startedSessions.delete(sessionId);
      }

      const resizeHandler = () => { try { fitAddon?.fit(); } catch (e) {} };
      window.addEventListener('resize', resizeHandler);
      unlistenFuncs.current.push(() => window.removeEventListener('resize', resizeHandler));
    };
    
    initTerminal();

    return () => {
      isMounted = false;
      unlistenFuncs.current.forEach((f) => { try { f(); } catch {} }); 
      unlistenFuncs.current = [];
      
      if (!killedRef.current && !removedRef.current) {
        killedRef.current = true; 
        startedSessions.delete(sessionId); 
        invoke('kill_terminal', { sessionId }).catch(() => {});
      }
      
      terminalInstance.current?.dispose(); 
      terminalInstance.current = null;
    };
  }, [sessionId]);

  return { termRef, killAndClose };
}
