import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicketDetail } from '@/pages/TicketDetailPage.tsx'
import { renderWithQuery } from '@/test/render.tsx'
import TicketStatusSelect from './TicketStatusSelect.tsx'

vi.mock('axios')
const mockPatch = vi.mocked(axios.patch)

const ticket: TicketDetail = {
  id: 42,
  subject: 'Refund for my course',
  fromEmail: 'casey@example.com',
  fromName: 'Casey Customer',
  status: 'OPEN',
  category: null,
  assignedTo: null,
  createdAt: '2026-10-02T09:30:00.000Z',
  updatedAt: '2026-10-02T09:30:00.000Z',
  messages: [],
}

function httpError(status?: number, data?: unknown, message = 'Request failed') {
  return Object.assign(new Error(message), status ? { response: { status, data } } : {})
}

function select() {
  return screen.getByRole('combobox', { name: 'Status' })
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('TicketStatusSelect', () => {
  it('offers every status, with the current one selected', () => {
    renderWithQuery(<TicketStatusSelect ticket={{ ...ticket, status: 'RESOLVED' }} />)

    const options = within(select()).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Open', 'Resolved', 'Closed'])
    expect(select()).toHaveDisplayValue('Resolved')
    expect(select()).toBeEnabled()
  })

  it('saves the chosen status and updates the cached ticket', async () => {
    const updated = { ...ticket, status: 'CLOSED' as const }
    mockPatch.mockResolvedValue({ data: { ticket: updated } })
    const { queryClient } = renderWithQuery(<TicketStatusSelect ticket={ticket} />)

    fireEvent.change(select(), { target: { value: 'CLOSED' } })

    await waitFor(() => expect(queryClient.getQueryData(['tickets', 42])).toEqual(updated))
    expect(mockPatch).toHaveBeenCalledTimes(1)
    expect(mockPatch).toHaveBeenCalledWith('/api/tickets/42', { status: 'CLOSED' })
  })

  it('shows the chosen status and disables the select while saving', async () => {
    mockPatch.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<TicketStatusSelect ticket={ticket} />)

    fireEvent.change(select(), { target: { value: 'RESOLVED' } })

    await waitFor(() => expect(select()).toBeDisabled())
    expect(select()).toHaveDisplayValue('Resolved')
  })

  it("shows the server's error message and goes back to the saved status when saving fails", async () => {
    mockPatch.mockRejectedValue(httpError(400, { error: 'Invalid option' }))
    renderWithQuery(<TicketStatusSelect ticket={ticket} />)

    fireEvent.change(select(), { target: { value: 'CLOSED' } })

    expect(await screen.findByText('Could not update status (Invalid option).')).toBeInTheDocument()
    expect(select()).toHaveDisplayValue('Open')
    expect(select()).toBeEnabled()
    expect(select()).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the HTTP status when saving fails without a message', async () => {
    mockPatch.mockRejectedValue(httpError(500))
    renderWithQuery(<TicketStatusSelect ticket={ticket} />)

    fireEvent.change(select(), { target: { value: 'CLOSED' } })

    expect(await screen.findByText('Could not update status (HTTP 500).')).toBeInTheDocument()
  })
})
