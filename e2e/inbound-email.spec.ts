import type { APIRequestContext } from '@playwright/test'
import {
  expect,
  inboundEmailHeaders,
  readTicket,
  signInViaApi,
  test,
  uniqueEmail,
  uniqueMessageId,
} from './fixtures'

// POST /api/inbound-email: the webhook that turns a received email into a ticket.
// Not session-authenticated; it needs `Authorization: Bearer <INBOUND_EMAIL_SECRET>`.
// There is no ticket read API yet, so stored rows are checked with readTicket (database).

const ENDPOINT = '/api/inbound-email'

type EmailBody = {
  from: { email: string; name: string }
  subject: string
  text: string
  messageId?: string
  inReplyTo?: string
  references?: string[]
  receivedAt?: string
}

function email(overrides: Partial<EmailBody> = {}): EmailBody {
  return {
    from: { email: uniqueEmail('customer'), name: 'Casey Customer' },
    subject: 'My order has not arrived',
    text: 'Hello, my order #1234 has not arrived yet. Can you help?',
    messageId: uniqueMessageId(),
    ...overrides,
  }
}

function postEmail(request: APIRequestContext, data: unknown) {
  return request.post(ENDPOINT, { data, headers: inboundEmailHeaders() })
}

// Posts a new email and returns its ticket id, asserting a ticket was created
async function createTicket(request: APIRequestContext, body: EmailBody) {
  const res = await postEmail(request, body)
  expect(res.status(), await res.text()).toBe(201)
  const json = await res.json()
  expect(json).toEqual({ ticketId: expect.any(Number), created: true })
  expect(Number.isInteger(json.ticketId) && json.ticketId > 0, `ticketId ${json.ticketId} is a positive integer`).toBe(true)
  return json.ticketId as number
}

test.describe('Inbound email: authentication', () => {
  test('rejects a request without an Authorization header with 401', async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: email() })

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  test('rejects a wrong bearer token with 401', async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: email(), headers: { Authorization: 'Bearer wrong-secret' } })

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  test('rejects the right secret without the Bearer scheme with 401', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: email(),
      headers: { Authorization: process.env.INBOUND_EMAIL_SECRET! },
    })

    expect(res.status()).toBe(401)
  })

  test('rejects an unauthenticated request before reading the body', async ({ request }) => {
    // Malformed JSON would be a 400 if the body were parsed first
    const res = await request.post(ENDPOINT, {
      data: '{"from":',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status()).toBe(401)
  })

  test('does not accept a signed-in user session in place of the secret', async ({ request, admin }) => {
    await signInViaApi(request, admin)

    const res = await request.post(ENDPOINT, { data: email() })

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  test('does not store a ticket for an unauthenticated request', async ({ request }) => {
    const body = email()
    expect((await request.post(ENDPOINT, { data: body })).status()).toBe(401)

    // Delivering the same email properly afterwards creates it, so nothing was stored before
    await createTicket(request, body)
  })
})

test.describe('Inbound email: validation', () => {
  test('rejects an invalid sender email with 400 and field errors', async ({ request }) => {
    const res = await postEmail(request, email({ from: { email: 'not-an-email', name: 'Casey Customer' } }))

    expect(res.status()).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Enter a valid sender email address')
    expect(json.fieldErrors).toHaveProperty('from')
  })

  test('rejects a body missing required fields with 400', async ({ request }) => {
    const res = await postEmail(request, { from: { email: uniqueEmail('customer'), name: 'Casey Customer' } })

    expect(res.status()).toBe(400)
    const json = await res.json()
    expect(json.error).toEqual(expect.any(String))
    expect(json.fieldErrors).toHaveProperty('subject')
    expect(json.fieldErrors).toHaveProperty('text')
  })

  test('accepts and trims a sender name of exactly 200 characters', async ({ request }) => {
    const name = 'n'.repeat(200)
    const ticketId = await createTicket(request, email({ from: { email: uniqueEmail('customer'), name: `  ${name}  ` } }))

    expect(readTicket(ticketId)!.fromName).toBe(name)
  })

  test('rejects a non-JSON body with 400, not a server error', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: 'from=casey@example.com&subject=Hi',
      headers: { ...inboundEmailHeaders(), 'Content-Type': 'text/plain' },
    })

    expect(res.status()).toBe(400)
    expect((await res.json()).error).toEqual(expect.any(String))
  })

  test('rejects malformed JSON with 400', async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: '{"from": {"email": ',
      headers: { ...inboundEmailHeaders(), 'Content-Type': 'application/json' },
    })

    expect(res.status()).toBe(400)
  })

  test('rejects a JSON body larger than 1mb with 413', async ({ request }) => {
    const res = await postEmail(request, email({ text: 'a'.repeat(1_100_000) }))

    expect(res.status()).toBe(413)
  })
})

