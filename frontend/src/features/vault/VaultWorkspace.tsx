import { useState, useRef, useEffect } from 'react';
import { useScanStore } from '../../core/store/useScanStore';
import { Lock, Unlock, Eye, EyeOff, Copy, Trash2, KeyRound, Shield, FileOutput, TerminalSquare } from 'lucide-react';

export function VaultWorkspace() {
  const {
    vaultCredentials,
    addVaultCred,
    removeVaultCred,
    isVaultUnlocked,
    encryptedVaultData,
    setMasterPassword,
    unlockVault,
    lockVault,
  } = useScanStore();

  const [target, setTarget] = useState('');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [type, setType] = useState<'hash' | 'password' | 'key'>('password');
  const [notes, setNotes] = useState('');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const passwordRef = useRef('');
  const [passwordVisible, setPasswordVisible] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    return () => {
      passwordRef.current = '';
      setPasswordVisible('');
    };
  }, []);

  const handlePasswordChange = (value: string) => {
    passwordRef.current = value;
    setPasswordVisible(value);
  };

  const clearPassword = () => {
    passwordRef.current = '';
    setPasswordVisible('');
  };

  const handleUnlock = async () => {
    const pwd = passwordRef.current;
    if (!pwd) { setErrorMsg('Introduce la contraseña.'); return; }
    const success = await unlockVault(pwd);
    if (!success) { setErrorMsg('Contraseña incorrecta.'); clearPassword(); } 
    else { setErrorMsg(''); clearPassword(); }
  };

  const handleSetMaster = async () => {
    const pwd = passwordRef.current;
    if (pwd.length < 4) { setErrorMsg('Muy corta (Mín. 4)'); return; }
    try {
      await setMasterPassword(pwd);
      setErrorMsg('');
      clearPassword();
    } catch (e) {
      console.error('setMasterPassword falló:', e);
      setErrorMsg('Error creando la bóveda.');
    }
  };

  const handleAdd = async () => {
    if (!target || !secret) return;
    try {
      await addVaultCred({ target, username, secret, type, notes });
      setUsername(''); setSecret(''); setNotes(''); setErrorMsg('');
    } catch (e: any) {
      setErrorMsg(e.message || 'Error al añadir credencial');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeVaultCred(id);
      setErrorMsg('');
    } catch (e: any) {
      setErrorMsg(e.message || 'Error al eliminar credencial');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  const exportVault = () => {
    // Corregido: uso de pipe y operador OR estándar
    const txt = vaultCredentials.map(c => `${c.target} | ${c.type.toUpperCase()} | ${c.username || 'N/A'} : ${c.secret}`).join('\n');
    navigator.clipboard.writeText(txt);
    alert('Credenciales copiadas al portapapeles.');
  };

  const exportCME = () => {
    // Corregido: uso de operador OR estándar
    const cmeCmds = vaultCredentials
      .filter(c => c.type === 'password' || c.type === 'hash')
      .map(c => `crackmapexec smb ${c.target} -u '${c.username || 'Administrator'}' -p '${c.secret}'`)
      .join('\n');
    navigator.clipboard.writeText(cmeCmds);
    alert('Comandos CME copiados!');
  };

  const toggleReveal = (id: string) => {
    setRevealed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (!isVaultUnlocked) {
    const isNew = !encryptedVaultData;
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
            onChange={e => handlePasswordChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { isNew ? handleSetMaster() : handleUnlock(); } }}
            placeholder="Contraseña Maestra..."
            autoComplete="off" spellCheck={false}
            className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono dark:text-white outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all text-center shadow-sm"
          />
          {errorMsg && <p className="text-rose-500 text-xs font-bold bg-rose-500/10 py-2 rounded border border-rose-500/20">{errorMsg}</p>}
          <button
            onClick={isNew ? handleSetMaster : handleUnlock}
            className="w-full bg-teal-600 hover:bg-teal-500 text-white px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2"
          >
            {isNew ? <Lock size={14} /> : <Unlock size={14} />}
            {isNew ? 'Crear Bóveda' : 'Desbloquear'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#020617] border-r border-slate-200 dark:border-slate-800/80 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
          <Unlock size={16} className="text-teal-500" /> Bóveda
        </h2>
        <div className="flex gap-2">
          <button onClick={lockVault} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors flex items-center gap-1.5"><Lock size={12}/> Bloquear</button>
          <button onClick={exportCME} className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors flex items-center gap-1.5"><TerminalSquare size={12}/> CME</button>
          <button onClick={exportVault} className="px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/20 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors flex items-center gap-1.5"><FileOutput size={12}/> Exportar</button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-600 dark:text-rose-400 font-bold flex items-center gap-2">
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col gap-3 mb-6 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
        <div className="flex gap-3">
          <input type="text" value={target} onChange={e => setTarget(e.target.value)} placeholder="IP o Servicio objetivo" className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 dark:text-white transition-colors" />
          <select value={type} onChange={e => setType(e.target.value as any)} className="w-28 px-3 py-2 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 dark:text-white font-medium transition-colors">
            <option value="password">Password</option>
            <option value="hash">Hash NTLM</option>
            <option value="key">SSH Key</option>
          </select>
        </div>
        <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Usuario (Ej: Administrator)" className="w-full px-3 py-2 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 dark:text-white transition-colors" />
        <div className="flex gap-3">
          <input type="text" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Secreto (Contraseña o Hash)" className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md outline-none focus:border-teal-500 dark:text-white font-mono transition-colors" />
          <button onClick={handleAdd} className="px-6 py-2 bg-teal-600 text-white text-xs font-bold uppercase tracking-wider rounded-md hover:bg-teal-500 shadow-sm transition-colors">Guardar</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar border border-slate-200 dark:border-slate-800/80 rounded-xl shadow-sm bg-white dark:bg-slate-900/20">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-900/80 uppercase font-bold text-[10px] tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800/80 sticky top-0 z-10">
            <tr>
              <th className="p-3">Credencial</th>
              <th className="p-3 w-12 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {vaultCredentials.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                <td className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-900 dark:text-white">{c.target}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-sm border border-slate-200 dark:border-slate-700">
                      {c.type}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[11px] mb-2 flex items-center gap-1.5">
                    <KeyRound size={10} /> {c.username || 'Sin usuario'}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-xs text-teal-600 dark:text-teal-400 break-all bg-teal-50 dark:bg-teal-500/10 border border-teal-100 dark:border-teal-500/20 px-2 py-1 rounded w-fit max-w-full">
                      {revealed[c.id] ? c.secret : '••••••••••••••••'}
                    </div>
                    <button onClick={() => toggleReveal(c.id)} className="text-slate-400 hover:text-teal-500 transition-colors p-1" title="Mostrar/Ocultar">
                      {revealed[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button onClick={() => copyToClipboard(c.secret)} className="text-slate-400 hover:text-teal-500 transition-colors p-1" title="Copiar al portapapeles">
                      <Copy size={14} />
                    </button>
                  </div>
                </td>
                <td className="p-3 text-center align-middle">
                  <button onClick={() => handleRemove(c.id)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 p-2 rounded-md transition-all opacity-0 group-hover:opacity-100" title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {vaultCredentials.length === 0 && (
              <tr>
                <td colSpan={2} className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs font-mono">
                  Bóveda vacía. Almacena contraseñas o hashes descubiertos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
