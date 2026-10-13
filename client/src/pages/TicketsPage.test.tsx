import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
    expect(mockGet).toHaveBeenCalledWith('/api/tickets', { params: { sortBy: 'createdAt', order: 'desc' } })
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

  describe('sorting', () => {
    function header(name: string) {
      return screen.getByRole('columnheader', { name })
    }

    function sortButton(name: string) {
      return within(header(name)).getByRole('button', { name })
    }

    it('marks the Created column as sorted descending by default', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)

      await screen.findByRole('table')
      expect(header('Created')).toHaveAttribute('aria-sort', 'descending')
      for (const name of ['#', 'Subject', 'From', 'Status', 'Category', 'Assigned to']) {
        expect(header(name)).toHaveAttribute('aria-sort', 'none')
      }
    })

    it('sorts by subject ascending, then descending, on repeated clicks', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.click(sortButton('Subject'))
      await waitFor(() =>
        expect(mockGet).toHaveBeenLastCalledWith('/api/tickets', { params: { sortBy: 'subject', order: 'asc' } }),
      )
      expect(header('Subject')).toHaveAttribute('aria-sort', 'ascending')
      expect(header('Created')).toHaveAttribute('aria-sort', 'none')

      fireEvent.click(sortButton('Subject'))
      await waitFor(() =>
        expect(mockGet).toHaveBeenLastCalledWith('/api/tickets', { params: { sortBy: 'subject', order: 'desc' } }),
      )
      expect(header('Subject')).toHaveAttribute('aria-sort', 'descending')
    })

    it('toggles Created to ascending, never back to unsorted', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.click(sortButton('Created'))
      await waitFor(() =>
        expect(mockGet).toHaveBeenLastCalledWith('/api/tickets', { params: { sortBy: 'createdAt', order: 'asc' } }),
      )
      expect(header('Created')).toHaveAttribute('aria-sort', 'ascending')

      fireEvent.click(sortButton('Created'))
      expect(header('Created')).toHaveAttribute('aria-sort', 'descending')
    })

    it('sends the column id as sortBy for the From and Assigned to columns', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.click(sortButton('Assigned to'))
      await waitFor(() =>
        expect(mockGet).toHaveBeenLastCalledWith('/api/tickets', { params: { sortBy: 'assignedTo', order: 'asc' } }),
      )

      fireEvent.click(sortButton('From'))
      await waitFor(() =>
        expect(mockGet).toHaveBeenLastCalledWith('/api/tickets', { params: { sortBy: 'fromName', order: 'asc' } }),
      )
    })

    it('starts the # column descending', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.click(sortButton('#'))
      await waitFor(() =>
        expect(mockGet).toHaveBeenLastCalledWith('/api/tickets', { params: { sortBy: 'id', order: 'desc' } }),
      )
    })

    it('keeps showing the current rows while the re-sorted list loads', async () => {
      mockGet.mockResolvedValueOnce({ data: { tickets } }).mockReturnValue(new Promise(() => {}))
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.click(sortButton('Subject'))
      await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))

      expect(screen.queryByRole('status', { name: 'Loading tickets' })).not.toBeInTheDocument()
      expect(screen.getByRole('cell', { name: 'Refund for my course' })).toBeInTheDocument()
      expect(header('Subject')).toHaveAttribute('aria-sort', 'ascending')
    })

    it('shows rows in the order the API returns them after re-sorting', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { tickets } })
        .mockResolvedValueOnce({ data: { tickets: [...tickets].reverse() } })
      renderWithQuery(<TicketsPage />)
      const table = await screen.findByRole('table')

      fireEvent.click(sortButton('Subject'))

      await waitFor(() => {
        const [, first, second] = within(table).getAllByRole('row')
        expect(within(first).getAllByRole('cell')[1]).toHaveTextContent('Cannot log in')
        expect(within(second).getAllByRole('cell')[1]).toHaveTextContent('Refund for my course')
      })
    })
  })

  describe('filtering', () => {
    function lastParams() {
      return mockGet.mock.lastCall?.[1]?.params
    }

    it('shows Status and Category filters set to All by default', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      const status = screen.getByRole('combobox', { name: 'Status' })
      const category = screen.getByRole('combobox', { name: 'Category' })
      expect(status).toHaveValue('')
      expect(category).toHaveValue('')
      expect(within(status).getAllByRole('option').map((o) => o.textContent)).toEqual(
        ['All statuses', 'Open', 'Resolved', 'Closed'],
      )
      expect(within(category).getAllByRole('option').map((o) => o.textContent)).toEqual(
        ['All categories', 'General question', 'Technical question', 'Refund request', 'Unclassified'],
      )
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })

    it('requests tickets with the selected status', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'RESOLVED' } })

      await waitFor(() => expect(lastParams()).toEqual({ sortBy: 'createdAt', order: 'desc', status: 'RESOLVED' }))
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('RESOLVED')
    })

    it('requests unclassified tickets with category=none', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'none' } })

      await waitFor(() => expect(lastParams()).toEqual({ sortBy: 'createdAt', order: 'desc', category: 'none' }))
    })

    it('combines both filters with the current sort', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.click(within(screen.getByRole('columnheader', { name: 'Subject' })).getByRole('button'))
      fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'OPEN' } })
      fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'REFUND_REQUEST' } })

      await waitFor(() =>
        expect(lastParams()).toEqual({ sortBy: 'subject', order: 'asc', status: 'OPEN', category: 'REFUND_REQUEST' }),
      )
    })

    it('drops a filter when its All option is chosen again', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')
      const status = screen.getByRole('combobox', { name: 'Status' })

      fireEvent.change(status, { target: { value: 'CLOSED' } })
      await waitFor(() => expect(lastParams()).toHaveProperty('status', 'CLOSED'))

      fireEvent.change(status, { target: { value: '' } })
      await waitFor(() => expect(lastParams()).toEqual({ sortBy: 'createdAt', order: 'desc' }))
    })

    it('clears all filters with the Clear filters button', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'OPEN' } })
      fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'none' } })
      fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }))

      await waitFor(() => expect(lastParams()).toEqual({ sortBy: 'createdAt', order: 'desc' }))
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('')
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })

    it('shows a no-matches message and keeps the filters when nothing matches', async () => {
      mockGet.mockResolvedValueOnce({ data: { tickets } }).mockResolvedValue({ data: { tickets: [] } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'CLOSED' } })

      expect(await screen.findByText('No tickets match your search or filters.')).toBeInTheDocument()
      expect(screen.queryByText('No tickets yet.')).not.toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('CLOSED')
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
    })

    it('keeps the current rows, marked busy, while the filtered list loads', async () => {
      mockGet.mockResolvedValueOnce({ data: { tickets } }).mockReturnValue(new Promise(() => {}))
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'OPEN' } })

      await waitFor(() => expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true'))
      expect(screen.getByRole('cell', { name: 'Refund for my course' })).toBeInTheDocument()
      expect(screen.queryByRole('status', { name: 'Loading tickets' })).not.toBeInTheDocument()
    })
  })

  describe('search', () => {
    function lastParams() {
      return mockGet.mock.lastCall?.[1]?.params
    }

    function searchBox() {
      return screen.getByRole('searchbox', { name: 'Search' })
    }

    it('shows an empty search box', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      expect(searchBox()).toHaveValue('')
      expect(searchBox()).toHaveAttribute('placeholder', 'Subject, customer or #id')
    })

    it('sends the search once typing pauses, not on every keystroke', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      for (const value of ['r', 're', 'ref', 'refund']) fireEvent.change(searchBox(), { target: { value } })

      await waitFor(() => expect(lastParams()).toEqual({ sortBy: 'createdAt', order: 'desc', search: 'refund' }))
      // The initial load plus one search request
      expect(mockGet).toHaveBeenCalledTimes(2)
    })

    it('trims the search and leaves a blank one out of the request', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.change(searchBox(), { target: { value: '  casey  ' } })
      await waitFor(() => expect(lastParams()).toEqual({ sortBy: 'createdAt', order: 'desc', search: 'casey' }))

      fireEvent.change(searchBox(), { target: { value: '   ' } })
      await waitFor(() => expect(lastParams()).toEqual({ sortBy: 'createdAt', order: 'desc' }))
    })

    it('combines the search with filters and sorting', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.click(within(screen.getByRole('columnheader', { name: 'Subject' })).getByRole('button'))
      fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'OPEN' } })
      fireEvent.change(searchBox(), { target: { value: '#42' } })

      await waitFor(() =>
        expect(lastParams()).toEqual({ sortBy: 'subject', order: 'asc', status: 'OPEN', search: '#42' }),
      )
    })

    it('shows Clear filters while searching, and clearing empties the search box', async () => {
      mockGet.mockResolvedValue({ data: { tickets } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.change(searchBox(), { target: { value: 'login' } })
      await waitFor(() => expect(lastParams()).toHaveProperty('search', 'login'))
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

      expect(searchBox()).toHaveValue('')
      await waitFor(() => expect(lastParams()).toEqual({ sortBy: 'createdAt', order: 'desc' }))
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })

    it('shows the no-matches message when the search finds nothing', async () => {
      mockGet.mockResolvedValueOnce({ data: { tickets } }).mockResolvedValue({ data: { tickets: [] } })
      renderWithQuery(<TicketsPage />)
      await screen.findByRole('table')

      fireEvent.change(searchBox(), { target: { value: 'no such ticket' } })

      expect(await screen.findByText('No tickets match your search or filters.')).toBeInTheDocument()
      expect(searchBox()).toHaveValue('no such ticket')
    })
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
