import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base relativa: funciona en GitHub Pages (/estudiafacil/) y en cualquier hosting estático.
export default defineConfig({
  base: './',
  plugins: [react()],
})
