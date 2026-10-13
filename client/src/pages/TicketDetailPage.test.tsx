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
      fromEmail: 'casey@example.com',
      fromName: 'Casey Customer',
      body: 'Hi,\nI would like a refund.',
      receivedAt: '2026-10-02T09:30:00.000Z',
    },
    {
      id: 2,
      fromEmail: 'casey@example.com',
      fromName: 'Casey Customer',
      body: 'Any update?',
      receivedAt: '2026-10-03T10:00:00.000Z',
    },
  ],
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
    mockGet.mockResolvedValue({ data: { ticket } })
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/api/tickets/42')
  })

  it('shows the ticket details', async () => {
    mockGet.mockResolvedValue({ data: { ticket } })
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: '#42 Refund for my course' })).toBeInTheDocument()
    expect(screen.getByText('From Casey Customer <casey@example.com>')).toBeInTheDocument()
    expect(screen.getAllByRole('term').map((dt) => dt.textContent)).toEqual([
      'Status',
      'Category',
      'Assigned to',
      'Created',
    ])
    expect(screen.getAllByRole('definition').map((dd) => dd.textContent)).toEqual([
      'Open',
      'Refund request',
      'Alan Agent',
      new Date(ticket.createdAt).toLocaleString(),
    ])
  })

  it('shows placeholders for an unclassified, unassigned ticket', async () => {
    mockGet.mockResolvedValue({ data: { ticket: { ...ticket, category: null, assignedTo: null } } })
    renderPage()

    await screen.findByRole('heading', { level: 1 })
    const [, category, assignedTo] = screen.getAllByRole('definition')
    expect(category).toHaveTextContent('Unclassified')
    expect(assignedTo).toHaveTextContent('Unassigned')
  })

  it('shows every message in order with its sender, time and body', async () => {
    mockGet.mockResolvedValue({ data: { ticket } })
    renderPage()

    expect(await screen.findByRole('heading', { level: 2, name: 'Messages (2)' })).toBeInTheDocument()
    const [first, second] = screen.getAllByRole('listitem', { name: 'Message from Casey Customer' })
    expect(within(first).getByText('Hi, I would like a refund.', { normalizer: (s) => s.replace(/\s+/g, ' ') })).toBeInTheDocument()
    expect(within(first).getByText(new Date(ticket.messages[0].receivedAt).toLocaleString())).toBeInTheDocument()
    expect(within(first).getByText('<casey@example.com>')).toBeInTheDocument()
    expect(within(second).getByText('Any update?')).toBeInTheDocument()
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
