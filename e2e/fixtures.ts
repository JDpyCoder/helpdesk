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

// The bearer token POST /api/inbound-email requires (INBOUND_EMAIL_SECRET in server/.env.test)
export function inboundEmailHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${requireEnv('INBOUND_EMAIL_SECRET')}` }
}

// Unique per call, so tests never collide on ticket_message.messageId
export function uniqueMessageId(prefix = 'msg'): string {
  return `<${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}@mail.example.com>`
}

export type StoredTicket = {
  id: number
  subject: string
  fromEmail: string
  fromName: string
  status: 'OPEN' | 'RESOLVED' | 'CLOSED'
  category: string | null
  messages: { id: number; ticketId: number; messageId: string | null; fromEmail: string; fromName: string; body: string; receivedAt: string }[]
}

// Reads a ticket and its messages straight from the test database (there is no ticket
// API yet), via server/src/read-test-ticket.ts. Returns null if it doesn't exist.
// Pass `setStatus` to change the ticket's status in the database before reading it.
export function readTicket(id: number, setStatus?: StoredTicket['status']): StoredTicket | null {
  const out = execFileSync('bun', ['src/read-test-ticket.ts'], {
    cwd: 'server',
    env: { ...process.env, E2E_TICKET_ID: String(id), ...(setStatus && { E2E_TICKET_SET_STATUS: setStatus }) },
    stdio: 'pipe',
  })
  return JSON.parse(out.toString('utf8')) as StoredTicket | null
}

export type TicketCategory = 'GENERAL_QUESTION' | 'TECHNICAL_QUESTION' | 'REFUND_REQUEST'

// Sets fields no API can change yet (status, AI category, assignee by email) directly in
// the test database, via the same script as readTicket, and returns the updated ticket.
export function setTicketFields(
  id: number,
  fields: { status?: StoredTicket['status']; category?: TicketCategory; assigneeEmail?: string },
): StoredTicket {
  const out = execFileSync('bun', ['src/read-test-ticket.ts'], {
    cwd: 'server',
    env: {
      ...process.env,
      E2E_TICKET_ID: String(id),
      ...(fields.status && { E2E_TICKET_SET_STATUS: fields.status }),
      ...(fields.category && { E2E_TICKET_SET_CATEGORY: fields.category }),
      ...(fields.assigneeEmail && { E2E_TICKET_SET_ASSIGNEE_EMAIL: fields.assigneeEmail }),
    },
    stdio: 'pipe',
  })
  const ticket = JSON.parse(out.toString('utf8')) as StoredTicket | null
  if (!ticket) throw new Error(`Ticket ${id} does not exist`)
  return ticket
}

// Delivers an email through the inbound webhook as a brand-new ticket and returns its id
export async function createTicketViaEmail(
  request: APIRequestContext,
  email: { subject: string; fromEmail?: string; fromName?: string; text?: string },
): Promise<number> {
  const res = await request.post('/api/inbound-email', {
    data: {
      from: { email: email.fromEmail ?? uniqueEmail('customer'), name: email.fromName ?? 'Casey Customer' },
      subject: email.subject,
      text: email.text ?? 'Hello, I need some help please.',
      messageId: uniqueMessageId(),
    },
    headers: inboundEmailHeaders(),
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).ticketId as number
}

// Signs in through the login form and waits until the app shows the signed-in layout
export async function signIn(page: Page, user: Credentials) {
  await page.goto('/login')
  await submitLoginForm(page, user)
}

// Like signIn, but uses the login form already on screen instead of loading /login, so
// the SPA (and its in-memory query cache) is not reloaded
export async function submitLoginForm(page: Page, user: Credentials) {
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

// Makes every browser request to `path` (e.g. '/api/health') fail with `status`.
// `calls()` reports how many requests the app made, e.g. to check retries.
export async function failApiRoute(page: Page, path: string, status: number) {
  let count = 0
  await page.route(`**${path}`, async (route) => {
    count++
    await route.fulfill({ status, json: { error: `Mocked ${status}` } })
  })
  return { calls: () => count }
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
