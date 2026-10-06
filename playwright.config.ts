import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { defineConfig, devices } from '@playwright/test'

// e2e runs against their own API (:3001), client (:5174) and database, so they
// never touch the dev servers or dev data. All values come from server/.env.test.
const envFile = 'server/.env.test'
if (!existsSync(envFile)) {
  throw new Error(`${envFile} is missing — copy server/.env.test.example and fill it in`)
}
const testEnv = parseEnv(readFileSync(envFile, 'utf8')) as Record<string, string>

const dbName = new URL(testEnv.DATABASE_URL).pathname.slice(1)
if (!dbName.endsWith('_test')) {
  throw new Error(`DATABASE_URL in ${envFile} must point at a database ending in "_test" (got "${dbName}")`)
}

// Global setup and the servers below inherit these
Object.assign(process.env, testEnv)

const apiUrl = testEnv.BETTER_AUTH_URL
const clientUrl = testEnv.CLIENT_ORIGIN

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Traces, screenshots and other per-test artifacts
  outputDir: './e2e/test-results',
  // Tests share one database, so run them one at a time
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: clientUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'API',
      command: 'bun src/index.ts',
      cwd: 'server',
      // Not /api/health: servers start before globalSetup, so on a first run the test
      // database doesn't exist yet and the health check would never pass
      url: `${apiUrl}/api/auth/ok`,
      env: { ...testEnv, NODE_ENV: 'test' },
      // Never reuse: a server already on this port might be wired to the dev database
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'Client',
      command: `bun run dev --port ${new URL(clientUrl).port} --strictPort`,
      cwd: 'client',
      url: clientUrl,
      env: { API_PROXY_TARGET: apiUrl },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
