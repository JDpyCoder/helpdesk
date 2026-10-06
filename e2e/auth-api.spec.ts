import { CLIENT_ORIGIN, SESSION_COOKIE, expect, signInViaApi, test, uniqueEmail } from './fixtures'

test.describe('Protected API: /api/me', () => {
  test('returns 401 JSON without a session cookie', async ({ request }) => {
    const res = await request.get('/api/me')

    expect(res.status()).toBe(401)
    expect(res.headers()['content-type']).toContain('application/json')
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  test('returns 401 for a garbage session cookie', async ({ request }) => {
    const res = await request.get('/api/me', { headers: { Cookie: `${SESSION_COOKIE}=not-a-real-token` } })

    expect(res.status()).toBe(401)
  })

  test('returns 401 for a session cookie with a tampered signature', async ({ playwright, agent }) => {
    const owner = await playwright.request.newContext({ baseURL: CLIENT_ORIGIN })
    await signInViaApi(owner, agent)
    const { cookies } = await owner.storageState()
    const real = cookies.find((c) => c.name === SESSION_COOKIE)
    expect(real).toBeDefined()

    // Cookie value is "<token>.<signature>"; flip the last character of the signature
    const value = decodeURIComponent(real!.value)
    const last = value.at(-1) === 'A' ? 'B' : 'A'
    const tampered = encodeURIComponent(value.slice(0, -1) + last)

    const anonymous = await playwright.request.newContext({ baseURL: CLIENT_ORIGIN })
    const res = await anonymous.get('/api/me', { headers: { Cookie: `${SESSION_COOKIE}=${tampered}` } })
    expect(res.status()).toBe(401)

    // The untampered cookie still works, so the 401 came from the signature check
    expect((await owner.get('/api/me')).status()).toBe(200)
    await owner.dispose()
    await anonymous.dispose()
  })

  test('returns 401 for a correctly signed cookie whose session no longer exists', async ({ playwright, agent }) => {
    const owner = await playwright.request.newContext({ baseURL: CLIENT_ORIGIN })
    await signInViaApi(owner, agent)
    const { cookies } = await owner.storageState()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    await owner.post('/api/auth/sign-out', { headers: { Origin: CLIENT_ORIGIN } })

    const replay = await playwright.request.newContext({ baseURL: CLIENT_ORIGIN })
    const res = await replay.get('/api/me', { headers: { Cookie: cookieHeader } })
    expect(res.status()).toBe(401)
    await owner.dispose()
    await replay.dispose()
  })
})

test.describe('Sign-in API', () => {
  test('wrong password returns 401 and sets no session cookie', async ({ request, admin }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      data: { email: admin.email, password: 'definitely-wrong' },
      headers: { Origin: CLIENT_ORIGIN },
    })

    expect(res.status()).toBe(401)
    expect(await res.json()).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' })
    expect(res.headers()['set-cookie'] ?? '').not.toContain(SESSION_COOKIE)
    expect((await request.get('/api/me')).status()).toBe(401)
  })

  test('a malformed email is rejected with 400', async ({ request }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      data: { email: 'not-an-email', password: 'whatever-password' },
      headers: { Origin: CLIENT_ORIGIN },
    })

    expect(res.status()).toBe(400)
  })

  test('a request from an untrusted origin is rejected', async ({ request, admin }) => {
    const res = await request.post('/api/auth/sign-in/email', {
      data: { email: admin.email, password: admin.password },
      headers: { Origin: 'https://evil.example.com' },
    })

    expect(res.status()).toBe(403)
    expect((await request.get('/api/me')).status()).toBe(401)
  })

  test('a cookie-authenticated request from an untrusted origin is rejected (CSRF)', async ({ request, agent }) => {
    await signInViaApi(request, agent)

    const rename = await request.post('/api/auth/update-user', {
      data: { name: 'Hijacked' },
      headers: { Origin: 'https://evil.example.com' },
    })
    const signOut = await request.post('/api/auth/sign-out', { headers: { Origin: 'https://evil.example.com' } })

    expect(rename.status()).toBe(403)
    expect(signOut.status()).toBe(403)
    const me = await request.get('/api/me')
    expect(me.status()).toBe(200)
    expect((await me.json()).user.name).toBe(agent.name)
  })

  test('get-session returns null without a session', async ({ request }) => {
    const res = await request.get('/api/auth/get-session')

    expect(res.status()).toBe(200)
    expect(await res.json()).toBeNull()
  })
})

test.describe('Public sign-up is disabled', () => {
  test('sign-up is rejected and creates no user', async ({ request }) => {
    const email = uniqueEmail('signup')
    const password = 'a-long-enough-password'

    const res = await request.post('/api/auth/sign-up/email', {
      data: { email, password, name: 'Intruder' },
      headers: { Origin: CLIENT_ORIGIN },
    })

    expect(res.status()).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' })
    expect(res.headers()['set-cookie'] ?? '').not.toContain(SESSION_COOKIE)

    // No account was created: those credentials can't sign in
    const signIn = await request.post('/api/auth/sign-in/email', {
      data: { email, password },
      headers: { Origin: CLIENT_ORIGIN },
    })
    expect(signIn.status()).toBe(401)
  })

  test('sign-up asking for the ADMIN role is rejected too', async ({ request }) => {
    const res = await request.post('/api/auth/sign-up/email', {
      data: { email: uniqueEmail('signup-admin'), password: 'a-long-enough-password', name: 'Intruder', role: 'ADMIN' },
      headers: { Origin: CLIENT_ORIGIN },
    })

    expect(res.status()).toBe(400)
  })
})

test.describe('Role escalation', () => {
  test('an agent cannot set their own role to ADMIN via update-user', async ({ request, agent }) => {
    await signInViaApi(request, agent)

    const res = await request.post('/api/auth/update-user', {
      data: { role: 'ADMIN' },
      headers: { Origin: CLIENT_ORIGIN },
    })

    expect(res.status()).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'FIELD_NOT_ALLOWED' })
    const me = await (await request.get('/api/me')).json()
    expect(me.user.role).toBe('AGENT')
  })

  test('role is rejected even when sent alongside an allowed field', async ({ request, agent }) => {
    await signInViaApi(request, agent)

    const res = await request.post('/api/auth/update-user', {
      data: { name: 'Renamed Agent', role: 'ADMIN' },
      headers: { Origin: CLIENT_ORIGIN },
    })

    expect(res.status()).toBe(400)
    const me = await (await request.get('/api/me')).json()
    expect(me.user).toMatchObject({ role: 'AGENT', name: agent.name })
  })

  test('an agent can still update their own name', async ({ request, agent }) => {
    await signInViaApi(request, agent)

    const res = await request.post('/api/auth/update-user', {
      data: { name: 'Renamed Agent' },
      headers: { Origin: CLIENT_ORIGIN },
    })

    expect(res.status(), await res.text()).toBe(200)
    const me = await (await request.get('/api/me')).json()
    expect(me.user).toMatchObject({ role: 'AGENT', name: 'Renamed Agent' })
  })
})
