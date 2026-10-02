import { Component, type ReactNode, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Square, Pause, X } from 'lucide-react';
import { useXterm } from '../hooks/useXterm';
import '@xterm/xterm/css/xterm.css';

interface TabErrorBoundaryProps { children: ReactNode; onClose: () => void; label: string; }
interface TabErrorBoundaryState { hasError: boolean; error?: string; }

export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
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

export interface BashTerminalProps {
  sessionId: string;
  isActive: boolean;
  onRemove: (id: string) => void;
  autoLog: boolean;
}

export const BashTerminal = memo(function BashTerminal({ 
  sessionId, 
  isActive, 
  onRemove, 
  autoLog 
}: BashTerminalProps) {
  const { termRef, killAndClose } = useXterm(sessionId, autoLog, onRemove);

  return (
    <div className={`flex-1 flex-col h-full ${isActive ? 'flex' : 'hidden'}`}>
      <div className="bg-slate-900 border-b border-slate-800 flex justify-between px-3 py-1.5 shrink-0 items-center">
        <div className="flex gap-2">
          <button 
            onClick={() => invoke('send_terminal_signal', { sessionId, signalName: 'SIGINT' }).catch(() => {})} 
            className="flex items-center gap-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-2 py-1 rounded text-[10px] font-mono transition-colors" 
            title="Ctrl+C"
          >
            <Square size={10} className="fill-current"/> SIGINT
          </button>
          <button 
            onClick={() => invoke('send_terminal_signal', { sessionId, signalName: 'SIGTSTP' }).catch(() => {})} 
            className="flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2 py-1 rounded text-[10px] font-mono transition-colors" 
            title="Ctrl+Z"
          >
            <Pause size={10} className="fill-current"/> SIGTSTP
          </button>
        </div>
        <button onClick={killAndClose} className="text-slate-500 hover:text-rose-400 p-1 transition-colors"><X size={14} /></button>
      </div>
      <div ref={termRef} className="flex-1 w-full h-full p-2 bg-[#020617] overflow-hidden" />
    </div>
  );
});
