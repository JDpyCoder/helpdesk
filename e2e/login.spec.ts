import { createUser, expect, test } from './fixtures'

test.describe('Login page', () => {
  test('renders the sign-in form', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByText('Sign in to your account')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email')
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    // Nothing to show before the first submit
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('shows required-field errors on an empty submit and sends no request', async ({ page }) => {
    const signInRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/sign-in')) signInRequests.push(req.url())
    })
    await page.goto('/login')

    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Enter a valid email address')).toBeVisible()
    await expect(page.getByText('Password is required')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Password')).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL('/login')
    expect(signInRequests).toEqual([])
  })

  for (const badEmail of ['not-an-email', 'missing-domain@', '@example.com', 'two@@example.com']) {
    test(`rejects the malformed email "${badEmail}" client-side`, async ({ page }) => {
      await page.goto('/login')

      await page.getByLabel('Email').fill(badEmail)
      await page.getByLabel('Password').fill('any-password')
      await page.getByRole('button', { name: 'Sign in' }).click()

      await expect(page.getByText('Enter a valid email address')).toBeVisible()
      await expect(page.getByText('Password is required')).toHaveCount(0)
      await expect(page).toHaveURL('/login')
    })
  }

  test('clears a field error once the field becomes valid', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Enter a valid email address')).toBeVisible()

    await page.getByLabel('Email').fill('someone@example.com')

    await expect(page.getByText('Enter a valid email address')).toHaveCount(0)
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'false')
    // The untouched password error stays
    await expect(page.getByText('Password is required')).toBeVisible()
  })

  test('disables the button and shows progress while signing in', async ({ page, admin }) => {
    // Hold the sign-in request until the pending state has been checked
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/auth/sign-in/email', async (route) => {
      await released
      await route.continue()
    })
    await page.goto('/login')
    await page.getByLabel('Email').fill(admin.email)
    await page.getByLabel('Password').fill(admin.password)

    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
    release()
    await expect(page).toHaveURL('/')
  })
})

test.describe('Successful sign-in', () => {
  test('admin lands on the home page and sees their name', async ({ page, admin }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(admin.email)
    await page.getByLabel('Password').fill(admin.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('navigation').getByText(admin.name, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect(page.getByText('Home', { exact: true })).toBeVisible()
  })

  test('pressing Enter in the password field submits the form', async ({ page, admin }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(admin.email)
    await page.getByLabel('Password').fill(admin.password)
    await page.getByLabel('Password').press('Enter')

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  test('treats the email as case-insensitive', async ({ page, admin }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(admin.email.toUpperCase())
    await page.getByLabel('Password').fill(admin.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('navigation').getByText(admin.name, { exact: true })).toBeVisible()
  })

  test('ignores whitespace around the email', async ({ page, admin }) => {
    await page.goto('/login')
    // The browser strips surrounding whitespace from type="email" inputs
    await page.getByLabel('Email').fill(`  ${admin.email}  `)
    await page.getByLabel('Password').fill(admin.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/')
  })

  test('an agent can sign in and sees their own name', async ({ page, agent }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(agent.email)
    await page.getByLabel('Password').fill(agent.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('navigation').getByText(agent.name, { exact: true })).toBeVisible()
  })
})

test.describe('Failed sign-in', () => {
  test('wrong password shows an error, stays on /login and creates no session', async ({ page, admin }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(admin.email)
    await page.getByLabel('Password').fill(`${admin.password}-wrong`)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()

    expect((await page.request.get('/api/me')).status()).toBe(401)
    const cookies = await page.context().cookies()
    expect(cookies.filter((c) => c.name.includes('session_token'))).toEqual([])
  })

  test('unknown email shows the same generic error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('nobody-here@example.com')
    await page.getByLabel('Password').fill('some-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    // Same message as a wrong password, so the form doesn't reveal which emails exist
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
    await expect(page).toHaveURL('/login')
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })

  test('the password is case-sensitive', async ({ page }) => {
    const user = createUser({ password: 'Case-Sensitive-Password' })
    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password.toLowerCase())
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('the form keeps the email and clears the error on a successful retry', async ({ page, admin }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(admin.email)
    await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue(admin.email)

    await page.getByLabel('Password').fill(admin.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toHaveCount(0)
  })
})
