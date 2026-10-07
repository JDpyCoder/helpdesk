import { expect, signIn, test } from './fixtures'

test.describe('Route protection (signed out)', () => {
  for (const path of ['/', '/users', '/does-not-exist']) {
    test(`visiting ${path} redirects to /login`, async ({ page }) => {
      await page.goto(path)

      await expect(page).toHaveURL('/login')
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
      await expect(page.getByRole('navigation')).toHaveCount(0)
    })
  }

  test('shows a loading state while the session is being checked', async ({ page }) => {
    // Hold the session lookup so the pending state is observable
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/auth/get-session*', async (route) => {
      await released
      await route.continue()
    })

    await page.goto('/')

    await expect(page.getByRole('status', { name: 'Loading', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
    release()
    await expect(page).toHaveURL('/login')
  })
})

test.describe('Route protection (signed in)', () => {
  test('visiting /login redirects to the home page', async ({ page, admin }) => {
    await signIn(page, admin)

    await page.goto('/login')

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('an unknown route redirects to the home page', async ({ page, admin }) => {
    await signIn(page, admin)

    await page.goto('/does-not-exist')

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })
})
