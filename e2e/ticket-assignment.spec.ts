import { randomUUID } from 'node:crypto'
import {
  CLIENT_ORIGIN,
  createTicketViaEmail,
  createUser,
  expect,
  signIn,
  signInViaApi,
  test,
} from './fixtures'

// Assigning a ticket: GET /api/agents, PATCH /api/tickets/:id and the "Assigned to" select
// on /tickets/:id. The select's loading, saving and error states are covered by
// TicketAssigneeSelect.test.tsx; these tests check the real save and the server-side rules.

const headers = { Origin: CLIENT_ORIGIN }

function uniqueTag() {
  return `A${Date.now()}-${randomUUID().slice(0, 8)}`
}

test.describe('Ticket assignment', () => {
  test('an agent assigns a ticket, the choice persists and shows in the list, then unassigns it', async ({ page, request, agent }) => {
    const tag = uniqueTag()
    const subject = `${tag} needs an owner`
    const assignee = createUser({ role: 'AGENT', name: `Assignee ${randomUUID().slice(0, 6)}` })
    const ticketId = await createTicketViaEmail(request, { subject })

    await signIn(page, agent)
    await page.goto(`/tickets/${ticketId}`)
    const select = page.getByRole('combobox', { name: 'Assigned to' })
    await expect(select).toHaveValue('')

    const saved = page.waitForResponse(
      (res) => res.url().endsWith(`/api/tickets/${ticketId}`) && res.request().method() === 'PATCH',
    )
    const [assigneeId] = await select.selectOption({ label: assignee.name })
    expect((await saved).status()).toBe(200)
    await expect(select).toBeEnabled()

    await page.reload()
    await expect(select).toHaveValue(assigneeId)
    await expect(select).toBeEnabled()

    await page.goto('/tickets')
    await page.getByRole('searchbox', { name: 'Search' }).fill(tag)
    const row = page.getByRole('row').filter({ has: page.getByRole('cell') }).filter({ hasText: tag })
    await expect(row).toHaveCount(1)
    await expect(row.getByRole('cell').nth(5)).toHaveText(assignee.name)

    await row.getByRole('link', { name: subject }).click()
    await expect(page).toHaveURL(`/tickets/${ticketId}`)
    await expect(select).toHaveValue(assigneeId)
    const cleared = page.waitForResponse(
      (res) => res.url().endsWith(`/api/tickets/${ticketId}`) && res.request().method() === 'PATCH',
    )
    await select.selectOption({ label: 'Unassigned' })
    expect((await cleared).status()).toBe(200)

    await page.reload()
    await expect(select).toBeEnabled()
    await expect(select).toHaveValue('')
  })

  test('the API needs a session, lists only active agents and refuses admins or deleted agents as assignees', async ({ request, admin, agent }) => {
    const ticketId = await createTicketViaEmail(request, { subject: `${uniqueTag()} assignment rules` })
    const deleted = createUser({ role: 'AGENT' })

    const unauthenticated = await request.patch(`/api/tickets/${ticketId}`, { data: { assignedToId: null } })
    expect(unauthenticated.status()).toBe(401)

    await signInViaApi(request, admin)
    const adminId = (await (await request.get('/api/me')).json()).user.id as string
    const { users } = (await (await request.get('/api/users')).json()) as { users: { id: string; email: string }[] }
    const agentId = users.find((u) => u.email === agent.email)!.id
    const deletedId = users.find((u) => u.email === deleted.email)!.id
    const removed = await request.delete(`/api/users/${deletedId}`, { headers })
    expect(removed.status(), await removed.text()).toBe(204)

    const agentsRes = await request.get('/api/agents')
    expect(agentsRes.status()).toBe(200)
    const { agents } = (await agentsRes.json()) as { agents: { id: string; name: string }[] }
    expect(agents).toContainEqual({ id: agentId, name: agent.name })
    const listedIds = agents.map((a) => a.id)
    expect(listedIds).not.toContain(adminId)
    expect(listedIds).not.toContain(deletedId)

    const error = 'Tickets can only be assigned to an active agent'
    for (const assignedToId of [adminId, deletedId]) {
      const res = await request.patch(`/api/tickets/${ticketId}`, { data: { assignedToId } })
      expect(res.status(), `assignedToId ${assignedToId}`).toBe(400)
      expect(await res.json()).toEqual({ error, fieldErrors: { assignedToId: [error] } })
    }

    // The refused attempts left the ticket unassigned
    const ticket = (await (await request.get(`/api/tickets/${ticketId}`)).json()).ticket
    expect(ticket.assignedTo).toBeNull()
  })
})
