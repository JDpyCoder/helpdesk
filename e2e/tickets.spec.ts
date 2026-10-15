import { randomUUID } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import {
  createTicketViaEmail,
  createUser,
  expect,
  setTicketFields,
  signIn,
  signInViaApi,
  test,
  uniqueEmail,
} from './fixtures'

// GET /api/tickets and the /tickets page. Tickets come in through the inbound-email
// webhook. The database is shared across specs, so every test tags its subjects with a
// unique string and only asserts on the tickets that carry it.
// The table's rendering, sorting, filtering, search and pagination UI are covered by
// client/src/pages/TicketsPage.test.tsx; these tests check what Postgres and the route do.

const ENDPOINT = '/api/tickets'

type ListedTicket = {
  id: number
  subject: string
  fromEmail: string
  fromName: string
  status: 'OPEN' | 'RESOLVED' | 'CLOSED'
  category: string | null
  assignedTo: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

function uniqueTag() {
  return `T${Date.now()}-${randomUUID().slice(0, 8)}`
}

// Creates one ticket per subject, in order, and returns their ids in the same order
async function createTickets(request: APIRequestContext, subjects: string[]) {
  const ids: number[] = []
  for (const subject of subjects) ids.push(await createTicketViaEmail(request, { subject }))
  return ids
}

type ListResponse = { tickets: ListedTicket[]; total: number; page: number; pageSize: number }

// One GET /api/tickets call that must succeed; returns the whole body
async function listPage(request: APIRequestContext, params: Record<string, string> = {}) {
  const res = await request.get(ENDPOINT, { params })
  expect(res.status(), await res.text()).toBe(200)
  return (await res.json()) as ListResponse
}

// Lists the tickets whose subject contains `tag`, preserving API order. The list is paginated
// and the shared database keeps growing, so the request is scoped to the tag with ?search=
// and asks for the largest page; `params` can add filters or sorting.
async function listTagged(request: APIRequestContext, tag: string, params: Record<string, string> = {}) {
  const { tickets } = await listPage(request, { search: tag, pageSize: '100', ...params })
  return tickets.filter((t) => t.subject.includes(tag))
}

test.describe('Tickets API: access', () => {
  test('rejects an unauthenticated request with 401', async ({ request }) => {
    const res = await request.get(ENDPOINT)

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  test('lists tickets for a signed-in agent', async ({ request, agent }) => {
    const tag = uniqueTag()
    const [id] = await createTickets(request, [`${tag} agent can see`])
    await signInViaApi(request, agent)

    const tickets = await listTagged(request, tag)

    expect(tickets.map((t) => t.id)).toEqual([id])
  })

  test('lists tickets for a signed-in admin', async ({ request, admin }) => {
    const tag = uniqueTag()
    const [id] = await createTickets(request, [`${tag} admin can see`])
    await signInViaApi(request, admin)

    const tickets = await listTagged(request, tag)

    expect(tickets.map((t) => t.id)).toEqual([id])
  })
})

test.describe('Tickets API: response shape', () => {
  test('returns one page of list fields only, with total, page and pageSize', async ({ request, agent }) => {
    const tag = uniqueTag()
    const fromEmail = uniqueEmail('customer')
    const id = await createTicketViaEmail(request, {
      subject: `${tag} shape`,
      fromEmail,
      fromName: 'Sam Shape',
      text: 'SECRET-BODY-TEXT that must not be listed',
    })
    await signInViaApi(request, agent)

    const res = await request.get(ENDPOINT, { params: { search: tag } })
    expect(res.status()).toBe(200)
    const raw = await res.text()
    const body = JSON.parse(raw) as ListResponse
    const ticket = body.tickets.find((t) => t.id === id)!

    // Defaults: page 1 of 10
    expect(Object.keys(body).sort()).toEqual(['page', 'pageSize', 'tickets', 'total'])
    expect(body).toMatchObject({ total: 1, page: 1, pageSize: 10 })
    expect(body.tickets).toHaveLength(1)
    expect(Object.keys(ticket).sort()).toEqual(
      ['assignedTo', 'category', 'createdAt', 'fromEmail', 'fromName', 'id', 'status', 'subject', 'updatedAt'],
    )
    expect(ticket).toEqual({
      id,
      subject: `${tag} shape`,
      fromEmail,
      fromName: 'Sam Shape',
      status: 'OPEN',
      category: null,
      assignedTo: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
    expect(new Date(ticket.createdAt).toISOString()).toBe(ticket.createdAt)
    expect(raw).not.toContain('SECRET-BODY-TEXT')
    expect(raw).not.toContain('"messages"')
    expect(raw).not.toContain('"body"')
  })

  test('includes the assignee id and name only', async ({ request, agent }) => {
    const tag = uniqueTag()
    const [id] = await createTickets(request, [`${tag} assigned`])
    setTicketFields(id, { assigneeEmail: agent.email })
    await signInViaApi(request, agent)
    const me = (await (await request.get('/api/me')).json()).user

    const [ticket] = await listTagged(request, tag)

    expect(ticket.assignedTo).toEqual({ id: me.id, name: agent.name })
  })
})

test.describe('Tickets API: sorting', () => {
  test('lists the newest ticket first by default', async ({ request, agent }) => {
    const tag = uniqueTag()
    const ids = await createTickets(request, [`${tag} first`, `${tag} second`, `${tag} third`])
    await signInViaApi(request, agent)

    const tickets = await listTagged(request, tag)

    expect(tickets.map((t) => t.id)).toEqual([...ids].reverse())
  })

  test('sorts by subject in both directions', async ({ request, agent }) => {
    const tag = uniqueTag()
    // Created out of alphabetical order, so a createdAt sort would give a different result
    const [bravo, charlie, alpha] = await createTickets(request, [`${tag} bravo`, `${tag} charlie`, `${tag} alpha`])
    await signInViaApi(request, agent)

    const asc = await listTagged(request, tag, { sortBy: 'subject', order: 'asc' })
    const desc = await listTagged(request, tag, { sortBy: 'subject', order: 'desc' })

    expect(asc.map((t) => t.id)).toEqual([alpha, bravo, charlie])
    expect(desc.map((t) => t.id)).toEqual([charlie, bravo, alpha])
  })

  test('sorts by assignee name, with unassigned tickets last in asc and first in desc', async ({ request, agent }) => {
    const tag = uniqueTag()
    const suffix = randomUUID().slice(0, 6)
    const alpha = createUser({ role: 'AGENT', name: `Alpha ${suffix}` })
    const bravo = createUser({ role: 'AGENT', name: `Bravo ${suffix}` })
    // Created out of assignee order, so a createdAt or id sort would give a different result
    const [toBravo, unassigned, toAlpha] = await createTickets(
      request,
      [`${tag} to bravo`, `${tag} unassigned`, `${tag} to alpha`],
    )
    setTicketFields(toBravo, { assigneeEmail: bravo.email })
    setTicketFields(toAlpha, { assigneeEmail: alpha.email })
    await signInViaApi(request, agent)

    const asc = await listTagged(request, tag, { sortBy: 'assignedTo', order: 'asc' })
    const desc = await listTagged(request, tag, { sortBy: 'assignedTo', order: 'desc' })

    expect(asc.map((t) => t.id)).toEqual([toAlpha, toBravo, unassigned])
    expect(desc.map((t) => t.id)).toEqual([unassigned, toBravo, toAlpha])
  })

  test('sorts status in workflow order (OPEN, RESOLVED, CLOSED), not alphabetically', async ({ request, agent }) => {
    const tag = uniqueTag()
    // Creation order differs from both enum order and alphabetical order (CLOSED, OPEN, RESOLVED)
    const [resolved, closed, open] = await createTickets(request, [`${tag} resolved`, `${tag} closed`, `${tag} open`])
    setTicketFields(resolved, { status: 'RESOLVED' })
    setTicketFields(closed, { status: 'CLOSED' })
    await signInViaApi(request, agent)

    const tickets = await listTagged(request, tag, { sortBy: 'status', order: 'asc' })

    expect(tickets.map((t) => t.status)).toEqual(['OPEN', 'RESOLVED', 'CLOSED'])
    expect(tickets.map((t) => t.id)).toEqual([open, resolved, closed])
  })
})

test.describe('Tickets API: filters', () => {
  test('filters by status', async ({ request, agent }) => {
    const tag = uniqueTag()
    const [open, resolved, closed] = await createTickets(request, [`${tag} open`, `${tag} resolved`, `${tag} closed`])
    setTicketFields(resolved, { status: 'RESOLVED' })
    setTicketFields(closed, { status: 'CLOSED' })
    await signInViaApi(request, agent)

    for (const [status, id] of [['OPEN', open], ['RESOLVED', resolved], ['CLOSED', closed]] as const) {
      // Unscoped: every ticket on the page has the status
      const { tickets } = await listPage(request, { status, pageSize: '100' })
      expect(tickets.every((t) => t.status === status), `every ticket has status ${status}`).toBe(true)
      // Scoped to this test's tickets: exactly the one with that status
      expect((await listTagged(request, tag, { status })).map((t) => t.id)).toEqual([id])
    }
  })

  test('combines status and category filters with sorting', async ({ request, agent }) => {
    const tag = uniqueTag()
    const [a, b, openRefund, resolvedGeneral] = await createTickets(
      request,
      [`${tag} b-match`, `${tag} a-match`, `${tag} open-refund`, `${tag} resolved-general`],
    )
    setTicketFields(a, { status: 'RESOLVED', category: 'REFUND_REQUEST' })
    setTicketFields(b, { status: 'RESOLVED', category: 'REFUND_REQUEST' })
    setTicketFields(openRefund, { category: 'REFUND_REQUEST' })
    setTicketFields(resolvedGeneral, { status: 'RESOLVED', category: 'GENERAL_QUESTION' })
    await signInViaApi(request, agent)

    const tickets = await listTagged(request, tag, {
      status: 'RESOLVED',
      category: 'REFUND_REQUEST',
      sortBy: 'subject',
      order: 'asc',
    })

    // "a-match" (ticket b) sorts before "b-match" (ticket a)
    expect(tickets.map((t) => t.id)).toEqual([b, a])
  })

  test('category=none lists only unclassified tickets', async ({ request, agent }) => {
    const tag = uniqueTag()
    const [refund, unclassified] = await createTickets(request, [`${tag} refund`, `${tag} unclassified`])
    setTicketFields(refund, { category: 'REFUND_REQUEST' })
    await signInViaApi(request, agent)

    const { tickets } = await listPage(request, { category: 'none', pageSize: '100' })

    expect(tickets.every((t) => t.category === null), 'every ticket is unclassified').toBe(true)
    expect((await listTagged(request, tag, { category: 'none' })).map((t) => t.id)).toEqual([unclassified])
  })
})

test.describe('Tickets API: search', () => {
  // Lists the ids of every ticket matching `search`, in API order
  async function searchIds(request: APIRequestContext, search: string) {
    const res = await request.get(ENDPOINT, { params: { search } })
    expect(res.status(), await res.text()).toBe(200)
    return ((await res.json()) as { tickets: ListedTicket[] }).tickets.map((t) => t.id)
  }

  test('matches subject, sender name and sender email case-insensitively', async ({ request, agent }) => {
    const tag = uniqueTag()
    const term = `Q${randomUUID().slice(0, 8)}`
    const [widget] = await createTickets(request, [`${tag} widget broken`, `${tag} gadget broken`])
    // Neither subject contains `term`; only the sender fields do
    const byName = await createTicketViaEmail(request, { subject: `${tag} by name`, fromName: `Nina ${term}name` })
    const byEmail = await createTicketViaEmail(request, {
      subject: `${tag} by email`,
      fromEmail: `${term.toLowerCase()}mail@example.com`,
    })
    await createTicketViaEmail(request, { subject: `${tag} no match` })
    await signInViaApi(request, agent)

    // The search text contains the tag, so only this test's tickets can match
    expect(await searchIds(request, `${tag.toLowerCase()} WIDGET`)).toEqual([widget])
    expect(await searchIds(request, `${term}NAME`.toLowerCase())).toEqual([byName])
    expect(await searchIds(request, `${term}MAIL@example`.toUpperCase())).toEqual([byEmail])
  })

  test('search=#<id> returns that ticket', async ({ request, agent }) => {
    const tag = uniqueTag()
    const [id] = await createTickets(request, [`${tag} find me by id`])
    await signInViaApi(request, agent)

    expect(await searchIds(request, `#${id}`)).toContain(id)
  })
})

test.describe('Tickets API: pagination', () => {
  test('total counts every matching ticket, and a page past the end is empty', async ({ request, agent }) => {
    const tag = uniqueTag()
    const ids = await createTickets(request, [`${tag} one`, `${tag} two`, `${tag} three`])
    await signInViaApi(request, agent)
    const params = { search: tag, pageSize: '10', sortBy: 'id', order: 'asc' }

    const first = await listPage(request, params)
    const past = await listPage(request, { ...params, page: '2' })

    expect(first).toMatchObject({ total: 3, page: 1, pageSize: 10 })
    expect(first.tickets.map((t) => t.id)).toEqual(ids)
    expect(past).toEqual({ tickets: [], total: 3, page: 2, pageSize: 10 })
  })

  test('pages are complete and in the same order as one large page, ties broken by id', async ({ request, agent }) => {
    const tag = uniqueTag()
    // Only two distinct subjects, so a subject sort relies on the id tie-breaker for a stable order
    const subjects = Array.from({ length: 12 }, (_, i) => `${tag} ${i % 2 === 0 ? 'bravo' : 'alpha'}`)
    const ids = await createTickets(request, subjects)
    await signInViaApi(request, agent)
    const params = { search: tag, sortBy: 'subject', order: 'asc' }

    const page1 = await listPage(request, { ...params, pageSize: '10', page: '1' })
    const page2 = await listPage(request, { ...params, pageSize: '10', page: '2' })
    const all = await listPage(request, { ...params, pageSize: '100' })

    expect(page1.tickets).toHaveLength(10)
    expect(page2.tickets).toHaveLength(2)
    expect([page1.total, page2.total, all.total]).toEqual([12, 12, 12])
    const paged = [...page1.tickets, ...page2.tickets].map((t) => t.id)
    expect(new Set(paged).size).toBe(12)
    expect(paged).toEqual(all.tickets.map((t) => t.id))
    // alpha tickets (odd indexes) first, then bravo, each group in id order
    const alpha = ids.filter((_, i) => i % 2 === 1)
    const bravo = ids.filter((_, i) => i % 2 === 0)
    expect(paged).toEqual([...alpha, ...bravo])
  })
})

test.describe('Tickets API: validation', () => {
  // A representative few that prove the route validates the query with listTicketsQuerySchema
  const invalid: [string, Record<string, string> | string][] = [
    ['status', { status: 'PENDING' }],
    // Only 10, 25, 50 and 100 are offered
    ['pageSize', { pageSize: '7' }],
    // A repeated parameter arrives as an array, which is not a valid enum value
    ['status', 'status=OPEN&status=CLOSED'],
  ]

  for (const [field, params] of invalid) {
    const label = typeof params === 'string' ? params : new URLSearchParams(params).toString()
    test(`rejects ${label} with 400 and a field error for ${field}`, async ({ request, agent }) => {
      await signInViaApi(request, agent)

      const res = await request.get(typeof params === 'string' ? `${ENDPOINT}?${params}` : ENDPOINT, {
        params: typeof params === 'string' ? undefined : params,
      })

      expect(res.status()).toBe(400)
      const json = await res.json()
      expect(json.error).toEqual(expect.any(String))
      expect(json.fieldErrors).toHaveProperty(field)
    })
  }

  test('checks the session before validating the query', async ({ request }) => {
    const res = await request.get(ENDPOINT, { params: { status: 'PENDING' } })

    expect(res.status()).toBe(401)
  })
})

test.describe('Tickets page', () => {
  test('an agent opens it from the Tickets nav link', async ({ page, request, agent }) => {
    // At least one ticket, so the table (not the empty state) is shown
    await createTickets(request, [`${uniqueTag()} nav link`])
    await signIn(page, agent)

    await page.getByRole('navigation').getByRole('link', { name: 'Tickets' }).click()

    await expect(page).toHaveURL('/tickets')
    await expect(page.getByRole('heading', { level: 1, name: 'Tickets' })).toBeVisible()
    await expect(page.getByRole('columnheader')).toHaveText(
      ['#', 'Subject', 'From', 'Status', 'Category', 'Assigned to', 'Created'],
    )
  })

  test('an admin also sees the Tickets nav link and the page', async ({ page, admin }) => {
    await signIn(page, admin)

    await page.getByRole('navigation').getByRole('link', { name: 'Tickets' }).click()

    await expect(page).toHaveURL('/tickets')
    await expect(page.getByRole('heading', { level: 1, name: 'Tickets' })).toBeVisible()
  })
})
