import { expect, signIn, test } from './fixtures'

test.describe('Admin role', () => {
  test('sees the Users link and can open the users page', async ({ page, admin }) => {
    await signIn(page, admin)

    await page.getByRole('navigation').getByRole('link', { name: 'Users' }).click()

    await expect(page).toHaveURL('/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  })

  test('can open /users directly', async ({ page, admin }) => {
    await signIn(page, admin)

    await page.goto('/users')

    await expect(page).toHaveURL('/users')
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  })

  test('/api/me reports the ADMIN role', async ({ page, admin }) => {
    await signIn(page, admin)

    const body = await (await page.request.get('/api/me')).json()
    expect(body.user.role).toBe('ADMIN')
  })
})

test.describe('Agent role', () => {
  test('does not see the Users link', async ({ page, agent }) => {
    await signIn(page, agent)

    const nav = page.getByRole('navigation')
    await expect(nav.getByText(agent.name, { exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Helpdesk' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0)
  })

  test('is redirected to the home page when visiting /users directly', async ({ page, agent }) => {
    await signIn(page, agent)

    await page.goto('/users')

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('/api/me reports the AGENT role', async ({ page, agent }) => {
    await signIn(page, agent)

    const body = await (await page.request.get('/api/me')).json()
    expect(body.user).toMatchObject({ email: agent.email, name: agent.name, role: 'AGENT' })
  })
})
