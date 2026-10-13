import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TicketDetail } from '@/pages/TicketDetailPage.tsx'
import { renderWithQuery } from '@/test/render.tsx'
import TicketAssigneeSelect from './TicketAssigneeSelect.tsx'

vi.mock('axios')
const mockGet = vi.mocked(axios.get)
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

const agents = [
  { id: 'u1', name: 'Alan Agent' },
  { id: 'u2', name: 'Bea Agent' },
]

function httpError(status?: number, data?: unknown, message = 'Request failed') {
  return Object.assign(new Error(message), status ? { response: { status, data } } : {})
}

function select() {
  return screen.getByRole('combobox', { name: 'Assigned to' })
}

// Waits until the agents have loaded and the select is enabled
async function loadedSelect() {
  await waitFor(() => expect(select()).toBeEnabled())
  return select()
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('TicketAssigneeSelect', () => {
  it('is disabled while the agents load', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<TicketAssigneeSelect ticket={ticket} />)

    expect(select()).toBeDisabled()
    expect(mockGet).toHaveBeenCalledWith('/api/agents')
  })

  it('offers "Unassigned" and every agent, with the current assignee selected', async () => {
    mockGet.mockResolvedValue({ data: { agents } })
    renderWithQuery(<TicketAssigneeSelect ticket={{ ...ticket, assignedTo: agents[1] }} />)

    const options = within(await loadedSelect()).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['Unassigned', 'Alan Agent', 'Bea Agent'])
    expect(select()).toHaveDisplayValue('Bea Agent')
  })

  it('keeps an assignee who is no longer an active agent selectable', async () => {
    mockGet.mockResolvedValue({ data: { agents } })
    renderWithQuery(<TicketAssigneeSelect ticket={{ ...ticket, assignedTo: { id: 'gone', name: 'Former Agent' } }} />)

    const options = within(await loadedSelect()).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Unassigned',
      'Former Agent',
      'Alan Agent',
      'Bea Agent',
    ])
    expect(select()).toHaveDisplayValue('Former Agent')
  })

  it('assigns the ticket to the chosen agent and updates the cached ticket', async () => {
    mockGet.mockResolvedValue({ data: { agents } })
    const updated = { ...ticket, assignedTo: agents[0] }
    mockPatch.mockResolvedValue({ data: { ticket: updated } })
    const { queryClient } = renderWithQuery(<TicketAssigneeSelect ticket={ticket} />)

    fireEvent.change(await loadedSelect(), { target: { value: 'u1' } })

    await waitFor(() => expect(queryClient.getQueryData(['tickets', 42])).toEqual(updated))
    expect(mockPatch).toHaveBeenCalledTimes(1)
    expect(mockPatch).toHaveBeenCalledWith('/api/tickets/42', { assignedToId: 'u1' })
  })

  it('unassigns the ticket with a null assignee', async () => {
    mockGet.mockResolvedValue({ data: { agents } })
    mockPatch.mockResolvedValue({ data: { ticket } })
    renderWithQuery(<TicketAssigneeSelect ticket={{ ...ticket, assignedTo: agents[0] }} />)

    fireEvent.change(await loadedSelect(), { target: { value: '' } })

    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/api/tickets/42', { assignedToId: null }))
  })

  it('shows the chosen agent and disables the select while saving', async () => {
    mockGet.mockResolvedValue({ data: { agents } })
    mockPatch.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<TicketAssigneeSelect ticket={ticket} />)

    fireEvent.change(await loadedSelect(), { target: { value: 'u2' } })

    await waitFor(() => expect(select()).toBeDisabled())
    expect(select()).toHaveDisplayValue('Bea Agent')
  })

  it("shows the server's error message when assigning fails", async () => {
    mockGet.mockResolvedValue({ data: { agents } })
    mockPatch.mockRejectedValue(httpError(400, { error: 'Tickets can only be assigned to an active agent' }))
    renderWithQuery(<TicketAssigneeSelect ticket={ticket} />)

    fireEvent.change(await loadedSelect(), { target: { value: 'u1' } })

    expect(
      await screen.findByText('Could not assign ticket (Tickets can only be assigned to an active agent).')
    ).toBeInTheDocument()
    // Back to the saved assignee
    expect(select()).toHaveDisplayValue('Unassigned')
    expect(select()).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the HTTP status when assigning fails without a message', async () => {
    mockGet.mockResolvedValue({ data: { agents } })
    mockPatch.mockRejectedValue(httpError(500))
    renderWithQuery(<TicketAssigneeSelect ticket={ticket} />)

    fireEvent.change(await loadedSelect(), { target: { value: 'u1' } })

    expect(await screen.findByText('Could not assign ticket (HTTP 500).')).toBeInTheDocument()
  })

  it('shows an error and stays disabled when the agents fail to load', async () => {
    mockGet.mockRejectedValue(httpError(403))
    renderWithQuery(<TicketAssigneeSelect ticket={ticket} />)

    expect(await screen.findByText('Could not load agents (HTTP 403).')).toBeInTheDocument()
    expect(select()).toBeDisabled()
  })
})
