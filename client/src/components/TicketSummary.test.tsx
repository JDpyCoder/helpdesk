import { fireEvent, screen, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import TicketSummary from './TicketSummary.tsx'

vi.mock('axios')
const mockPost = vi.mocked(axios.post)

function httpError(status?: number, data?: unknown, message = 'Request failed') {
  return Object.assign(new Error(message), status ? { response: { status, data } } : {})
}

function summarize() {
  fireEvent.click(screen.getByRole('button', { name: 'Summarize' }))
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('TicketSummary', () => {
  it('shows only the Summarize button until it is clicked', () => {
    renderWithQuery(<TicketSummary ticketId={42} />)

    expect(screen.getByRole('button', { name: 'Summarize' })).toBeEnabled()
    expect(screen.queryByRole('region', { name: 'Summary' })).not.toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('requests a summary and shows it', async () => {
    mockPost.mockResolvedValue({ data: { summary: 'Casey wants a refund for the course.' } })
    renderWithQuery(<TicketSummary ticketId={42} />)

    summarize()

    const region = await screen.findByRole('region', { name: 'Summary' })
    expect(within(region).getByText('Casey wants a refund for the course.')).toBeInTheDocument()
    expect(mockPost).toHaveBeenCalledWith('/api/tickets/42/summary')
  })

  it('disables the button and shows "Summarizing…" while the summary is generated', () => {
    mockPost.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<TicketSummary ticketId={42} />)

    summarize()

    expect(screen.getByRole('button', { name: 'Summarizing…' })).toBeDisabled()
  })

  it('generates a new summary on every click, keeping the old one until the new one arrives', async () => {
    mockPost.mockResolvedValueOnce({ data: { summary: 'First summary.' } })
    renderWithQuery(<TicketSummary ticketId={42} />)
    summarize()
    expect(await screen.findByText('First summary.')).toBeInTheDocument()

    let resolve!: (value: unknown) => void
    mockPost.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    summarize()

    const region = screen.getByRole('region', { name: 'Summary' })
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(within(region).getByText('First summary.')).toBeInTheDocument()

    resolve({ data: { summary: 'Second summary.' } })
    expect(await screen.findByText('Second summary.')).toBeInTheDocument()
    expect(screen.queryByText('First summary.')).not.toBeInTheDocument()
    expect(mockPost).toHaveBeenCalledTimes(2)
  })

  it("shows the server's error message when summarizing fails", async () => {
    mockPost.mockRejectedValue(httpError(502, { error: 'The AI service could not summarize the ticket. Try again.' }))
    renderWithQuery(<TicketSummary ticketId={42} />)

    summarize()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not summarize ticket (The AI service could not summarize the ticket. Try again.).'
    )
    expect(screen.getByRole('button', { name: 'Summarize' })).toBeEnabled()
  })

  it('shows the HTTP status or network error when there is no server message', async () => {
    mockPost.mockRejectedValue(httpError(undefined, undefined, 'Network Error'))
    renderWithQuery(<TicketSummary ticketId={42} />)

    summarize()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not summarize ticket (Network Error).')
  })

  it('clears the error once a retry succeeds', async () => {
    mockPost.mockRejectedValueOnce(httpError(503, { error: 'Ticket summaries are not configured' }))
    mockPost.mockResolvedValueOnce({ data: { summary: 'All good.' } })
    renderWithQuery(<TicketSummary ticketId={42} />)

    summarize()
    await screen.findByRole('alert')
    summarize()

    expect(await screen.findByText('All good.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
