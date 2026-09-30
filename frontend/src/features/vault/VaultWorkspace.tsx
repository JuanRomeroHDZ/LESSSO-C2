import { useState, useRef, useEffect } from 'react';
import { useScanStore } from '../../core/store/useScanStore';

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
    if (!pwd) {
      setErrorMsg('Introduce la contraseña.');
      return;
    }
    const success = await unlockVault(pwd);
    if (!success) {
      setErrorMsg('Contraseña incorrecta.');
      clearPassword();
    } else {
      setErrorMsg('');
      clearPassword();
    }
  };

  const handleSetMaster = async () => {
    const pwd = passwordRef.current;
    if (pwd.length < 4) {
      setErrorMsg('Muy corta (Mín. 4)');
      return;
    }
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
      setUsername('');
      setSecret('');
      setNotes('');
      setErrorMsg('');
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
    const txt = vaultCredentials
      .map(c => `${c.target} | ${c.type.toUpperCase()} | ${c.username || 'N/A'} : ${c.secret}`)
      .join('\n');
    navigator.clipboard.writeText(txt);
    alert('Credenciales copiadas al portapapeles.');
  };

  const exportCME = () => {
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
    alert('Copiado al portapapeles!');
  };

  if (!isVaultUnlocked) {
    const isNew = !encryptedVaultData;

    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-8 text-center">
        <div className="w-16 h-16 bg-[#0b282c]/10 dark:bg-teal-900/30 text-[#0b282c] dark:text-teal-400 rounded-full flex items-center justify-center text-3xl mb-4 shadow-inner border border-[#0b282c]/20 dark:border-teal-500/50">
          🔒
        </div>
        <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase mb-2">Bóveda Cifrada</h2>
        <p className="text-xs text-slate-500 mb-6 max-w-[250px]">
          {isNew
            ? 'Crea una contraseña maestra para cifrar con AES-256 tus credenciales y hashes en el disco duro.'
            : 'Ingresa tu contraseña maestra para descifrar el contenido de la bóveda.'}
        </p>
        <input
          type="password"
          value={passwordVisible}
          onChange={e => handlePasswordChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') isNew ? handleSetMaster() : handleUnlock();
          }}
          placeholder="Contraseña Maestra..."
          autoComplete="off"
          spellCheck={false}
          className="w-full px-4 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded mb-2 text-sm font-mono dark:text-white outline-none focus:border-teal-500 text-center"
        />
        {errorMsg && <p className="text-red-500 text-xs font-bold mb-3">{errorMsg}</p>}
        <button
          onClick={isNew ? handleSetMaster : handleUnlock}
          className="w-full bg-[#0b282c] hover:bg-[#081e21] text-white px-4 py-2 rounded text-xs font-bold uppercase shadow-lg transition-colors"
        >
          {isNew ? 'Crear Bóveda' : 'Desbloquear'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase flex items-center">
          <span className="mr-2">🔓</span> Bóveda
        </h2>
        <div className="flex gap-1">
          <button onClick={lockVault} className="px-2 py-1 bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[9px] font-bold rounded">Bloquear</button>
          <button onClick={exportCME} className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[9px] font-bold rounded">Exportar CME</button>
          <button onClick={exportVault} className="px-2 py-1 bg-[#0b282c]/10 text-[#0b282c] dark:bg-[#0b282c]/50 dark:text-teal-400 text-[9px] font-bold rounded">Exportar Txt</button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-2 p-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded text-[10px] text-red-600 dark:text-red-400 font-bold">
          {errorMsg}
        </div>
      )}

      <div className="flex flex-col gap-2 mb-4 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder="IP/Servicio"
            className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white"
          />
          <select
            value={type}
            onChange={e => setType(e.target.value as any)}
            className="w-20 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white"
          >
            <option value="password">Pass</option>
            <option value="hash">Hash</option>
            <option value="key">Key</option>
          </select>
        </div>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Usuario"
          className="w-full px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            placeholder="Password / Hash"
            className="flex-1 px-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded outline-none dark:text-white font-mono"
          />
          <button
            onClick={handleAdd}
            className="px-3 py-1 bg-[#0b282c] text-white text-[11px] font-bold rounded hover:bg-[#081e21]"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-lg">
        <table className="w-full text-left text-[11px] text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-100 dark:bg-slate-800 uppercase font-bold text-[9px] text-slate-500">
            <tr>
              <th className="p-2">Data</th>
              <th className="p-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {vaultCredentials.map(c => (
              <tr key={c.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="p-2">
                  <div className="font-bold">
                    {c.target}{' '}
                    <span className="text-[8px] font-normal uppercase bg-slate-200 dark:bg-slate-700 px-1 rounded ml-1">
                      {c.type}
                    </span>
                  </div>
                  <div className="text-slate-500">User: {c.username || '-'}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="font-mono text-[#0b282c] dark:text-teal-400 break-all bg-teal-50 dark:bg-[#0b282c]/30 border border-teal-100 dark:border-[#0b282c]/50 px-1.5 py-0.5 rounded">
                      {revealed[c.id] ? c.secret : '••••••••••••'}
                    </div>
                    <button
                      onClick={() => toggleReveal(c.id)}
                      className="text-slate-400 hover:text-[#0b282c] dark:hover:text-teal-400 transition-colors"
                      title="Mostrar/Ocultar"
                    >
                      👁
                    </button>
                    <button
                      onClick={() => copyToClipboard(c.secret)}
                      className="text-slate-400 hover:text-[#0b282c] dark:hover:text-teal-400 transition-colors"
                      title="Copiar al portapapeles"
                    >
                      📋
                    </button>
                  </div>
                </td>
                <td className="p-2 text-center align-middle">
                  <button
                    onClick={() => handleRemove(c.id)}
                    className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1 rounded"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {vaultCredentials.length === 0 && (
              <tr>
                <td colSpan={2} className="p-5 text-center text-slate-400 italic">
                  Bóveda vacía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
