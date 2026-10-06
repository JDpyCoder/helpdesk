import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the Express server during development. xfwd adds
      // X-Forwarded-For so the server rate-limits per browser IP, not per proxy.
      // API_PROXY_TARGET lets Playwright point a second dev server at the test API.
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        xfwd: true,
      },
    },
  },
})