test.describe('Inbound email: new tickets', () => {
  test('creates a ticket and stores the email as its first message', async ({ request }) => {
    const body = email({ receivedAt: '2026-10-01T09:30:00.000Z' })
    const ticketId = await createTicket(request, body)

    const ticket = readTicket(ticketId)
    expect(ticket).toMatchObject({
      subject: body.subject,
      fromEmail: body.from.email,
      fromName: 'Casey Customer',
      status: 'OPEN',
      category: null,
    })
    expect(ticket!.messages).toHaveLength(1)
    expect(ticket!.messages[0]).toMatchObject({
      ticketId,
      messageId: body.messageId,
      fromEmail: body.from.email,
      fromName: 'Casey Customer',
      body: body.text,
      receivedAt: '2026-10-01T09:30:00.000Z',
    })
  })

  test('normalises the sender email to trimmed lowercase', async ({ request }) => {
    const address = uniqueEmail('Mixed.Case')
    const ticketId = await createTicket(request, email({ from: { email: `  ${address.toUpperCase()}  `, name: 'Casey Customer' } }))

    const ticket = readTicket(ticketId)
    expect(ticket!.fromEmail).toBe(address.toLowerCase())
    expect(ticket!.messages[0].fromEmail).toBe(address.toLowerCase())
  })

  test('uses "(no subject)" for a blank subject', async ({ request }) => {
    const ticketId = await createTicket(request, email({ subject: '   ' }))

    expect(readTicket(ticketId)!.subject).toBe('(no subject)')
  })

  test('stores a receivedAt with a timezone offset as the same instant in UTC', async ({ request }) => {
    const ticketId = await createTicket(request, email({ receivedAt: '2026-10-01T11:30:00+02:00' }))

    expect(readTicket(ticketId)!.messages[0].receivedAt).toBe('2026-10-01T09:30:00.000Z')
  })

  test('creates a separate ticket each time for repeated emails without a messageId', async ({ request }) => {
    // Without a Message-ID there is nothing to deduplicate on
    const body = email({ messageId: undefined })
    const first = await createTicket(request, body)
    const second = await createTicket(request, body)

    expect(second).not.toBe(first)
  })

  test('creates a ticket for an email without a messageId', async ({ request }) => {
    const ticketId = await createTicket(request, email({ messageId: undefined }))

    expect(readTicket(ticketId)!.messages[0].messageId).toBeNull()
  })

  test('creates a ticket when inReplyTo points to an unknown message', async ({ request }) => {
    const ticketId = await createTicket(
      request,
      email({ inReplyTo: uniqueMessageId('unknown'), references: [uniqueMessageId('unknown')] }),
    )

    expect(readTicket(ticketId)!.messages).toHaveLength(1)
  })
})

test.describe('Inbound email: duplicates', () => {
  test('acknowledges a repeated messageId without storing it twice', async ({ request }) => {
    const body = email()
    const ticketId = await createTicket(request, body)

    const res = await postEmail(request, body)

    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ticketId, created: false, duplicate: true })
    expect(readTicket(ticketId)!.messages).toHaveLength(1)
  })

  test('treats a repeated reply as a duplicate of the reply', async ({ request }) => {
    const original = email()
    const ticketId = await createTicket(request, original)
    const reply = email({ from: original.from, inReplyTo: original.messageId })
    expect((await postEmail(request, reply)).status()).toBe(200)

    const res = await postEmail(request, reply)

    expect(await res.json()).toEqual({ ticketId, created: false, duplicate: true })
    expect(readTicket(ticketId)!.messages).toHaveLength(2)
  })

  test('matches a repeated messageId after trimming surrounding whitespace', async ({ request }) => {
    const body = email()
    const ticketId = await createTicket(request, body)

    const res = await postEmail(request, { ...body, messageId: `  ${body.messageId}  ` })

    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ticketId, created: false, duplicate: true })
  })

  test('does not reopen a resolved ticket when the original email is redelivered', async ({ request }) => {
    const body = email()
    const ticketId = await createTicket(request, body)
    readTicket(ticketId, 'RESOLVED')

    const res = await postEmail(request, body)

    expect(await res.json()).toEqual({ ticketId, created: false, duplicate: true })
    expect(readTicket(ticketId)!.status).toBe('RESOLVED')
  })

  test('stores a new email delivered concurrently exactly once', async ({ request }) => {
    const body = email()

    const responses = await Promise.all(Array.from({ length: 5 }, () => postEmail(request, body)))
    const results = await Promise.all(responses.map(async (res) => ({ status: res.status(), json: await res.json() })))

    // Exactly one delivery creates the ticket; the rest are acknowledged as duplicates of it
    const created = results.filter((r) => r.status === 201)
    expect(created, JSON.stringify(results)).toHaveLength(1)
    const ticketId = created[0].json.ticketId
    expect(created[0].json).toEqual({ ticketId, created: true })
    for (const r of results.filter((r) => r.status !== 201)) {
      expect(r.status, JSON.stringify(r)).toBe(200)
      expect(r.json).toEqual({ ticketId, created: false, duplicate: true })
    }
    expect(readTicket(ticketId)!.messages).toHaveLength(1)
  })

  test('appends a reply delivered concurrently exactly once', async ({ request }) => {
    const original = email()
    const ticketId = await createTicket(request, original)
    const reply = email({ from: original.from, inReplyTo: original.messageId })

    const responses = await Promise.all(Array.from({ length: 5 }, () => postEmail(request, reply)))
    const results = await Promise.all(responses.map(async (res) => ({ status: res.status(), json: await res.json() })))

    for (const r of results) expect(r.status, JSON.stringify(r)).toBe(200)
    const appended = results.filter((r) => !r.json.duplicate)
    expect(appended, JSON.stringify(results)).toHaveLength(1)
    expect(appended[0].json).toEqual({ ticketId, created: false })
    for (const r of results.filter((r) => r.json.duplicate)) {
      expect(r.json).toEqual({ ticketId, created: false, duplicate: true })
    }
    expect(readTicket(ticketId)!.messages.map((m) => m.messageId)).toEqual([original.messageId, reply.messageId])
  })
})

