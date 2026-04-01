import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    // Chunk splitting for faster initial load
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          state: ['zustand'],
        },
      },
    },
    // Reduce chunk size warning threshold
    chunkSizeWarningLimit: 600,
  },
})
