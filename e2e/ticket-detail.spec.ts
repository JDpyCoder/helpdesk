import { randomUUID } from 'node:crypto'
import {
  expect,
  inboundEmailHeaders,
  signIn,
  signInViaApi,
  test,
  uniqueEmail,
  uniqueMessageId,
} from './fixtures'

// GET /api/tickets/:id and the /tickets/:id page. Rendering states are covered by
// TicketDetailPage.test.tsx; these tests check the real journey from an inbound email
// (plus a threaded reply) to the page, and the endpoint's server-side checks.

// The largest id ticketIdSchema accepts, so it is valid but never belongs to a real ticket
const MISSING_ID = 2147483647

test.describe('Ticket detail', () => {
  test('an agent opens a ticket from the list and sees the email thread oldest first', async ({ page, request, agent }) => {
    const tag = `D${Date.now()}-${randomUUID().slice(0, 8)}`
    const subject = `${tag} cannot log in`
    const customer = { email: uniqueEmail('customer'), name: 'Dana Detail' }
    const colleague = { email: uniqueEmail('colleague'), name: 'Remy Reply' }
    const originalId = uniqueMessageId('original')

    const created = await request.post('/api/inbound-email', {
      data: { from: customer, subject, text: `${tag} original body`, messageId: originalId },
      headers: inboundEmailHeaders(),
    })
    expect(created.status(), await created.text()).toBe(201)
    const ticketId = (await created.json()).ticketId as number

    const replied = await request.post('/api/inbound-email', {
      data: {
        from: colleague,
        subject: `Re: ${subject}`,
        text: `${tag} reply body`,
        messageId: uniqueMessageId('reply'),
        inReplyTo: originalId,
      },
      headers: inboundEmailHeaders(),
    })
    expect(replied.status(), await replied.text()).toBe(200)
    expect(await replied.json()).toEqual({ ticketId, created: false })

    await signIn(page, agent)
    await page.goto('/tickets')
    await page.getByRole('searchbox', { name: 'Search' }).fill(tag)
    await page.getByRole('link', { name: subject }).click()

    await expect(page).toHaveURL(`/tickets/${ticketId}`)
    await expect(page.getByRole('heading', { level: 1, name: `#${ticketId} ${subject}` })).toBeVisible()
    await expect(page.getByText(`From ${customer.name} <${customer.email}>`)).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Messages (2)' })).toBeVisible()
    const messages = page.getByRole('listitem', { name: /^Message from / })
    await expect(messages).toHaveCount(2)
    await expect(messages.nth(0)).toHaveAccessibleName(`Message from ${customer.name}`)
    await expect(messages.nth(0)).toContainText(`${tag} original body`)
    await expect(messages.nth(1)).toHaveAccessibleName(`Message from ${colleague.name}`)
    await expect(messages.nth(1)).toContainText(`${tag} reply body`)

    await page.getByRole('link', { name: 'Back to tickets' }).click()
    await expect(page).toHaveURL('/tickets')
  })

  test('the API requires a session and answers 404 for an unknown ticket', async ({ request, agent }) => {
    const unauthenticated = await request.get(`/api/tickets/${MISSING_ID}`)
    expect(unauthenticated.status()).toBe(401)
    expect(await unauthenticated.json()).toEqual({ error: 'Unauthorized' })

    await signInViaApi(request, agent)
    const missing = await request.get(`/api/tickets/${MISSING_ID}`)

    expect(missing.status()).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Ticket not found' })
  })
})
