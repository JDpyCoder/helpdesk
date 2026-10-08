import {
  CLIENT_ORIGIN,
  expect,
  failApiRoute,
  signIn,
  signInViaApi,
  submitLoginForm,
  test,
  uniqueEmail,
} from './fixtures'
import type { Locator } from '@playwright/test'

type ApiUser = { id: string; name: string; email: string; role: string; createdAt: string }

async function fillCreateUserForm(dialog: Locator, values: { name: string; email: string; password: string }) {
  await dialog.getByLabel('Name').fill(values.name)
  await dialog.getByLabel('Email').fill(values.email)
  await dialog.getByLabel('Password').fill(values.password)
}

test.describe('Users page', () => {
  test('admin sees the users table with the admin and agent rows', async ({ page, admin, agent }) => {
    await signIn(page, admin)

    await page.goto('/users')

    await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toBeVisible()
    await expect(page.getByText('People who can sign in to the helpdesk')).toBeVisible()

    const table = page.getByRole('table')
    await expect(table.getByRole('columnheader')).toHaveText(['Name', 'Email', 'Role', 'Created'])

    const adminRow = table.getByRole('row').filter({ hasText: admin.email })
    await expect(adminRow.getByRole('cell')).toHaveText([admin.name, admin.email, 'Admin', /\S/])

    const agentRow = table.getByRole('row').filter({ hasText: agent.email })
    await expect(agentRow.getByRole('cell')).toHaveText([agent.name, agent.email, 'Agent', /\S/])
  })

  test('shows "No users found." when the API returns an empty list', async ({ page, admin }) => {
    await signIn(page, admin)
    await page.route('**/api/users', (route) => route.fulfill({ json: { users: [] } }))

    await page.goto('/users')

    await expect(page.getByText('No users found.')).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
  })

  test('shows an HTTP 500 error after retrying', async ({ page, admin }) => {
    test.slow() // 5xx is retried 3 times with 1s + 2s + 4s backoff before the error shows
    await signIn(page, admin)
    const users = await failApiRoute(page, '/api/users', 500)

    await page.goto('/users')

    // Retries happen behind the loading state
    await expect.poll(users.calls).toBeGreaterThanOrEqual(1)
    await expect(page.getByRole('status', { name: 'Loading users' })).toBeVisible()

    await expect(page.getByText('Could not load users (HTTP 500).')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('table')).toHaveCount(0)
    expect(users.calls()).toBe(4)
  })

  test('shows a 4xx error immediately without retrying', async ({ page, admin }) => {
    await signIn(page, admin)
    const users = await failApiRoute(page, '/api/users', 403)

    await page.goto('/users')

    // With retries the error would take ~7s to appear, past the default 5s expect timeout
    await expect(page.getByText('Could not load users (HTTP 403).')).toBeVisible()
    expect(users.calls()).toBe(1)
  })
})

test.describe('Users API: GET /api/users', () => {
  test('returns the user list to an admin without sensitive fields', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)

    const res = await request.get('/api/users')

    expect(res.status()).toBe(200)
    const body = (await res.json()) as { users: ApiUser[] }
    expect(Array.isArray(body.users)).toBe(true)

    expect(body.users).toContainEqual(
      expect.objectContaining({ name: admin.name, email: admin.email, role: 'ADMIN' }),
    )
    expect(body.users).toContainEqual(
      expect.objectContaining({ name: agent.name, email: agent.email, role: 'AGENT' }),
    )

    for (const user of body.users) {
      expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role'])
    }
  })

  test('returns 403 Forbidden to an agent', async ({ request, agent }) => {
    await signInViaApi(request, agent)

    const res = await request.get('/api/users')

    expect(res.status()).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  test('returns 401 without a session', async ({ request }) => {
    const res = await request.get('/api/users')

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })
})

