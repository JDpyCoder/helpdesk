import { CLIENT_ORIGIN, SESSION_COOKIE, expect, signIn, signInViaApi, test } from './fixtures'

test.describe('Session persistence', () => {
  test('reloading the page keeps the user signed in', async ({ page, admin }) => {
    await signIn(page, admin)

    await page.reload()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('navigation').getByText(admin.name, { exact: true })).toBeVisible()
  })

  test('a new tab in the same browser context shares the session', async ({ page, context, admin }) => {
    await signIn(page, admin)

    const secondTab = await context.newPage()
    await secondTab.goto('/')

    await expect(secondTab).toHaveURL('/')
    await expect(secondTab.getByRole('navigation').getByText(admin.name, { exact: true })).toBeVisible()
  })

  test('a fresh browser context is signed out', async ({ page, browser, admin }) => {
    await signIn(page, admin)

    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    await otherPage.goto('/')

    await expect(otherPage).toHaveURL('/login')
    await otherContext.close()
  })

  test('the session cookie is httpOnly and SameSite=Lax', async ({ page, admin }) => {
    await signIn(page, admin)

    const cookie = (await page.context().cookies()).find((c) => c.name === SESSION_COOKIE)
    expect(cookie).toBeDefined()
    expect(cookie!.httpOnly).toBe(true)
    expect(cookie!.sameSite).toBe('Lax')
  })

  test('/api/me returns the signed-in user without the session token', async ({ page, admin }) => {
    await signIn(page, admin)

    const res = await page.request.get('/api/me')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.user).toMatchObject({ email: admin.email.toLowerCase(), name: admin.name, role: 'ADMIN' })
    expect(body.session.userId).toBe(body.user.id)
    expect(body.session).not.toHaveProperty('token')
  })
})

test.describe('Sign out', () => {
  test('returns to the login page', async ({ page, admin }) => {
    await signIn(page, admin)

    await page.getByRole('button', { name: 'Sign out' }).click()

    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  })

  test('protected routes redirect to /login afterwards', async ({ page, admin }) => {
    await signIn(page, admin)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login')

    await page.goto('/')
    await expect(page).toHaveURL('/login')
    await page.goto('/users')
    await expect(page).toHaveURL('/login')
  })

  test('/api/me returns 401 afterwards', async ({ page, admin }) => {
    await signIn(page, admin)
    expect((await page.request.get('/api/me')).status()).toBe(200)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login')

    expect((await page.request.get('/api/me')).status()).toBe(401)
  })

  test('the back button does not expose protected content', async ({ page, admin }) => {
    await signIn(page, admin)
    await page.getByRole('link', { name: 'Users' }).click()
    await expect(page).toHaveURL('/users')

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login')

    await page.goBack()
    await expect(page).toHaveURL('/login')
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
    await expect(page.getByText(admin.name, { exact: true })).toHaveCount(0)
  })
})

test.describe('Session revocation', () => {
  test('signing out invalidates a copied session cookie immediately', async ({ page, browser, admin }) => {
    await signIn(page, admin)
    const cookies = await page.context().cookies()

    // A second browser holding a copy of the same session cookie
    const other = await browser.newContext()
    await other.addCookies(cookies)
    const otherPage = await other.newPage()
    await otherPage.goto('/')
    await expect(otherPage.getByRole('button', { name: 'Sign out' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/login')

    // The session row is gone, so the copied cookie no longer works anywhere
    expect((await other.request.get('/api/me')).status()).toBe(401)
    await otherPage.reload()
    await expect(otherPage).toHaveURL('/login')
    await other.close()
  })

  test('revoking other sessions signs out other devices but not the current one', async ({ browser, agent }) => {
    const deviceA = await browser.newContext()
    const deviceB = await browser.newContext()
    await signInViaApi(deviceA.request, agent)
    await signInViaApi(deviceB.request, agent)
    expect((await deviceB.request.get('/api/me')).status()).toBe(200)

    const res = await deviceA.request.post('/api/auth/revoke-other-sessions', { headers: { Origin: CLIENT_ORIGIN } })
    expect(res.status(), await res.text()).toBe(200)

    expect((await deviceB.request.get('/api/me')).status()).toBe(401)
    expect((await deviceA.request.get('/api/me')).status()).toBe(200)
    await deviceA.close()
    await deviceB.close()
  })

  test('signing out on one device leaves other sessions of the same user intact', async ({ browser, agent }) => {
    const deviceA = await browser.newContext()
    const deviceB = await browser.newContext()
    await signInViaApi(deviceA.request, agent)
    await signInViaApi(deviceB.request, agent)

    const res = await deviceA.request.post('/api/auth/sign-out', { headers: { Origin: CLIENT_ORIGIN } })
    expect(res.status(), await res.text()).toBe(200)

    expect((await deviceA.request.get('/api/me')).status()).toBe(401)
    expect((await deviceB.request.get('/api/me')).status()).toBe(200)
    await deviceA.close()
    await deviceB.close()
  })
})
