import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Configuraciones recomendadas por Tauri para Vite
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'zustand'],
          ui_heavy: ['recharts', 'reactflow', '@uiw/react-md-editor'],
          terminal: ['@xterm/xterm', '@xterm/addon-fit']
        }
      }
    }
  }
})