test.describe('Inbound email: replies', () => {
  test('appends a reply (inReplyTo) to the original ticket', async ({ request }) => {
    const original = email()
    const ticketId = await createTicket(request, original)
    const reply = email({
      from: original.from,
      subject: `Re: ${original.subject}`,
      text: 'Any update on this?',
      inReplyTo: original.messageId,
    })

    const res = await postEmail(request, reply)

    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ticketId, created: false })
    const ticket = readTicket(ticketId)!
    expect(ticket.subject).toBe(original.subject)
    expect(ticket.messages.map((m) => m.messageId)).toEqual([original.messageId, reply.messageId])
    expect(ticket.messages[1].body).toBe('Any update on this?')
  })

  test('appends a reply matched only through references', async ({ request }) => {
    const original = email()
    const ticketId = await createTicket(request, original)

    const res = await postEmail(
      request,
      email({
        from: original.from,
        inReplyTo: uniqueMessageId('unknown'),
        references: [uniqueMessageId('unknown'), original.messageId!],
      }),
    )

    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ticketId, created: false })
    expect(readTicket(ticketId)!.messages).toHaveLength(2)
  })

  test('joins the ticket of the most recently stored match, not the latest sender-supplied receivedAt', async ({ request }) => {
    // receivedAt comes from the payload, so a sender's clock must not decide which ticket a reply joins
    const futureDated = email({ receivedAt: '2099-01-01T00:00:00.000Z' })
    const ticketA = await createTicket(request, futureDated)
    const pastDated = email({ receivedAt: '2000-01-01T00:00:00.000Z' })
    const ticketB = await createTicket(request, pastDated)

    const res = await postEmail(
      request,
      email({ references: [futureDated.messageId!, pastDated.messageId!] }),
    )

    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ticketId: ticketB, created: false })
    const b = readTicket(ticketB)!
    expect(b.messages).toHaveLength(2)
    expect(b.messages[0].receivedAt).toBe('2000-01-01T00:00:00.000Z')
    const a = readTicket(ticketA)!
    expect(a.messages).toHaveLength(1)
    // A holds the newer receivedAt, so ordering by receivedAt would have picked it
    expect(a.messages[0].receivedAt).toBe('2099-01-01T00:00:00.000Z')
  })

  test('keeps the ticket subject and customer when someone else replies', async ({ request }) => {
    const original = email()
    const ticketId = await createTicket(request, original)
    const colleague = { email: uniqueEmail('colleague'), name: 'Colin Colleague' }

    await postEmail(
      request,
      email({ from: colleague, subject: 'Re: something else entirely', inReplyTo: original.messageId }),
    )

    const ticket = readTicket(ticketId)!
    expect(ticket).toMatchObject({
      subject: original.subject,
      fromEmail: original.from.email,
      fromName: original.from.name,
    })
    // The reply itself is stored under its own sender
    expect(ticket.messages[1]).toMatchObject({ fromEmail: colleague.email, fromName: colleague.name })
  })

  test('appends a reply that has no messageId of its own', async ({ request }) => {
    const original = email()
    const ticketId = await createTicket(request, original)

    const res = await postEmail(request, email({ from: original.from, messageId: undefined, inReplyTo: original.messageId }))

    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ ticketId, created: false })
    const ticket = readTicket(ticketId)!
    expect(ticket.messages).toHaveLength(2)
    expect(ticket.messages[1].messageId).toBeNull()
  })

  test('threads a reply to a reply onto the same ticket', async ({ request }) => {
    const original = email()
    const ticketId = await createTicket(request, original)
    const firstReply = email({ from: original.from, inReplyTo: original.messageId })
    await postEmail(request, firstReply)

    const res = await postEmail(request, email({ from: original.from, inReplyTo: firstReply.messageId }))

    expect(await res.json()).toEqual({ ticketId, created: false })
    expect(readTicket(ticketId)!.messages).toHaveLength(3)
  })

  for (const status of ['RESOLVED', 'CLOSED'] as const) {
    test(`reopens a ${status.toLowerCase()} ticket when the customer replies`, async ({ request }) => {
      const original = email()
      const ticketId = await createTicket(request, original)
      expect(readTicket(ticketId, status)!.status).toBe(status)

      const res = await postEmail(request, email({ from: original.from, inReplyTo: original.messageId }))

      expect(res.status()).toBe(200)
      expect(readTicket(ticketId)!.status).toBe('OPEN')
    })
  }
})
