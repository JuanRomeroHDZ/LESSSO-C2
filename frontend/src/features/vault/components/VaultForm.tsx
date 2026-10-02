interface VaultFormProps {
  target: string;
  setTarget: (v: string) => void;
  type: 'hash' | 'password' | 'key';
  setType: (v: 'hash' | 'password' | 'key') => void;
  username: string;
  setUsername: (v: string) => void;
  secret: string;
  setSecret: (v: string) => void;
  onAdd: () => void;
}

export function VaultForm({
  target, setTarget,
  type, setType,
  username, setUsername,
  secret, setSecret,
  onAdd
}: VaultFormProps) {
  return (
    <div className="flex flex-col gap-3 mb-6 bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm w-full">
      <div className="flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          value={target} 
          onChange={e => setTarget(e.target.value)} 
          placeholder="IP o Servicio objetivo" 
          className="w-full sm:w-2/3 px-3 py-2.5 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 dark:text-white transition-all shadow-sm" 
        />
        <select 
          value={type} 
          onChange={e => setType(e.target.value as any)} 
          className="w-full sm:w-1/3 px-3 py-2.5 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 dark:text-white font-medium transition-all shadow-sm cursor-pointer appearance-none"
        >
          <option value="password">Password</option>
          <option value="hash">Hash NTLM</option>
          <option value="key">SSH Key</option>
        </select>
      </div>
      
      <input 
        type="text" 
        value={username} 
        onChange={e => setUsername(e.target.value)} 
        placeholder="Usuario (Ej: Administrator)" 
        className="w-full px-3 py-2.5 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 dark:text-white transition-all shadow-sm" 
      />
      
      <div className="flex flex-col sm:flex-row gap-3">
        <input 
          type="text" 
          value={secret} 
          onChange={e => setSecret(e.target.value)} 
          placeholder="Secreto (Contraseña o Hash)" 
          className="w-full sm:w-2/3 px-3 py-2.5 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 dark:text-white font-mono transition-all shadow-sm" 
        />
        <button 
          onClick={onAdd} 
          className="w-full sm:w-1/3 px-6 py-2.5 bg-teal-600 text-white text-xs font-bold uppercase tracking-wider rounded-md hover:bg-teal-500 shadow-md active:scale-95 transition-all"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
