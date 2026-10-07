import { expect, signIn, signInViaApi, test } from './fixtures'

type ApiUser = { id: string; name: string; email: string; role: string; createdAt: string }

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
