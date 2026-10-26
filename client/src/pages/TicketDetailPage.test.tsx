import { screen, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { renderWithQuery } from '@/test/render.tsx'
import TicketDetailPage from './TicketDetailPage.tsx'

vi.mock('axios')
const mockGet = vi.mocked(axios.get)

// As GET /api/tickets/:id returns it: messages oldest first
const ticket = {
  id: 42,
  subject: 'Refund for my course',
  fromEmail: 'casey@example.com',
  fromName: 'Casey Customer',
  status: 'OPEN',
  category: 'REFUND_REQUEST',
  assignedTo: { id: 'u1', name: 'Alan Agent' },
  createdAt: '2026-10-02T09:30:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
  messages: [
    {
      id: 1,
      senderType: 'CUSTOMER',
      author: null,
      fromEmail: 'casey@example.com',
      fromName: 'Casey Customer',
      body: 'Hi,\nI would like a refund.',
      receivedAt: '2026-10-02T09:30:00.000Z',
    },
    {
      id: 2,
      senderType: 'CUSTOMER',
      author: null,
      fromEmail: 'casey@example.com',
      fromName: 'Casey Customer',
      body: 'Any update?',
      receivedAt: '2026-10-03T10:00:00.000Z',
    },
    {
      id: 3,
      senderType: 'AGENT',
      author: { id: 'u1', name: 'Alan Agent' },
      fromEmail: 'alan@example.com',
      fromName: 'Alan Agent',
      body: 'We have refunded your order.',
      receivedAt: '2026-10-03T11:00:00.000Z',
    },
  ],
}

const agents = [
  { id: 'u1', name: 'Alan Agent' },
  { id: 'u2', name: 'Bea Agent' },
]

// GET /api/tickets/:id answers with the ticket, GET /api/agents (for the assignee select) with the agents
function mockApi(detail: unknown = ticket) {
  mockGet.mockImplementation((url) =>
    Promise.resolve(url === '/api/agents' ? { data: { agents } } : { data: { ticket: detail } })
  )
}

function renderPage(path = '/tickets/42') {
  return renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

function httpError(status?: number, message = 'Request failed') {
  return Object.assign(new Error(message), status ? { response: { status } } : {})
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('TicketDetailPage', () => {
  it('shows a loading skeleton while the ticket is being fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('status', { name: 'Loading ticket' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('requests the ticket from the URL id', async () => {
    mockApi()
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(mockGet).toHaveBeenCalledWith('/api/tickets/42')
    expect(mockGet).toHaveBeenCalledWith('/api/agents')
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('shows the ticket details', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: '#42 Refund for my course' })).toBeInTheDocument()
    expect(screen.getByText('From Casey Customer <casey@example.com>')).toBeInTheDocument()
    expect(screen.getAllByRole('term').map((dt) => dt.textContent)).toEqual([
      'Status',
      'Category',
      'Assigned to',
      'Created',
    ])
    const [, , , created] = screen.getAllByRole('definition')
    expect(created).toHaveTextContent(new Date(ticket.createdAt).toLocaleString())
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Open')
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Refund Request')
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveDisplayValue('Alan Agent')
  })

  it('shows placeholders for an unclassified, unassigned ticket', async () => {
    mockApi({ ...ticket, category: null, assignedTo: null })
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveDisplayValue('Unclassified')
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveDisplayValue('Unassigned')
  })

  it('shows every message in order with its sender, time and body', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'Message' })).toBeInTheDocument()
    const original = screen.getByRole('article', { name: 'Message from Casey Customer' })
    expect(within(original).getByText('Hi, I would like a refund.', { normalizer: (s) => s.replace(/\s+/g, ' ') })).toBeInTheDocument()
    expect(within(original).getByText(new Date(ticket.messages[0].receivedAt).toLocaleString())).toBeInTheDocument()
    expect(within(original).getByText('<casey@example.com>')).toBeInTheDocument()
    expect(within(original).getByText('Customer')).toBeInTheDocument()

    // Everything after the first message is the reply thread, oldest first
    expect(screen.getByRole('heading', { level: 2, name: 'Replies (2)' })).toBeInTheDocument()
    const replies = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(replies).toHaveLength(2)
    expect(replies[0]).toHaveAccessibleName('Message from Casey Customer')
    expect(within(replies[0]).getByText('Any update?')).toBeInTheDocument()
    expect(within(replies[0]).getByText('Customer')).toBeInTheDocument()
    expect(replies[1]).toHaveAccessibleName('Message from Alan Agent')
    expect(within(replies[1]).getByText('We have refunded your order.')).toBeInTheDocument()
    expect(within(replies[1]).getByText('Agent')).toBeInTheDocument()
  })

  it('marks an automatic answer from the AI', async () => {
    const aiReply = {
      id: 4,
      senderType: 'AI',
      author: null,
      fromEmail: 'support@example.com',
      fromName: 'AI Assistant',
      body: 'Go to the login page and click Forgot Password.',
      receivedAt: '2026-10-02T09:31:00.000Z',
    }
    mockApi({ ...ticket, status: 'RESOLVED', messages: [ticket.messages[0], aiReply] })
    renderPage()

    const reply = await screen.findByRole('listitem', { name: 'Message from AI Assistant' })
    expect(within(reply).getByText('AI')).toBeInTheDocument()
    expect(within(reply).getByText('Go to the login page and click Forgot Password.')).toBeInTheDocument()
  })

  it("shows whether an agent reply was emailed, and nothing on messages that aren't emailed", async () => {
    const [first, second, reply] = ticket.messages
    mockApi({
      ...ticket,
      messages: [
        first,
        { ...second, emailStatus: null, emailError: null },
        { ...reply, emailStatus: 'FAILED', emailError: 'AgentMail did not answer in time' },
      ],
    })
    renderPage()

    const agentReply = await screen.findByRole('listitem', { name: 'Message from Alan Agent' })
    expect(within(agentReply).getByRole('status')).toHaveTextContent('Email not sent: AgentMail did not answer in time')
    expect(within(agentReply).getByRole('button', { name: 'Retry sending' })).toBeInTheDocument()
    const followUp = screen.getByRole('listitem', { name: 'Message from Casey Customer' })
    expect(within(followUp).queryByRole('status')).not.toBeInTheDocument()
  })

  it('says there are no replies when the ticket has only its first message', async () => {
    mockApi({ ...ticket, messages: [ticket.messages[0]] })
    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'Replies (0)' })).toBeInTheDocument()
    expect(screen.getByText('No replies yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows the reply form below the thread', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByRole('textbox', { name: 'Reply' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeInTheDocument()
  })

  it('links back to the ticket list', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('link', { name: 'Back to tickets' })).toHaveAttribute('href', '/tickets')
  })

  it('shows "not found" when the API answers 404', async () => {
    mockGet.mockRejectedValue(httpError(404))
    renderPage()

    expect(await screen.findByText('Ticket not found.')).toBeInTheDocument()
  })

  it('shows "not found" without a request for a malformed id', () => {
    renderPage('/tickets/abc')

    expect(screen.getByText('Ticket not found.')).toBeInTheDocument()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('shows the HTTP status when the request fails', async () => {
    mockGet.mockRejectedValue(httpError(500))
    renderPage()

    expect(await screen.findByText('Could not load ticket (HTTP 500).')).toBeInTheDocument()
  })

  it('shows the error message on a network error', async () => {
    mockGet.mockRejectedValue(httpError(undefined, 'Network Error'))
    renderPage()

    expect(await screen.findByText('Could not load ticket (Network Error).')).toBeInTheDocument()
  })
})