test.describe('Create user dialog', () => {
  test('admin creates an agent who appears in the table and can sign in', async ({ page, admin }) => {
    const newUser = { name: 'Created Agent', email: uniqueEmail('created'), password: 'created-agent-pw' }
    await signIn(page, admin)
    await page.goto('/users')

    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create user' })
    await expect(dialog).toBeVisible()
    await fillCreateUserForm(dialog, newUser)
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog).toBeHidden()
    const row = page.getByRole('table').getByRole('row').filter({ hasText: newUser.email })
    await expect(row.getByRole('cell')).toHaveText([newUser.name, newUser.email, 'Agent', /\S/])

    // The new account works with the chosen password
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login')
    await submitLoginForm(page, newUser)
    const me = await (await page.request.get('/api/me')).json()
    expect(me.user).toMatchObject({ email: newUser.email, name: newUser.name, role: 'AGENT' })
  })

  test('shows the duplicate-email error and keeps the dialog open', async ({ page, admin, agent }) => {
    await signIn(page, admin)
    await page.goto('/users')

    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create user' })
    await fillCreateUserForm(dialog, { name: 'Duplicate Agent', email: agent.email, password: 'duplicate-pw-123' })
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog.getByRole('alert')).toHaveText('A user with this email already exists')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Email')).toHaveValue(agent.email)

    // Still exactly one row for that email
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('table').getByRole('row').filter({ hasText: agent.email })).toHaveCount(1)
  })

  test('Cancel closes the dialog without creating a user', async ({ page, admin }) => {
    const email = uniqueEmail('cancelled')
    await signIn(page, admin)
    await page.goto('/users')

    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create user' })
    await fillCreateUserForm(dialog, { name: 'Cancelled Agent', email, password: 'cancelled-pw-123' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect(dialog).toBeHidden()
    const { users } = (await (await page.request.get('/api/users')).json()) as { users: ApiUser[] }
    expect(users.map((u) => u.email)).not.toContain(email)
  })

  test('has no password-type input for autofill to target, and fields start empty', async ({ page, admin }) => {
    await signIn(page, admin)
    await page.goto('/users')

    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create user' })
    await expect(dialog).toBeVisible()

    // Browsers offer saved credentials for type="password" inputs; the dialog has none
    await expect(dialog.locator('input[type="password"]')).toHaveCount(0)
    for (const label of ['Name', 'Email', 'Password']) {
      const input = dialog.getByLabel(label)
      await expect(input).toBeEditable()
      await expect(input).toHaveValue('')
    }
  })
})

test.describe('Users API: POST /api/users', () => {
  const headers = { Origin: CLIENT_ORIGIN }

  test('creates an AGENT for an admin, ignoring a requested role', async ({ request, admin }) => {
    await signInViaApi(request, admin)
    const email = uniqueEmail('api-created')

    const res = await request.post('/api/users', {
      data: { name: '  Api Agent  ', email: email.toUpperCase(), password: 'api-agent-pw', role: 'ADMIN' },
      headers,
    })

    expect(res.status(), await res.text()).toBe(201)
    const { user } = (await res.json()) as { user: ApiUser }
    expect(user).toMatchObject({ name: 'Api Agent', email, role: 'AGENT' })
    expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role'])

    // The account can sign in with the given password
    await signInViaApi(request, { email, password: 'api-agent-pw' })
    expect((await (await request.get('/api/me')).json()).user).toMatchObject({ email, role: 'AGENT' })
  })

  test('returns 409 for an email that already exists, case-insensitively', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)

    const res = await request.post('/api/users', {
      data: { name: 'Duplicate', email: agent.email.toUpperCase(), password: 'duplicate-pw' },
      headers,
    })

    expect(res.status()).toBe(409)
    expect(await res.json()).toEqual({ error: 'A user with this email already exists' })
  })

  test('returns 400 with field errors for an invalid body', async ({ request, admin }) => {
    await signInViaApi(request, admin)

    const res = await request.post('/api/users', {
      data: { name: ' ab ', email: 'not-an-email', password: 'short' },
      headers,
    })

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Name must be at least 3 characters')
    expect(body.fieldErrors).toEqual({
      name: ['Name must be at least 3 characters'],
      email: ['Enter a valid email address'],
      password: ['Password must be at least 8 characters'],
    })
  })

  test('returns 400 for a password longer than 128 characters', async ({ request, admin }) => {
    await signInViaApi(request, admin)

    const res = await request.post('/api/users', {
      data: { name: 'Long Password', email: uniqueEmail('long-pw'), password: 'x'.repeat(129) },
      headers,
    })

    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('Password must be at most 128 characters')
  })

  test('returns 403 Forbidden to an agent and creates no user', async ({ request, agent }) => {
    await signInViaApi(request, agent)
    const email = uniqueEmail('agent-attempt')

    const res = await request.post('/api/users', {
      data: { name: 'Sneaky Agent', email, password: 'sneaky-agent-pw' },
      headers,
    })

    expect(res.status()).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    const signInRes = await request.post('/api/auth/sign-in/email', {
      data: { email, password: 'sneaky-agent-pw' },
      headers,
    })
    expect(signInRes.status()).toBe(401)
  })

  test('returns 401 without a session', async ({ request }) => {
    const res = await request.post('/api/users', {
      data: { name: 'Anonymous', email: uniqueEmail('anon'), password: 'anonymous-pw' },
      headers,
    })

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })
})
