import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/rx19-draw-diagram-lab/',
  plugins: [react()],
})
