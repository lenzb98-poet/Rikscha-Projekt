import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative Pfade, damit der Build auch aus einem Unterordner
  // (oder direkt per Doppelklick) funktioniert.
  base: './',
  server: { port: 5173 },
})
