import { randomUUID } from 'node:crypto'
import type { APIRequestContext, Page } from '@playwright/test'
import {
  createTicketViaEmail,
  createUser,
  expect,
  setTicketFields,
  signIn,
  signInViaApi,
  signOutViaApi,
  test,
  uniqueEmail,
} from './fixtures'

// GET /api/tickets and the /tickets page. Tickets come in through the inbound-email
// webhook. The database is shared across specs, so every test tags its subjects with a
// unique string and only asserts on the tickets that carry it.

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

// Lists tickets and keeps only those whose subject contains `tag`, preserving API order
async function listTagged(request: APIRequestContext, tag: string, params: Record<string, string> = {}) {
  const res = await request.get(ENDPOINT, { params })
  expect(res.status(), await res.text()).toBe(200)
  const { tickets } = (await res.json()) as { tickets: ListedTicket[] }
  return tickets.filter((t) => t.subject.includes(tag))
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The table's body rows that belong to this test (header row excluded: it has no cells)
function taggedRows(page: Page, tag: string) {
  return page.getByRole('row').filter({ has: page.getByRole('cell') }).filter({ hasText: tag })
}

test.describe('Tickets API: access', () => {
  test('rejects an unauthenticated request with 401', async ({ request }) => {
    const res = await request.get(ENDPOINT)

    expect(res.status()).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  test('rejects a request after signing out with 401', async ({ request, agent }) => {
    await signInViaApi(request, agent)
    await signOutViaApi(request)

    const res = await request.get(ENDPOINT)

    expect(res.status()).toBe(401)
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
  test('returns list fields only, without message bodies', async ({ request, agent }) => {
    const tag = uniqueTag()
    const fromEmail = uniqueEmail('customer')
    const id = await createTicketViaEmail(request, {
      subject: `${tag} shape`,
      fromEmail,
      fromName: 'Sam Shape',
      text: 'SECRET-BODY-TEXT that must not be listed',
    })
    await signInViaApi(request, agent)

    const res = await request.get(ENDPOINT)
    const raw = await res.text()
    const ticket = (JSON.parse(raw) as { tickets: ListedTicket[] }).tickets.find((t) => t.id === id)!

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

  test('lists the oldest ticket first with order=asc', async ({ request, agent }) => {
    const tag = uniqueTag()
    const ids = await createTickets(request, [`${tag} first`, `${tag} second`, `${tag} third`])
    await signInViaApi(request, agent)

    const tickets = await listTagged(request, tag, { order: 'asc' })

    expect(tickets.map((t) => t.id)).toEqual(ids)
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

  test('sorts by updatedAt, putting the most recently changed ticket first', async ({ request, agent }) => {
    const tag = uniqueTag()
    const [older, newer] = await createTickets(request, [`${tag} older`, `${tag} newer`])
    // Touch the older ticket so it becomes the most recently updated
    setTicketFields(older, { status: 'RESOLVED' })
    await signInViaApi(request, agent)

    const byCreated = await listTagged(request, tag)
    const byUpdated = await listTagged(request, tag, { sortBy: 'updatedAt' })

    expect(byCreated.map((t) => t.id)).toEqual([newer, older])
    expect(byUpdated.map((t) => t.id)).toEqual([older, newer])
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

  test('sorts by id in both directions', async ({ request, agent }) => {
    const tag = uniqueTag()
    const ids = await createTickets(request, [`${tag} first`, `${tag} second`, `${tag} third`])
    await signInViaApi(request, agent)

    const asc = await listTagged(request, tag, { sortBy: 'id', order: 'asc' })
    const desc = await listTagged(request, tag, { sortBy: 'id', order: 'desc' })

    expect(asc.map((t) => t.id)).toEqual(ids)
    expect(desc.map((t) => t.id)).toEqual([...ids].reverse())
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
      const res = await request.get(ENDPOINT, { params: { status } })
      const { tickets } = (await res.json()) as { tickets: ListedTicket[] }

      expect(tickets.every((t) => t.status === status), `every ticket has status ${status}`).toBe(true)
      expect(tickets.filter((t) => t.subject.includes(tag)).map((t) => t.id)).toEqual([id])
    }
  })

  test('filters by category', async ({ request, agent }) => {
    const tag = uniqueTag()
    const [refund, technical, unclassified] = await createTickets(
      request,
      [`${tag} refund`, `${tag} technical`, `${tag} unclassified`],
    )
    setTicketFields(refund, { category: 'REFUND_REQUEST' })
    setTicketFields(technical, { category: 'TECHNICAL_QUESTION' })
    await signInViaApi(request, agent)

    const res = await request.get(ENDPOINT, { params: { category: 'REFUND_REQUEST' } })
    const { tickets } = (await res.json()) as { tickets: ListedTicket[] }

    expect(tickets.every((t) => t.category === 'REFUND_REQUEST'), 'every ticket is a refund request').toBe(true)
    expect(tickets.filter((t) => t.subject.includes(tag)).map((t) => t.id)).toEqual([refund])
    // Without a filter all three are listed, including the unclassified one
    expect((await listTagged(request, tag)).map((t) => t.id)).toEqual([unclassified, technical, refund])
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
})

test.describe('Tickets API: validation', () => {
  const invalid: [string, Record<string, string> | string][] = [
    ['status', { status: 'PENDING' }],
    ['status', { status: 'open' }],
    ['category', { category: 'BILLING' }],
    ['sortBy', { sortBy: 'fromEmail' }],
    ['order', { order: 'up' }],
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
  test('redirects to /login when signed out', async ({ page }) => {
    await page.goto('/tickets')

    await expect(page).toHaveURL('/login')
  })

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

  test('lists created tickets newest first', async ({ page, request, agent }) => {
    const tag = uniqueTag()
    const subjects = [`${tag} first`, `${tag} second`, `${tag} third`]
    await createTickets(request, subjects)
    await signIn(page, agent)

    await page.goto('/tickets')

    await expect(taggedRows(page, tag)).toHaveText(
      [...subjects].reverse().map((subject) => new RegExp(escapeRegExp(subject))),
    )
  })

  test('shows a new, unassigned, unclassified ticket with the right cells', async ({ page, request, agent }) => {
    const tag = uniqueTag()
    const subject = `${tag} printer is on fire`
    const fromEmail = uniqueEmail('customer')
    const id = await createTicketViaEmail(request, { subject, fromEmail, fromName: 'Pat Printer' })
    await signIn(page, agent)
    const createdAt = (await listTagged(page.request, tag))[0].createdAt
    const createdLabel = await page.evaluate((iso) => new Date(iso).toLocaleString(), createdAt)

    await page.goto('/tickets')

    const row = taggedRows(page, tag)
    await expect(row).toHaveCount(1)
    const cells = row.getByRole('cell')
    await expect(cells).toHaveText([
      String(id),
      subject,
      `Pat Printer${fromEmail}`,
      'Open',
      'Unclassified',
      'Unassigned',
      createdLabel,
    ])
  })

  test('shows status, category and assignee labels', async ({ page, request, agent }) => {
    const tag = uniqueTag()
    const assignee = createUser({ role: 'AGENT', name: `Assignee ${randomUUID().slice(0, 6)}` })
    const [resolved, closed] = await createTickets(request, [`${tag} resolved`, `${tag} closed`])
    setTicketFields(resolved, { status: 'RESOLVED', category: 'REFUND_REQUEST', assigneeEmail: assignee.email })
    setTicketFields(closed, { status: 'CLOSED', category: 'TECHNICAL_QUESTION' })
    await signIn(page, agent)

    await page.goto('/tickets')

    const resolvedCells = taggedRows(page, `${tag} resolved`).getByRole('cell')
    await expect(resolvedCells.nth(3)).toHaveText('Resolved')
    await expect(resolvedCells.nth(4)).toHaveText('Refund request')
    await expect(resolvedCells.nth(5)).toHaveText(assignee.name)

    const closedCells = taggedRows(page, `${tag} closed`).getByRole('cell')
    await expect(closedCells.nth(3)).toHaveText('Closed')
    await expect(closedCells.nth(4)).toHaveText('Technical question')
    await expect(closedCells.nth(5)).toHaveText('Unassigned')
  })

  test('clicking the Subject header sorts rows by subject, and clicking again reverses them', async ({ page, request, agent }) => {
    const tag = uniqueTag()
    // Created out of alphabetical order, so the default newest-first order differs from both sorts
    const subjects = [`${tag} bravo`, `${tag} charlie`, `${tag} alpha`]
    await createTickets(request, subjects)
    const alphabetical = [...subjects].sort()
    const asRows = (list: string[]) => list.map((subject) => new RegExp(escapeRegExp(subject)))
    await signIn(page, agent)
    await page.goto('/tickets')

    const subjectHeader = page.getByRole('columnheader', { name: 'Subject' })
    const createdHeader = page.getByRole('columnheader', { name: 'Created' })
    await expect(taggedRows(page, tag)).toHaveText(asRows([...subjects].reverse()))
    await expect(subjectHeader).toHaveAttribute('aria-sort', 'none')
    await expect(createdHeader).toHaveAttribute('aria-sort', 'descending')

    await subjectHeader.getByRole('button', { name: 'Subject' }).click()

    await expect(subjectHeader).toHaveAttribute('aria-sort', 'ascending')
    await expect(createdHeader).toHaveAttribute('aria-sort', 'none')
    await expect(taggedRows(page, tag)).toHaveText(asRows(alphabetical))

    await subjectHeader.getByRole('button', { name: 'Subject' }).click()

    await expect(subjectHeader).toHaveAttribute('aria-sort', 'descending')
    await expect(taggedRows(page, tag)).toHaveText(asRows([...alphabetical].reverse()))
  })
})
