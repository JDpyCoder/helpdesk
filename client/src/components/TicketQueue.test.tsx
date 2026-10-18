import { fireEvent, screen, within } from '@testing-library/react'
import axios from 'axios'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import TicketQueue, { queueParams } from './TicketQueue.tsx'

vi.mock('axios')
const mockGet = vi.mocked(axios.get)

// As GET /api/tickets returns them: newest first
const tickets = [
  {
    id: 2,
    subject: 'Refund for my course',
    fromEmail: 'casey@example.com',
    fromName: 'Casey Customer',
    status: 'OPEN',
    category: 'REFUND_REQUEST',
    assignedTo: null,
    createdAt: '2026-10-02T09:30:00.000Z',
    updatedAt: '2026-10-02T09:30:00.000Z',
    conversation: ['CUSTOMER', 'AI', 'CUSTOMER'],
  },
  {
    id: 1,
    subject: 'Cannot log in',
    fromEmail: 'sam@example.com',
    fromName: 'Sam Student',
    status: 'RESOLVED',
    category: null,
    assignedTo: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    conversation: ['CUSTOMER', 'AGENT'],
  },
]

function renderQueue(path = '/tickets/1', state?: unknown) {
  return renderWithQuery(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <TicketQueue />
    </MemoryRouter>
  )
}

// The query a filtered Tickets page sends, as TicketsTable puts it in the history state
const listQuery = { sortBy: 'subject', order: 'asc', status: 'OPEN', search: 'refund', page: 2, pageSize: 25 }

function httpError(status?: number) {
  return Object.assign(new Error('Request failed'), status ? { response: { status } } : {})
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('TicketQueue', () => {
  it('requests the latest tickets, newest first', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderQueue()

    expect(mockGet).toHaveBeenCalledWith('/api/tickets', { params: queueParams })
    expect(queueParams).toEqual({ sortBy: 'createdAt', order: 'desc', page: 1, pageSize: 25 })
  })

  it('shows the latest tickets when the ticket was not opened from the list', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderQueue()

    expect(screen.getByRole('heading', { name: 'Latest tickets' })).toBeInTheDocument()
  })

  it('shows the list the ticket was opened from: its filters, search, sort and page', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderQueue('/tickets/1', { ticketList: listQuery })

    expect(mockGet).toHaveBeenCalledWith('/api/tickets', { params: listQuery })
    expect(screen.getByRole('heading', { name: 'Your ticket list' })).toBeInTheDocument()
  })

  it('passes that list on to the next ticket', async () => {
    mockGet.mockResolvedValue({ data: { tickets, total: 2, page: 2, pageSize: 25 } })
    renderQueue('/tickets/1', { ticketList: listQuery })

    fireEvent.click(await screen.findByRole('link', { name: /Refund for my course/ }))

    // The open ticket changed, and the list it shows is still the filtered one
    const [newest] = await screen.findAllByRole('listitem')
    expect(within(newest).getByRole('link')).toHaveAttribute('aria-current', 'page')
    expect(mockGet).toHaveBeenLastCalledWith('/api/tickets', { params: listQuery })
    expect(screen.getByRole('heading', { name: 'Your ticket list' })).toBeInTheDocument()
  })

  it('falls back to the latest tickets when the history state is not a valid list', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderQueue('/tickets/1', { ticketList: { pageSize: 7 } })

    expect(mockGet).toHaveBeenCalledWith('/api/tickets', { params: queueParams })
  })

  it('shows a loading skeleton while tickets are being fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderQueue()

    expect(screen.getByRole('status', { name: 'Loading tickets' })).toBeInTheDocument()
  })

  it('lists each ticket with its customer, subject, conversation and status, linking to the ticket', async () => {
    mockGet.mockResolvedValue({ data: { tickets, total: 2, page: 1, pageSize: 25 } })
    renderQueue()

    const nav = screen.getByRole('navigation', { name: 'Ticket list' })
    const [newest, oldest] = await within(nav).findAllByRole('listitem')
    const link = within(newest).getByRole('link')
    expect(link).toHaveAttribute('href', '/tickets/2')
    expect(within(link).getByText('Casey Customer')).toBeInTheDocument()
    expect(within(link).getByText('Refund for my course')).toBeInTheDocument()
    expect(within(link).getByRole('img', { name: 'Conversation: Customer, then AI, then Customer' })).toBeInTheDocument()
    expect(within(link).getByText('Open')).toBeInTheDocument()
    expect(within(oldest).getByText('Resolved')).toBeInTheDocument()
  })

  it('marks the open ticket as the current page', async () => {
    mockGet.mockResolvedValue({ data: { tickets, total: 2, page: 1, pageSize: 25 } })
    renderQueue('/tickets/1')

    const [newest, oldest] = await screen.findAllByRole('listitem')
    expect(within(oldest).getByRole('link')).toHaveAttribute('aria-current', 'page')
    expect(within(newest).getByRole('link')).not.toHaveAttribute('aria-current')
  })

  it('links to the full ticket list', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderQueue()

    expect(screen.getByRole('link', { name: 'All tickets' })).toHaveAttribute('href', '/tickets')
  })

  it('shows an empty state when there are no tickets', async () => {
    mockGet.mockResolvedValue({ data: { tickets: [], total: 0, page: 1, pageSize: 25 } })
    renderQueue()

    expect(await screen.findByText('No tickets in this list.')).toBeInTheDocument()
  })

  it('shows the HTTP status when loading fails', async () => {
    mockGet.mockRejectedValue(httpError(500))
    renderQueue()

    expect(await screen.findByText('Could not load tickets (HTTP 500).')).toBeInTheDocument()
  })
})
