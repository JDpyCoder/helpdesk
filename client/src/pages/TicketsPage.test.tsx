import { screen, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import TicketsPage from './TicketsPage.tsx'

vi.mock('axios')
const mockGet = vi.mocked(axios.get)

// As the API returns them: newest first
const tickets = [
  {
    id: 2,
    subject: 'Refund for my course',
    fromEmail: 'casey@example.com',
    fromName: 'Casey Customer',
    status: 'OPEN',
    category: 'REFUND_REQUEST',
    assignedTo: { id: 'u1', name: 'Alan Agent' },
    createdAt: '2026-10-02T09:30:00.000Z',
    updatedAt: '2026-10-02T09:30:00.000Z',
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
  },
]

function httpError(status?: number, message = 'Request failed') {
  return Object.assign(new Error(message), status ? { response: { status } } : {})
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('TicketsPage', () => {
  it('shows the page heading', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<TicketsPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Tickets' })).toBeInTheDocument()
  })

  it('shows a loading skeleton while tickets are being fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<TicketsPage />)

    expect(screen.getByRole('status', { name: 'Loading tickets' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('requests the ticket list from the API', async () => {
    mockGet.mockResolvedValue({ data: { tickets } })
    renderWithQuery(<TicketsPage />)

    await screen.findByRole('table')
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/api/tickets')
  })

  it('renders a row per ticket in the order the API returns them', async () => {
    mockGet.mockResolvedValue({ data: { tickets } })
    renderWithQuery(<TicketsPage />)

    const table = await screen.findByRole('table')
    expect(screen.queryByRole('status', { name: 'Loading tickets' })).not.toBeInTheDocument()

    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['#', 'Subject', 'From', 'Status', 'Category', 'Assigned to', 'Created'])

    const [, newest, oldest] = within(table).getAllByRole('row')
    expect(within(newest).getAllByRole('cell').map((td) => td.textContent)).toEqual([
      '2',
      'Refund for my course',
      'Casey Customercasey@example.com',
      'Open',
      'Refund request',
      'Alan Agent',
      new Date(tickets[0].createdAt).toLocaleString(),
    ])
    expect(within(oldest).getAllByRole('cell').map((td) => td.textContent)).toEqual([
      '1',
      'Cannot log in',
      'Sam Studentsam@example.com',
      'Resolved',
      'Unclassified',
      'Unassigned',
      new Date(tickets[1].createdAt).toLocaleString(),
    ])
  })

  it('shows an empty state when there are no tickets', async () => {
    mockGet.mockResolvedValue({ data: { tickets: [] } })
    renderWithQuery(<TicketsPage />)

    expect(await screen.findByText('No tickets yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the HTTP status when loading fails', async () => {
    mockGet.mockRejectedValue(httpError(500))
    renderWithQuery(<TicketsPage />)

    expect(await screen.findByText('Could not load tickets (HTTP 500).')).toBeInTheDocument()
  })
})
