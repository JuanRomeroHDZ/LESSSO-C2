import { useState, useRef, useEffect } from 'react';
import { useScanStore } from '../../core/store/useScanStore';
import { Lock, Unlock, FileOutput, TerminalSquare, Flame } from 'lucide-react';
import { VaultLockScreen } from './components/VaultLockScreen';
import { VaultForm } from './components/VaultForm';
import { VaultTable } from './components/VaultTable';
import type { VaultCred } from '../../core/store/vaultStore';

export function VaultWorkspace() {
  const {
    vaultName, vaultCredentials, addVaultCred, updateVaultCred, removeVaultCred, isVaultUnlocked,
    encryptedVaultData, setMasterPassword, unlockVault, lockVault, destroyVault
  } = useScanStore();

  const [target, setTarget] = useState('');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [type, setType] = useState<'hash' | 'password' | 'key'>('password');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const [vaultNameInput, setVaultNameInput] = useState('');
  const passwordRef = useRef('');
  const [passwordVisible, setPasswordVisible] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    return () => { passwordRef.current = ''; setPasswordVisible(''); };
  }, []);

  const handlePasswordChange = (value: string) => {
    passwordRef.current = value;
    setPasswordVisible(value);
  };

  const clearPassword = () => { passwordRef.current = ''; setPasswordVisible(''); };

  const handleUnlock = async () => {
    const pwd = passwordRef.current;
    if (!pwd) { setErrorMsg('Introduce la contraseña.'); return; }
    const success = await unlockVault(pwd);
    if (!success) { setErrorMsg('Contraseña incorrecta.'); clearPassword(); }   
    else { setErrorMsg(''); clearPassword(); }
  };

  const handleSetMaster = async () => {
    const pwd = passwordRef.current;
    if (pwd.length < 4) { setErrorMsg('Contraseña muy corta (Mín. 4)'); return; }
    try {
      await setMasterPassword(vaultNameInput || 'Bóveda Táctica', pwd);
      setErrorMsg('');
      clearPassword();
    } catch (e) {
      console.error('setMasterPassword falló:', e);
      setErrorMsg('Error creando la bóveda.');
    }
  };

  const handleDestroy = () => {
    destroyVault();
    setErrorMsg('');
    clearPassword();
    setVaultNameInput('');
  };

  const handleAdd = async () => {
    if (!target || !secret) return;
    try {
      await addVaultCred({ target, username, secret, type, notes, tags, status: 'unknown' });
      setUsername(''); setSecret(''); setNotes(''); setTags([]); setErrorMsg('');
    } catch (e: any) {
      setErrorMsg(e.message || 'Error al añadir credencial');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  const handleUpdate = async (id: string, patch: Partial<VaultCred>) => {
    try {
      await updateVaultCred(id, patch);
    } catch (e: any) {
      setErrorMsg(e.message || 'Error al actualizar credencial');
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
    const txt = vaultCredentials.map((c: VaultCred) => `${c.target} | ${c.type.toUpperCase()} | ${c.username || 'N/A'} : ${c.secret}`).join('\n');
    navigator.clipboard.writeText(txt);
    alert('Credenciales copiadas al portapapeles.');
  };

  const exportCME = () => {
    const cmeCmds = vaultCredentials
      .filter((c: VaultCred) => c.type === 'password' || c.type === 'hash')
      .map((c: VaultCred) => `crackmapexec smb ${c.target} -u '${c.username || 'Administrator'}' -p '${c.secret}'`)
      .join('\n');
    navigator.clipboard.writeText(cmeCmds);
    alert('Comandos CME copiados!');
  };

  const exportHashcat = () => {
    const hashes = vaultCredentials
      .filter((c: VaultCred) => c.type === 'hash')
      .map((c: VaultCred) => c.username ? `${c.username}:${c.secret}` : c.secret)
      .join('\n');
    if (!hashes) { alert('No hay hashes en la bóveda.'); return; }
    navigator.clipboard.writeText(hashes);
    alert('Hashes copiados para Hashcat/John (user:hash).');
  };

  const toggleReveal = (id: string) => setRevealed(prev => ({ ...prev, [id]: !prev[id] }));
  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  if (!isVaultUnlocked) {
    return (
      <VaultLockScreen   
        isNew={!encryptedVaultData}
        vaultNameValue={vaultNameInput}
        passwordVisible={passwordVisible}
        errorMsg={errorMsg}
        onNameChange={setVaultNameInput}
        onPasswordChange={handlePasswordChange}
        onUnlock={handleUnlock}
        onSetMaster={handleSetMaster}
        onDestroy={handleDestroy}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#020617] border-r border-slate-200 dark:border-slate-800/80 p-4 min-w-0">
      <div className="flex flex-col gap-3 mb-4 sm:mb-6">
        <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2 shrink-0">
          <Unlock size={16} className="text-teal-500" /> {vaultName}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <button onClick={lockVault} className="justify-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors flex items-center gap-1.5"><Lock size={12}/> Bloquear</button>
          <button onClick={exportCME} className="justify-center px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors flex items-center gap-1.5"><TerminalSquare size={12}/> Wordlist CME</button>
          <button onClick={exportHashcat} className="justify-center px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors flex items-center gap-1.5"><Flame size={12}/> Hashcat JTR</button>
          <button onClick={exportVault} className="justify-center px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/20 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors flex items-center gap-1.5"><FileOutput size={12}/> Exportar Bóveda</button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[11px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-2">
          {errorMsg}
        </div>
      )}

      <div className="shrink-0">
        <VaultForm   
          target={target} setTarget={setTarget}
          type={type} setType={setType}
          username={username} setUsername={setUsername}
          secret={secret} setSecret={setSecret}
          tags={tags} setTags={setTags}
          onAdd={handleAdd}
        />
      </div>

      <div className="flex-1 min-h-0 mt-4 overflow-hidden">
        <VaultTable   
          credentials={vaultCredentials}
          revealed={revealed}
          onToggleReveal={toggleReveal}
          onCopy={copyToClipboard}
          onRemove={handleRemove}
          onUpdate={handleUpdate}
        />
      </div>
    </div>
  );
}
