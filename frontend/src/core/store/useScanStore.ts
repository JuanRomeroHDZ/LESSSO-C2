// ==========================================================
// WRAPPER DE COMPATIBILIDAD
// ----------------------------------------------------------
// Este archivo mantiene la API `useScanStore()` que usan
// los componentes desde la Fase 3.
// ==========================================================

import { useScanStoreLocal } from './scanStore'
import { useVaultStore } from './vaultStore'
import { useUiStore } from './uiStore'
import { useNetworkStore } from './networkStore'
import { useArsenalStore } from './arsenalStore'
import { useRedteamStore } from './redteamStore'

import type { HostInfo, PortInfo, ScriptInfo, SavedProfile } from './scanStore'
import type { VaultCred } from './vaultStore' // <-- AHORA VIENE DE LA BÓVEDA
import type { BackendStatus } from './networkStore'

export type { HostInfo, PortInfo, ScriptInfo, SavedProfile, VaultCred, BackendStatus }

export function useScanStore() {
  const scan = useScanStoreLocal();
  const vault = useVaultStore();
  const ui = useUiStore();
  const network = useNetworkStore();
  const arsenal = useArsenalStore();
  const redteam = useRedteamStore();

  return { ...scan, ...vault, ...ui, ...network, ...arsenal, ...redteam };
}

useScanStore.getState = () => ({
  ...useScanStoreLocal.getState(),
  ...useVaultStore.getState(),
  ...useUiStore.getState(),
  ...useNetworkStore.getState(),
  ...useArsenalStore.getState(),
  ...useRedteamStore.getState(),
});

useScanStore.setState = (
  updater:
    | Partial<Record<string, any>>
    | ((state: Record<string, any>) => Partial<Record<string, any>>)
) => {
  const currentState = useScanStore.getState();
  const updates =
    typeof updater === 'function' ? updater(currentState) : updater;

  if (!updates) return;

  const scanKeys = new Set(Object.keys(useScanStoreLocal.getState()));
  const vaultKeys = new Set(Object.keys(useVaultStore.getState()));
  const uiKeys = new Set(Object.keys(useUiStore.getState()));
  const networkKeys = new Set(Object.keys(useNetworkStore.getState()));
  const arsenalKeys = new Set(Object.keys(useArsenalStore.getState()));
  const redteamKeys = new Set(Object.keys(useRedteamStore.getState()));

  const scanUpdates: Record<string, any> = {};
  const vaultUpdates: Record<string, any> = {};
  const uiUpdates: Record<string, any> = {};
  const networkUpdates: Record<string, any> = {};
  const arsenalUpdates: Record<string, any> = {};
  const redteamUpdates: Record<string, any> = {};

  for (const key of Object.keys(updates)) {
    const value = (updates as Record<string, any>)[key];
    if (scanKeys.has(key)) scanUpdates[key] = value;
    if (vaultKeys.has(key)) vaultUpdates[key] = value;
    if (uiKeys.has(key)) uiUpdates[key] = value;
    if (networkKeys.has(key)) networkUpdates[key] = value;
    if (arsenalKeys.has(key)) arsenalUpdates[key] = value;
    if (redteamKeys.has(key)) redteamUpdates[key] = value;
  }

  if (Object.keys(scanUpdates).length > 0) useScanStoreLocal.setState(scanUpdates);
  if (Object.keys(vaultUpdates).length > 0) useVaultStore.setState(vaultUpdates);
  if (Object.keys(uiUpdates).length > 0) useUiStore.setState(uiUpdates);
  if (Object.keys(networkUpdates).length > 0) useNetworkStore.setState(networkUpdates);
  if (Object.keys(arsenalUpdates).length > 0) useArsenalStore.setState(arsenalUpdates);
  if (Object.keys(redteamUpdates).length > 0) useRedteamStore.setState(redteamUpdates);
};
