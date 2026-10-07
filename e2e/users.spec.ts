import { expect, failApiRoute, signIn, signInViaApi, test } from './fixtures'

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
    await expect(page.getByText('Loading users…')).toBeVisible()

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
