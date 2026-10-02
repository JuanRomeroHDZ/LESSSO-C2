import { Lock, Unlock, Shield } from 'lucide-react';

interface VaultLockScreenProps {
  isNew: boolean;
  passwordVisible: string;
  errorMsg: string;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  onSetMaster: () => void;
}

export function VaultLockScreen({
  isNew,
  passwordVisible,
  errorMsg,
  onPasswordChange,
  onUnlock,
  onSetMaster
}: VaultLockScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-[#020617] border-r border-slate-200 dark:border-slate-800/80 p-8 text-center">
      <div className="w-20 h-20 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-full flex items-center justify-center mb-6 shadow-inner border border-teal-500/20">
        <Shield size={32} strokeWidth={1.5} />
      </div>
      <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase mb-3 tracking-wide">Bóveda Cifrada</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-8 max-w-[280px] leading-relaxed">
        {isNew
          ? 'Crea una contraseña maestra para cifrar con AES-256 tus credenciales y hashes localmente.'
          : 'Ingresa tu contraseña maestra para descifrar el contenido de la bóveda.'}
      </p>
      <div className="w-full max-w-[280px] space-y-3">
        <input
          type="password"
          value={passwordVisible}
          onChange={e => onPasswordChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { isNew ? onSetMaster() : onUnlock(); } }}
          placeholder="Contraseña Maestra..."
          autoComplete="off" spellCheck={false}
          className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono dark:text-white outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all text-center shadow-sm"
        />
        {errorMsg && <p className="text-rose-500 text-xs font-bold bg-rose-500/10 py-2 rounded border border-rose-500/20">{errorMsg}</p>}
        <button
          onClick={isNew ? onSetMaster : onUnlock}
          className="w-full bg-teal-600 hover:bg-teal-500 text-white px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2"
        >
          {isNew ? <Lock size={14} /> : <Unlock size={14} />}
          {isNew ? 'Crear Bóveda' : 'Desbloquear'}
        </button>
      </div>
    </div>
  );
}
