import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Landing visitors never download the operational app (and vice versa).
        manualChunks: { supabase: ['@supabase/supabase-js'], motion: ['framer-motion'] },
      },
    },
  },
});
