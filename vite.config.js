import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Hosted at https://strawhatmuse-ops.github.io/dropvault/
  base: '/dropvault/',
  plugins: [react()],
})
