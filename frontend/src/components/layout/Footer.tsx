import { useNetworkStore } from '../../core/store/networkStore';
import { useUiStore } from '../../core/store/uiStore';
import { TerminalSquare, ShieldCheck, ShieldX, Server, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Footer() {
  const { vpnIp, backendStatus, backendIsPinging, connectVpn, disconnectVpn } = useNetworkStore();
  const { isTerminalOpen, setIsTerminalOpen } = useUiStore();

  return (
    <footer className="h-8 shrink-0 bg-slate-100 dark:bg-[#020617] border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between px-3 text-[11px] font-mono text-slate-500 dark:text-slate-400 print:hidden z-30 select-none">
      <div className="flex items-center gap-4 h-full">
        <button
          onClick={() => setIsTerminalOpen(!isTerminalOpen)}
          className={cn(
            "flex items-center gap-1.5 h-full px-2 hover:bg-slate-200 dark:hover:bg-slate-800/50 transition-colors",
            isTerminalOpen && "text-[#0b282c] dark:text-teal-400"
          )}
        >
          <TerminalSquare size={14} />
          <span>TERMINAL</span>
        </button>

        <div className="w-px h-4 bg-slate-300 dark:bg-slate-800"></div>

        {/* Botón Táctico VPN */}
        <button 
          onClick={vpnIp ? disconnectVpn : connectVpn} 
          className="flex items-center gap-1.5 h-full px-2 hover:bg-slate-200 dark:hover:bg-slate-800/50 transition-colors"
          title={vpnIp ? "Desconectar VPN" : "Conectar VPN (.ovpn)"}
        >
          {vpnIp ? (
            <>
              <ShieldCheck size={14} className="text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{vpnIp}</span>
              <span className="text-slate-400 dark:text-slate-600">(tun0)</span>
            </>
          ) : (
            <>
              <ShieldX size={14} className="text-slate-400 dark:text-slate-600" />
              <span>VPN OFFLINE</span>
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-4 h-full">
        <div className="flex items-center gap-1.5" title="Estado de la API Local">
          <Server size={14} className={backendStatus === 'online' ? "text-teal-500" : "text-slate-500"} />
          <span className="uppercase tracking-wider">
            {backendStatus === 'online' ? 'API ONLINE' : backendStatus === 'offline' ? 'API OFFLINE' : 'Conectando...'}
          </span>
          {backendIsPinging && <Activity size={12} className="animate-pulse text-teal-500 ml-1" />}
        </div>
      </div>
    </footer>
  );
}
