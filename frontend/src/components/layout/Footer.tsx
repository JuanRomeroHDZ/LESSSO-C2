import { useScanStore } from '../../core/store/useScanStore';

interface FooterProps {
  isTerminalOpen: boolean;
  setIsTerminalOpen: (v: boolean) => void;
}

export function Footer({ isTerminalOpen, setIsTerminalOpen }: FooterProps) {
  const {
    autoSaveEnabled, toggleAutoSave, backendStatus, backendLastSyncAt, backendLastError, pingBackend,
    soundEnabled, toggleSound, volume, setVolume, vpnIp, disconnectVpn, connectVpn
  } = useScanStore();

  const backendMeta = (() => {
    if (backendStatus === 'online') {
      return {
        icon: '🟢', label: 'BACKEND', color: 'text-emerald-400', dotColor: 'bg-emerald-400', pulse: true,
        tooltip: backendLastSyncAt ? `Backend ONLINE. Último sync: ${new Date(backendLastSyncAt).toLocaleTimeString()}` : 'Backend ONLINE',
      }
    }
    if (backendStatus === 'offline') {
      return {
        icon: '🔴', label: 'BACKEND', color: 'text-red-400', dotColor: 'bg-red-400', pulse: false,
        tooltip: backendLastError ? `Backend OFFLINE.\nError: ${backendLastError}\n\nClic para reintentar` : 'Backend OFFLINE.\n\nClic para reintentar',
      }
    }
    return {
      icon: '⚪', label: 'BACKEND', color: 'text-slate-400', dotColor: 'bg-slate-400', pulse: false,
      tooltip: 'Estado del backend desconocido.\n\nClic para verificar',
    }
  })();

  return (
    <footer className="h-7 bg-[#0b282c] text-white flex items-center justify-between px-3 text-[10px] font-bold shrink-0 print:hidden z-50">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5" title="Sistema Operativo Nativamente Integrado">
          <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse"></div> LESSSO C2 READY
        </span>
        <div className="w-px h-4 bg-teal-700"></div>
        <button onClick={() => setIsTerminalOpen(!isTerminalOpen)} className="hover:text-teal-200 transition-colors flex items-center gap-1 cursor-pointer">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 17l6-6-6-6M12 19h8"></path>
          </svg>
          {' '}TERMINAL NMAP {isTerminalOpen ? '▼' : '▲'}
        </button>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={toggleAutoSave} className="flex items-center gap-1 hover:text-teal-200 transition-colors" title="El estado de la app se guarda en disco local al instante.">
          {autoSaveEnabled ? '💾 AUTO-GUARDADO ON' : '⚠ AUTO-GUARDADO OFF'}
        </button>

        <button onClick={() => pingBackend()} title={backendMeta.tooltip} className={`flex items-center gap-1.5 hover:text-teal-200 transition-colors cursor-pointer ${backendMeta.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${backendMeta.dotColor} ${backendMeta.pulse ? 'animate-pulse' : ''}`}></span>
          {backendMeta.label}
        </button>

        <div className="flex items-center gap-1.5 bg-[#081e21] px-2 py-0.5 rounded border border-[#144249]" title="Ajustar Volumen de Alertas">
          <button onClick={toggleSound} className="hover:scale-110 transition-transform text-teal-400">{soundEnabled ? '🔊' : '🔇'}</button>
          <input type="range" min="0" max="100" step="1" value={volume} onChange={(e) => setVolume(parseInt(e.target.value))} className="w-16 h-1 accent-teal-400 appearance-none bg-[#144249] rounded-lg cursor-pointer" />
        </div>
        
        <button onClick={vpnIp ? disconnectVpn : connectVpn} className={`px-2 py-0.5 rounded flex items-center gap-1.5 transition-colors ${vpnIp ? 'bg-emerald-600 hover:bg-red-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`} title={vpnIp ? "Clic para Desconectar de la red de HTB" : "Clic para Conectar usando archivo .ovpn"}>
          <span className={`w-1.5 h-1.5 rounded-full ${vpnIp ? 'bg-white animate-pulse' : 'bg-white'}`}></span>
          {vpnIp ? `HTB: ${vpnIp} (DISCONNECT)` : 'VPN OFFLINE (CONNECT)'}
        </button>
      </div>
    </footer>
  );
}
