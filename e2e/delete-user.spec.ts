import {
  CLIENT_ORIGIN,
  createUser,
  expect,
  signIn,
  signInViaApi,
  submitLoginForm,
  test,
  type Credentials,
} from './fixtures'
import type { APIRequestContext, Page } from '@playwright/test'

// Error messages, the HTTP-status fallback and clearing errors on reopen are covered by
// client/src/components/DeleteUserDialog.test.tsx

type ApiUser = { id: string; name: string; email: string; role: string; createdAt: string }

const headers = { Origin: CLIENT_ORIGIN }

function userRow(page: Page, email: string) {
  return page.getByRole('table').getByRole('row').filter({ hasText: email })
}

// Opens the users page and the delete confirmation for `user`
async function openDeleteDialog(page: Page, user: Pick<Credentials, 'name'>) {
  await page.goto('/users')
  await page.getByRole('button', { name: `Delete ${user.name}` }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete user' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function userIdByEmail(request: APIRequestContext, email: string) {
  const { users } = (await (await request.get('/api/users')).json()) as { users: ApiUser[] }
  const user = users.find((u) => u.email === email)
  expect(user, `no user with email ${email}`).toBeDefined()
  return user!.id
}

async function listedEmails(request: APIRequestContext) {
  const { users } = (await (await request.get('/api/users')).json()) as { users: ApiUser[] }
  return users.map((u) => u.email)
}

// Deletes `email`'s user through the API as `request`'s (admin) session
async function deleteViaApi(request: APIRequestContext, email: string) {
  const id = await userIdByEmail(request, email)
  const res = await request.delete(`/api/users/${id}`, { headers })
  expect(res.status(), await res.text()).toBe(204)
  return id
}

test.describe('Delete user dialog', () => {
  test('admin deletes an agent: the dialog closes and the row is gone, also after a reload', async ({ page, admin, agent }) => {
    await signIn(page, admin)

    const dialog = await openDeleteDialog(page, agent)
    await expect(dialog).toContainText(
      `Delete ${agent.name} (${agent.email})? They will be signed out and can no longer sign in, and their tickets will be unassigned.`,
    )
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(dialog).toBeHidden()
    await expect(userRow(page, agent.email)).toHaveCount(0)
    // The admin's own row is unaffected
    await expect(userRow(page, admin.email)).toHaveCount(1)

    await page.reload()
    await expect(userRow(page, admin.email)).toHaveCount(1)
    await expect(userRow(page, agent.email)).toHaveCount(0)
  })
})

test.describe('Deleted user', () => {
  test('a signed-in agent is signed out when deleted', async ({ page, browser, admin, agent }) => {
    const agentContext = await browser.newContext()
    const agentPage = await agentContext.newPage()
    await signIn(agentPage, agent)

    await signIn(page, admin)
    const dialog = await openDeleteDialog(page, agent)
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toBeHidden()

    await agentPage.reload()
    await expect(agentPage).toHaveURL('/login')
    expect((await agentPage.request.get('/api/me')).status()).toBe(401)

    // The admin's own session is untouched
    expect((await page.request.get('/api/me')).status()).toBe(200)
    await agentContext.close()
  })

  test('cannot sign in with their old credentials', async ({ page, request, admin, agent }) => {
    await signInViaApi(request, admin)
    await deleteViaApi(request, agent.email)

    await page.goto('/login')
    await page.getByLabel('Email').fill(agent.email)
    await page.getByLabel('Password').fill(agent.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
    await expect(page).toHaveURL('/login')
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })

  test('their email can be reused for a new user', async ({ page, admin, agent }) => {
    const replacement = { name: 'Replacement Agent', email: agent.email, password: 'replacement-pw-123' }
    await signIn(page, admin)
    await deleteViaApi(page.request, agent.email)

    await page.goto('/users')
    await expect(userRow(page, agent.email)).toHaveCount(0)
    await page.getByRole('button', { name: 'New user' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create user' })
    await dialog.getByLabel('Name').fill(replacement.name)
    await dialog.getByLabel('Email').fill(replacement.email)
    await dialog.getByLabel('Password').fill(replacement.password)
    await dialog.getByRole('button', { name: 'Create user' }).click()

    await expect(dialog).toBeHidden()
    await expect(userRow(page, agent.email).getByRole('cell')).toHaveText([
      replacement.name,
      replacement.email,
      'Agent',
      /\S/,
      '',
    ])

    // The new account signs in with its own password, and is a different user
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login')
    await submitLoginForm(page, replacement)
    const me = await (await page.request.get('/api/me')).json()
    expect(me.user).toMatchObject({ email: agent.email, name: replacement.name, role: 'AGENT' })
  })
})

test.describe('Users API: DELETE /api/users/:id', () => {
  test('returns 204 with no body and removes the user from the list', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)
    const id = await userIdByEmail(request, agent.email)

    const res = await request.delete(`/api/users/${id}`, { headers })

    expect(res.status()).toBe(204)
    expect(await res.text()).toBe('')
    const { users } = (await (await request.get('/api/users')).json()) as { users: ApiUser[] }
    expect(users.map((u) => u.id)).not.toContain(id)
    expect(users.some((u) => u.email.includes(agent.email))).toBe(false)
  })

  test('returns 403 for an admin target and keeps them', async ({ request, admin }) => {
    // A separate admin, so a regression can never delete the seeded one
    const target = createUser({ role: 'ADMIN' })
    await signInViaApi(request, admin)
    const id = await userIdByEmail(request, target.email)

    const res = await request.delete(`/api/users/${id}`, { headers })

    expect(res.status()).toBe(403)
    expect(await res.json()).toEqual({ error: "Admins can't be deleted" })
    expect(await listedEmails(request)).toContain(target.email)
  })

  test('deleting the same user twice returns 404 the second time', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)
    const id = await deleteViaApi(request, agent.email)

    const res = await request.delete(`/api/users/${id}`, { headers })

    expect(res.status()).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })
  })

  test('returns 404 for an unknown id', async ({ request, admin }) => {
    await signInViaApi(request, admin)

    const res = await request.delete('/api/users/does-not-exist', { headers })

    expect(res.status()).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })
  })

  test('PATCH on a deleted user returns 404', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)
    const id = await deleteViaApi(request, agent.email)

    const res = await request.patch(`/api/users/${id}`, {
      data: { name: 'Back From The Dead', email: agent.email, password: 'resurrected-pw' },
      headers,
    })

    expect(res.status()).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })
    expect(await listedEmails(request)).not.toContain(agent.email)
  })

  test('returns 403 Forbidden to an agent and deletes nothing', async ({ request, admin, agent }) => {
    const victim = createUser({ role: 'AGENT' })
    await signInViaApi(request, admin)
    const victimId = await userIdByEmail(request, victim.email)
    await signInViaApi(request, agent)

    const res = await request.delete(`/api/users/${victimId}`, { headers })

    expect(res.status()).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    await signInViaApi(request, victim)
  })

  test('returns 401 without a session and deletes nothing', async ({ request, admin, agent }) => {
    await signInViaApi(request, admin)
    const id = await userIdByEmail(request, agent.email)
    await request.post('/api/auth/sign-out', { headers })

    const res = await request.delete(`/api/users/${id}`, { headers })

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    await signInViaApi(request, agent)
  })
})
