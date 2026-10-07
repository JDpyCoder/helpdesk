import type { Page } from '@playwright/test'
import { createUser, expect, signIn, submitLoginForm, test } from './fixtures'

// TanStack Query keeps fetched data in memory for the life of the SPA, and NavBar clears it
// on sign-out. These tests switch users without reloading the page (a reload would empty the
// cache anyway and prove nothing), and check a marker on `window` to confirm no reload happened.

async function markPage(page: Page) {
  await page.evaluate(() => Object.assign(window, { __e2eNoReload: true }))
}

async function expectNoReload(page: Page) {
  expect(await page.evaluate(() => '__e2eNoReload' in window)).toBe(true)
}

async function signOutViaUi(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/login')
}

test.describe('Cached data across sign-out', () => {
  test('an agent signing in after an admin sees none of the admin\'s data', async ({ page, admin, agent }) => {
    await signIn(page, admin)
    await markPage(page)

    await page.getByRole('navigation').getByRole('link', { name: 'Users' }).click()
    await expect(page.getByRole('table').getByText(admin.email)).toBeVisible()

    await signOutViaUi(page)
    await submitLoginForm(page, agent)

    const nav = page.getByRole('navigation')
    await expect(nav.getByText(agent.name, { exact: true })).toBeVisible()
    await expect(nav.getByText(admin.name, { exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0)
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByText(admin.email)).toHaveCount(0)
    await expect(page.getByText(/Server is healthy/)).toBeVisible()
    await expectNoReload(page)
  })

  test('the next user gets a fresh users list, not the previous user\'s cached one', async ({ page, admin }) => {
    const secondAdmin = createUser({ role: 'ADMIN' })

    await signIn(page, admin)
    await markPage(page)
    await page.getByRole('navigation').getByRole('link', { name: 'Users' }).click()
    await expect(page.getByRole('table').getByText(admin.email)).toBeVisible()

    await signOutViaUi(page)

    // Hold the second admin's /api/users request until we've checked the page meanwhile
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    let requests = 0
    await page.route('**/api/users', async (route) => {
      requests++
      await released
      await route.continue()
    })

    await submitLoginForm(page, secondAdmin)
    await page.getByRole('navigation').getByRole('link', { name: 'Users' }).click()
    await expect(page).toHaveURL('/users')

    // With the cache cleared there is nothing to show until the new request finishes
    await expect.poll(() => requests).toBe(1)
    await expect(page.getByText('Loading users…')).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)

    release()
    const table = page.getByRole('table')
    await expect(table.getByRole('row').filter({ hasText: secondAdmin.email })).toBeVisible()
    await expect(page.getByText('Loading users…')).toHaveCount(0)
    await expectNoReload(page)
  })
})
