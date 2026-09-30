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
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('zustand')) return 'vendor';
            if (id.includes('recharts') || id.includes('reactflow') || id.includes('@uiw/react-md-editor')) return 'ui_heavy';
            if (id.includes('xterm')) return 'terminal';
            return 'vendor_other';
          }
        }
      }
    }
  }
})
