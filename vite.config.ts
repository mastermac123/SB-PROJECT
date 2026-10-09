import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true, // reachable from phones on the same Wi-Fi for testing
    // share.bat gives a temporary https link (Cloudflare quick tunnel) for testing on phones
    allowedHosts: ['.trycloudflare.com'],
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
})
