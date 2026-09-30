import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import {
  setVaultPassword,
  getVaultPassword,
  hasVaultPassword,
  clearVaultSession,
} from './vaultSession'
import type { VaultCred } from './scanStore'

export type { VaultCred }

export interface VaultState {
  vaultCredentials: VaultCred[];
  encryptedVaultData: string;
  isVaultUnlocked: boolean;

  unlockVault: (pwd: string) => Promise<boolean>;
  lockVault: () => void;
  setMasterPassword: (pwd: string) => Promise<void>;
  addVaultCred: (cred: Omit<VaultCred, 'id'>) => Promise<void>;
  removeVaultCred: (id: string) => Promise<void>;
}

export const useVaultStore = create<VaultState>()(
  persist(
    (set, get) => ({
      vaultCredentials: [],
      encryptedVaultData: '',
      isVaultUnlocked: false,

      unlockVault: async (pwd: string) => {
        const s = get();
        if (!s.encryptedVaultData) {
          console.error('unlockVault: no hay bóveda cifrada que desbloquear');
          return false;
        }
        try {
          const decrypted = await invoke<string>('decrypt_vault', {
            encryptedData: s.encryptedVaultData,
            password: pwd,
          });
          const creds = JSON.parse(decrypted) as VaultCred[];
          setVaultPassword(pwd);
          set({
            vaultCredentials: creds,
            isVaultUnlocked: true,
          });
          return true;
        } catch (e) {
          console.error('unlockVault: descifrado falló', e);
          return false;
        }
      },

      lockVault: () => {
        clearVaultSession();
        set({
          vaultCredentials: [],
          isVaultUnlocked: false,
        });
      },

      setMasterPassword: async (pwd: string) => {
        const s = get();
        const toEncrypt = JSON.stringify(s.vaultCredentials);
        const encrypted = await invoke<string>('encrypt_vault', {
          data: toEncrypt,
          password: pwd,
        });
        setVaultPassword(pwd);
        set({
          encryptedVaultData: encrypted,
          isVaultUnlocked: true,
        });
      },

      addVaultCred: async (cred) => {
        const s = get();
        if (!hasVaultPassword()) {
          throw new Error('Bóveda bloqueada o sin contraseña en sesión');
        }
        const pwd = getVaultPassword()!;
        const newCreds = [
          ...s.vaultCredentials,
          { ...cred, id: Date.now().toString() },
        ];
        const encrypted = await invoke<string>('encrypt_vault', {
          data: JSON.stringify(newCreds),
          password: pwd,
        });
        set({
          vaultCredentials: newCreds,
          encryptedVaultData: encrypted,
        });
      },

      removeVaultCred: async (id) => {
        const s = get();
        if (!hasVaultPassword()) {
          throw new Error('Bóveda bloqueada o sin contraseña en sesión');
        }
        const pwd = getVaultPassword()!;
        const newCreds = s.vaultCredentials.filter(c => c.id !== id);
        const encrypted = await invoke<string>('encrypt_vault', {
          data: JSON.stringify(newCreds),
          password: pwd,
        });
        set({
          vaultCredentials: newCreds,
          encryptedVaultData: encrypted,
        });
      },
    }),
    {
      name: 'lessso-c2-vaultStore',
      partialize: (state) => ({
        encryptedVaultData: state.encryptedVaultData,
      }),
    }
  )
)
