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
    <div className="flex flex-col gap-3 mb-6 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
      <div className="flex gap-3">
        <input 
          type="text" 
          value={target} 
          onChange={e => setTarget(e.target.value)} 
          placeholder="IP o Servicio objetivo" 
          className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 dark:text-white transition-colors" 
        />
        <select 
          value={type} 
          onChange={e => setType(e.target.value as any)} 
          className="w-28 px-3 py-2 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 dark:text-white font-medium transition-colors"
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
        className="w-full px-3 py-2 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 dark:text-white transition-colors" 
      />
      <div className="flex gap-3">
        <input 
          type="text" 
          value={secret} 
          onChange={e => setSecret(e.target.value)} 
          placeholder="Secreto (Contraseña o Hash)" 
          className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 dark:text-white font-mono transition-colors" 
        />
        <button 
          onClick={onAdd} 
          className="px-6 py-2 bg-teal-600 text-white text-xs font-bold uppercase tracking-wider rounded-md hover:bg-teal-500 shadow-sm transition-colors"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
