import type { APIRequestContext } from '@playwright/test'
import { expect, inboundEmailHeaders, readTicket, test, uniqueEmail, uniqueMessageId } from './fixtures'

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

  test('rejects a sender without a name with 400', async ({ request }) => {
    const res = await postEmail(request, { ...email(), from: { email: uniqueEmail('customer') } })

    expect(res.status()).toBe(400)
    const json = await res.json()
    expect(json.error).toEqual(expect.any(String))
    expect(json.fieldErrors).toHaveProperty('from')
  })

  for (const [label, name] of [['an empty', ''], ['a whitespace-only', '   ']] as const) {
    test(`rejects ${label} sender name with 400`, async ({ request }) => {
      const res = await postEmail(request, email({ from: { email: uniqueEmail('customer'), name } }))

      expect(res.status()).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Sender name is required')
      expect(json.fieldErrors).toHaveProperty('from')
    })
  }

  test('rejects a sender name over 200 characters with 400', async ({ request }) => {
    const res = await postEmail(request, email({ from: { email: uniqueEmail('customer'), name: 'n'.repeat(201) } }))

    expect(res.status()).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Sender name must be at most 200 characters')
    expect(json.fieldErrors).toHaveProperty('from')
  })

  test('accepts and trims a sender name of exactly 200 characters', async ({ request }) => {
    const name = 'n'.repeat(200)
    const ticketId = await createTicket(request, email({ from: { email: uniqueEmail('customer'), name: `  ${name}  ` } }))

    expect(readTicket(ticketId)!.fromName).toBe(name)
  })

  test('rejects a body over 100,000 characters with 400', async ({ request }) => {
    const res = await postEmail(request, email({ text: 'a'.repeat(100_001) }))

    expect(res.status()).toBe(400)
    expect((await res.json()).error).toBe('Body must be at most 100,000 characters')
  })

  test('accepts a body of exactly 100,000 characters', async ({ request }) => {
    await createTicket(request, email({ text: 'a'.repeat(100_000) }))
  })

  test('rejects a receivedAt that is not an ISO datetime with 400', async ({ request }) => {
    const res = await postEmail(request, email({ receivedAt: 'yesterday' }))

    expect(res.status()).toBe(400)
    expect((await res.json()).fieldErrors).toHaveProperty('receivedAt')
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

  test('gives each new email its own ticket', async ({ request }) => {
    const first = await createTicket(request, email())
    const second = await createTicket(request, email())

    expect(second).not.toBe(first)
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
