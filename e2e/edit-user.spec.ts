import {
  CLIENT_ORIGIN,
  createUser,
  expect,
  signIn,
  signInViaApi,
  test,
  uniqueEmail,
  type Credentials,
} from './fixtures'
import type { APIRequestContext, Page } from '@playwright/test'

// Cancel/reset behaviour of the dialog is covered by client/src/components/EditUserDialog.test.tsx

type ApiUser = { id: string; name: string; email: string; role: string; createdAt: string }

const headers = { Origin: CLIENT_ORIGIN }

// Opens the users page and the edit dialog for `user`
async function openEditDialog(page: Page, user: Pick<Credentials, 'name'>) {
  await page.goto('/users')
  await page.getByRole('button', { name: `Edit ${user.name}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Edit user' })
  await expect(dialog).toBeVisible()
  return dialog
}

function userRow(page: Page, email: string) {
  return page.getByRole('table').getByRole('row').filter({ hasText: email })
}

// Status of a sign-in attempt, without asserting success
async function signInStatus(request: APIRequestContext, user: Pick<Credentials, 'email' | 'password'>) {
  const res = await request.post('/api/auth/sign-in/email', {
    data: { email: user.email, password: user.password },
    headers,
  })
  return res.status()
}

async function userIdByEmail(request: APIRequestContext, email: string) {
  const { users } = (await (await request.get('/api/users')).json()) as { users: ApiUser[] }
  const user = users.find((u) => u.email === email)
  expect(user, `no user with email ${email}`).toBeDefined()
  return user!.id
}

test.describe('Edit user dialog', () => {
  test('admin changes an agent\'s name and email and the table shows the new values', async ({ page, admin, agent }) => {
    const updated = { name: `Renamed Agent ${Date.now()}`, email: uniqueEmail('renamed') }
    await signIn(page, admin)

    const dialog = await openEditDialog(page, agent)
    await dialog.getByLabel('Name').fill(updated.name)
    await dialog.getByLabel('Email').fill(updated.email)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    await expect(userRow(page, updated.email).getByRole('cell')).toHaveText([
      updated.name,
      updated.email,
      'Agent',
      /\S/,
      '',
    ])
    await expect(userRow(page, agent.email)).toHaveCount(0)

    // Reopening shows the saved values from the refetched list
    await page.getByRole('button', { name: `Edit ${updated.name}` }).click()
    const reopened = page.getByRole('dialog', { name: 'Edit user' })
    await expect(reopened.getByLabel('Name')).toHaveValue(updated.name)
    await expect(reopened.getByLabel('Email')).toHaveValue(updated.email)
  })

  test('a new password replaces the old one', async ({ page, request, admin, agent }) => {
    const newPassword = 'brand-new-password'
    await signIn(page, admin)

    const dialog = await openEditDialog(page, agent)
    await dialog.getByLabel('Password').fill(newPassword)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    expect(await signInStatus(request, agent)).toBe(401)
    await signInViaApi(request, { email: agent.email, password: newPassword })
  })

  test('saving with a blank password keeps the current password', async ({ page, request, admin, agent }) => {
    const newName = `Kept Password ${Date.now()}`
    await signIn(page, admin)

    const dialog = await openEditDialog(page, agent)
    await dialog.getByLabel('Name').fill(newName)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    await expect(userRow(page, agent.email).getByRole('cell').first()).toHaveText(newName)

    await signInViaApi(request, agent)
  })

  test('changing a password signs that user out of their other sessions', async ({ page, browser, admin, agent }) => {
    const agentContext = await browser.newContext()
    const agentPage = await agentContext.newPage()
    await signIn(agentPage, agent)

    await signIn(page, admin)
    const dialog = await openEditDialog(page, agent)
    await dialog.getByLabel('Password').fill('revoking-password')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    await agentPage.reload()
    await expect(agentPage).toHaveURL('/login')
    expect((await agentPage.request.get('/api/me')).status()).toBe(401)

    // The admin's own session is untouched
    expect((await page.request.get('/api/me')).status()).toBe(200)
    await agentContext.close()
  })
})

test.describe('Users API: PATCH /api/users/:id', () => {
  test('updates the user for an admin, trimming the name and lowercasing the email',async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)
    const id = await userIdByEmail(request, agent.email)
    const email = uniqueEmail('api-updated')

    const res = await request.patch(`/api/users/${id}`, {
      data: { name: '  Api Updated  ', email: email.toUpperCase(), password: '' },
      headers,
    })

    expect(res.status(), await res.text()).toBe(200)
    const { user } = (await res.json()) as { user: ApiUser }
    expect(user).toMatchObject({ id, name: 'Api Updated', email, role: 'AGENT' })
    expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role'])
  })

  test('ignores a requested role change', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)
    const id = await userIdByEmail(request, agent.email)

    const res = await request.patch(`/api/users/${id}`, {
      data: { name: agent.name, email: agent.email, password: '', role: 'ADMIN' },
      headers,
    })

    expect(res.status()).toBe(200)
    expect((await res.json()).user.role).toBe('AGENT')
  })

  test('keeping the user\'s own email is not a conflict', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)
    const id = await userIdByEmail(request, agent.email)

    const res = await request.patch(`/api/users/${id}`, {
      data: { name: 'Same Email', email: agent.email, password: '' },
      headers,
    })

    expect(res.status(), await res.text()).toBe(200)
    expect((await res.json()).user).toMatchObject({ name: 'Same Email', email: agent.email })
  })

  test('returns 409 for another user\'s email, case-insensitively', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)
    const id = await userIdByEmail(request, agent.email)

    const res = await request.patch(`/api/users/${id}`, {
      data: { name: agent.name, email: admin.email.toUpperCase(), password: '' },
      headers,
    })

    expect(res.status()).toBe(409)
    expect(await res.json()).toEqual({ error: 'A user with this email already exists' })
  })

  test('returns 400 with field errors for an invalid body', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)
    const id = await userIdByEmail(request, agent.email)

    const res = await request.patch(`/api/users/${id}`, {
      data: { name: ' ab ', email: 'not-an-email', password: 'short' },
      headers,
    })

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Name must be at least 3 characters')
    expect(Object.keys(body.fieldErrors).sort()).toEqual(['email', 'name', 'password'])
  })

  test('returns 404 for an unknown id', async ({ request, admin }) => {
    await signInViaApi(request, admin)

    const res = await request.patch('/api/users/does-not-exist', {
      data: { name: 'Nobody Here', email: uniqueEmail('nobody'), password: '' },
      headers,
    })

    expect(res.status()).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })
  })

  test('an admin changing their own password keeps the current session but loses others', async ({ playwright }) => {
    // A separate admin, so the seeded admin's password never changes
    const selfAdmin = createUser({ role: 'ADMIN' })
    const baseURL = test.info().project.use.baseURL
    const current = await playwright.request.newContext({ baseURL })
    const other = await playwright.request.newContext({ baseURL })
    await signInViaApi(current, selfAdmin)
    await signInViaApi(other, selfAdmin)
    const id = await userIdByEmail(current, selfAdmin.email)

    const res = await current.patch(`/api/users/${id}`, {
      data: { name: selfAdmin.name, email: selfAdmin.email, password: 'self-changed-password' },
      headers,
    })

    expect(res.status(), await res.text()).toBe(200)
    expect((await current.get('/api/me')).status()).toBe(200)
    expect((await other.get('/api/me')).status()).toBe(401)
    await current.dispose()
    await other.dispose()
  })

  test('returns 403 Forbidden to an agent and changes nothing', async ({ request, admin, agent }) => {
    // Target another agent, not the seeded admin, so a regression can't break other specs
    const victim = createUser({ role: 'AGENT' })
    await signInViaApi(request, admin)
    const victimId = await userIdByEmail(request, victim.email)
    await signInViaApi(request, agent)

    const res = await request.patch(`/api/users/${victimId}`, {
      data: { name: 'Hijacked', email: victim.email, password: 'hijacked-password' },
      headers,
    })

    expect(res.status()).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    expect(await signInStatus(request, { email: victim.email, password: 'hijacked-password' })).toBe(401)
    await signInViaApi(request, victim)
  })

  test('returns 401 without a session', async ({ request, admin }) => {
    await signInViaApi(request, admin)
    const id = await userIdByEmail(request, admin.email)
    await request.post('/api/auth/sign-out', { headers })

    const res = await request.patch(`/api/users/${id}`, {
      data: { name: 'Anonymous', email: uniqueEmail('anon'), password: '' },
      headers,
    })

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })
})
