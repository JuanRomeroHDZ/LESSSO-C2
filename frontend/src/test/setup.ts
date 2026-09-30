import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock básico para Tauri Core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
}))

// Mock para Eventos de Tauri
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
  emit: vi.fn(() => Promise.resolve()),
}))

// Mock para Dialog de Tauri
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
  message: vi.fn(() => Promise.resolve()),
}))

// Mock para FS de Tauri
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(() => Promise.resolve('')),
  writeTextFile: vi.fn(() => Promise.resolve()),
}))

// Mock para Shell de Tauri
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(() => Promise.resolve()),
  Command: {
    create: vi.fn(() => ({
      execute: vi.fn(() => Promise.resolve({ code: 0, stdout: '', stderr: '' })),
    })),
  },
}))

// Mock window.matchMedia (usado por algunas librerías de UI)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), 
    removeListener: vi.fn(), 
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
