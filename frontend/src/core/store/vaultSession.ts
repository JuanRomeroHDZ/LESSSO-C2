// ==========================================================
// SESIÓN DE BÓVEDA — gestión efímera de la contraseña maestra
// ----------------------------------------------------------
// Este módulo mantiene la contraseña maestra FUERA del store
// de Zustand y FUERA del estado de React.
//
// Motivos:
//   1. Zustand se serializa a localStorage → la contraseña
//      NUNCA debe pasar por ahí.
//   2. React DevTools expone el estado de los componentes.
//      Un módulo cerrado no.
//   3. Zeroización explícita al bloquear la bóveda.
//
// La contraseña vive SOLO en este módulo (una variable local
// en un closure) y se borra con `clearVaultSession()`.
// ==========================================================

let _password: string | null = null;

/**
 * Guarda la contraseña maestra en memoria volátil.
 * Solo llamar desde unlockVault() / setMasterPassword().
 */
export function setVaultPassword(pwd: string): void {
  _password = pwd;
}

/**
 * Devuelve la contraseña actual, o null si la bóveda está bloqueada.
 */
export function getVaultPassword(): string | null {
  return _password;
}

/**
 * Comprueba si hay una contraseña activa.
 */
export function hasVaultPassword(): boolean {
  return _password !== null && _password.length > 0;
}

/**
 * Borra la contraseña de memoria.
 * Nota: en JS no podemos garantizar zeroización del heap,
 * pero al menos eliminamos la referencia para que el GC la
 * pueda recolectar y no quede accesible por closures.
 */
export function clearVaultSession(): void {
  if (_password !== null) {
    _password = '';
    _password = null;
  }
}
