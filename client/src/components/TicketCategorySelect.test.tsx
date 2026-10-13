import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicketDetail } from '@/pages/TicketDetailPage.tsx'
import { renderWithQuery } from '@/test/render.tsx'
import TicketCategorySelect from './TicketCategorySelect.tsx'

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
  return screen.getByRole('combobox', { name: 'Category' })
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('TicketCategorySelect', () => {
  it('offers "Unclassified" and every category', () => {
    renderWithQuery(<TicketCategorySelect ticket={ticket} />)

    const options = within(select()).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Unclassified',
      'General Question',
      'Technical Question',
      'Refund Request',
    ])
    expect(select()).toHaveDisplayValue('Unclassified')
  })

  it('selects the current category', () => {
    renderWithQuery(<TicketCategorySelect ticket={{ ...ticket, category: 'TECHNICAL_QUESTION' }} />)

    expect(select()).toHaveDisplayValue('Technical Question')
  })

  it('saves the chosen category and updates the cached ticket', async () => {
    const updated = { ...ticket, category: 'REFUND_REQUEST' as const }
    mockPatch.mockResolvedValue({ data: { ticket: updated } })
    const { queryClient } = renderWithQuery(<TicketCategorySelect ticket={ticket} />)

    fireEvent.change(select(), { target: { value: 'REFUND_REQUEST' } })

    await waitFor(() => expect(queryClient.getQueryData(['tickets', 42])).toEqual(updated))
    expect(mockPatch).toHaveBeenCalledTimes(1)
    expect(mockPatch).toHaveBeenCalledWith('/api/tickets/42', { category: 'REFUND_REQUEST' })
  })

  it('clears the category with null when "Unclassified" is chosen', async () => {
    mockPatch.mockResolvedValue({ data: { ticket } })
    renderWithQuery(<TicketCategorySelect ticket={{ ...ticket, category: 'GENERAL_QUESTION' }} />)

    fireEvent.change(select(), { target: { value: '' } })

    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/api/tickets/42', { category: null }))
  })

  it('shows the chosen category and disables the select while saving', async () => {
    mockPatch.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<TicketCategorySelect ticket={{ ...ticket, category: 'GENERAL_QUESTION' }} />)

    fireEvent.change(select(), { target: { value: '' } })

    await waitFor(() => expect(select()).toBeDisabled())
    expect(select()).toHaveDisplayValue('Unclassified')
  })

  it("shows the server's error message and goes back to the saved category when saving fails", async () => {
    mockPatch.mockRejectedValue(httpError(400, { error: 'Invalid option' }))
    renderWithQuery(<TicketCategorySelect ticket={ticket} />)

    fireEvent.change(select(), { target: { value: 'REFUND_REQUEST' } })

    expect(await screen.findByText('Could not update category (Invalid option).')).toBeInTheDocument()
    expect(select()).toHaveDisplayValue('Unclassified')
    expect(select()).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the error message on a network error', async () => {
    mockPatch.mockRejectedValue(httpError(undefined, undefined, 'Network Error'))
    renderWithQuery(<TicketCategorySelect ticket={ticket} />)

    fireEvent.change(select(), { target: { value: 'REFUND_REQUEST' } })

    expect(await screen.findByText('Could not update category (Network Error).')).toBeInTheDocument()
  })
})
