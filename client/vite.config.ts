import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Large libraries get chunks of their own: no chunk goes over Vite's 500 kB warning, and browsers keep
        // the vendor chunks cached across deploys, since only the app chunk changes. Higher priority matches first.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'charts', test: /node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+)[\\/]/, priority: 20 },
            { name: 'sentry', test: /node_modules[\\/]@sentry(-internal)?[\\/]/, priority: 20 },
            { name: 'vendor', test: /node_modules/, priority: 10 },
          ],
        },
      },
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
  // Component tests (React Testing Library); Playwright E2E specs live in the root e2e/
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
