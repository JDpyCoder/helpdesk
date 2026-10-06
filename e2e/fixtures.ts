import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'

// Shared helpers and fixtures for every spec. Import `test` and `expect` from here
// instead of '@playwright/test' to get the `admin` and `agent` fixtures.

export type Role = 'ADMIN' | 'AGENT'

export type Credentials = {
  email: string
  password: string
  name: string
}

// Better Auth's session cookie (no `__Secure-` prefix: the test API runs on http)
export const SESSION_COOKIE = 'better-auth.session_token'

// The client origin the API trusts (CLIENT_ORIGIN in server/.env.test). Browsers send it
// on every POST, so API-level requests send it too.
export const CLIENT_ORIGIN = requireEnv('CLIENT_ORIGIN')

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set — playwright.config.ts loads it from server/.env.test`)
  return value
}

// The admin created by the seed in global setup
export function adminCredentials(): Credentials {
  return {
    email: requireEnv('SEED_ADMIN_EMAIL'),
    password: requireEnv('SEED_ADMIN_PASSWORD'),
    name: process.env.SEED_ADMIN_NAME ?? 'Admin',
  }
}

// Unique per call, so tests never collide on the shared database
export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`
}

// Creates a user directly in the test database (public sign-up is disabled), via
// server/src/create-test-user.ts. Values travel in env vars to avoid shell quoting.
export function createUser(options: { role?: Role; name?: string; email?: string; password?: string } = {}): Credentials {
  const role = options.role ?? 'AGENT'
  const user: Credentials = {
    email: options.email ?? uniqueEmail(role.toLowerCase()),
    password: options.password ?? `pw-${randomUUID()}`,
    name: options.name ?? `Test ${role === 'ADMIN' ? 'Admin' : 'Agent'} ${randomUUID().slice(0, 6)}`,
  }
  execFileSync('bun', ['src/create-test-user.ts'], {
    cwd: 'server',
    env: {
      ...process.env,
      E2E_USER_EMAIL: user.email,
      E2E_USER_PASSWORD: user.password,
      E2E_USER_NAME: user.name,
      E2E_USER_ROLE: role,
    },
    stdio: 'pipe',
  })
  return user
}

// Signs in through the login form and waits until the app shows the signed-in layout
export async function signIn(page: Page, user: Credentials) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

// Signs in through the API. Pass `page.request` / `context.request` to share the
// session cookie with the browser, or the `request` fixture for API-only tests.
export async function signInViaApi(request: APIRequestContext, user: Pick<Credentials, 'email' | 'password'>) {
  const res = await request.post('/api/auth/sign-in/email', {
    data: { email: user.email, password: user.password },
    headers: { Origin: CLIENT_ORIGIN },
  })
  expect(res.status(), await res.text()).toBe(200)
  return res
}

export async function signOutViaApi(request: APIRequestContext) {
  const res = await request.post('/api/auth/sign-out', { headers: { Origin: CLIENT_ORIGIN } })
  expect(res.status(), await res.text()).toBe(200)
  return res
}

type Fixtures = {
  // The seeded admin
  admin: Credentials
  // A fresh AGENT user created for this test
  agent: Credentials
}

export const test = base.extend<Fixtures>({
  admin: async ({}, use) => {
    await use(adminCredentials())
  },
  agent: async ({}, use) => {
    await use(createUser({ role: 'AGENT' }))
  },
})

export { expect }
