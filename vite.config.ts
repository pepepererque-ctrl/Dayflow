import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  // Rutas relativas: la app funciona igual en la raíz de un dominio que en una subcarpeta.
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        // Sync is opt-in, so keep the Supabase client out of the boot path.
        manualChunks: { supabase: ['@supabase/supabase-js'] },
      },
    },
  },
  server: { port: 5174, open: false },
})
