import { useState } from 'react';
import { Lock, Unlock, Shield, ShieldAlert } from 'lucide-react';

interface VaultLockScreenProps {
  isNew: boolean;
  vaultNameValue: string;
  passwordVisible: string;
  errorMsg: string;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  onSetMaster: () => void;
  onDestroy: () => void;
}

export function VaultLockScreen({
  isNew,
  vaultNameValue,
  passwordVisible,
  errorMsg,
  onNameChange,
  onPasswordChange,
  onUnlock,
  onSetMaster,
  onDestroy
}: VaultLockScreenProps) {
  // Estado local para manejar la confirmación sin usar window.confirm()
  const [confirmDestroy, setConfirmDestroy] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-[#020617] border-r border-slate-200 dark:border-slate-800/80 p-8 text-center relative">
      
      <div className="w-20 h-20 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-full flex items-center justify-center mb-6 shadow-inner border border-teal-500/20">
        <Shield size={32} strokeWidth={1.5} />
      </div>
      
      <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase mb-3 tracking-wide">
        {isNew ? 'Nueva Bóveda' : 'Bóveda Cifrada'}
      </h2>
      
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-8 max-w-[280px] leading-relaxed">
        {isNew
          ? 'Asigna un nombre y crea una contraseña maestra para cifrar tus credenciales localmente con AES-256.'
          : 'Ingresa tu contraseña maestra para descifrar el contenido de la bóveda.'}
      </p>

      <div className="w-full max-w-[280px] space-y-3">
        {isNew && (
          <input
            type="text"
            value={vaultNameValue}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Nombre de la Bóveda..."
            autoComplete="off" spellCheck={false}
            className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-bold dark:text-white outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all text-center shadow-sm"
          />
        )}

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

      {/* REEMPLAZO DEL WINDOW.CONFIRM POR UI NATIVA DE REACT */}
      {!isNew && (
        <div className="absolute bottom-8 w-full px-6 flex flex-col items-center justify-center">
          {confirmDestroy ? (
            <div className="bg-rose-500/5 border border-rose-500/20 p-3 rounded-lg animate-in slide-in-from-bottom-2">
              <p className="text-[10px] text-rose-500 font-bold mb-3 uppercase tracking-wider">⚠️ ¿Seguro? Se borrará irreversiblemente.</p>
              <div className="flex gap-2 justify-center">
                <button 
                  onClick={() => setConfirmDestroy(false)} 
                  className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] uppercase font-bold rounded-md hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={onDestroy} 
                  className="px-4 py-1.5 bg-rose-600 text-white text-[10px] uppercase font-bold rounded-md hover:bg-rose-500 transition-colors shadow-sm"
                >
                  Sí, destruir
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setConfirmDestroy(true)}
              className="text-[10px] uppercase font-bold text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center gap-1.5 mx-auto"
            >
              <ShieldAlert size={12} />
              Destruir bóveda (Empezar de cero)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
