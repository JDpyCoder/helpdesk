import { fireEvent, screen, waitFor } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import TicketReplyForm from './TicketReplyForm.tsx'

vi.mock('axios')
const mockPost = vi.mocked(axios.post)

// As POST /api/tickets/:id/replies returns it: the ticket in the detail shape, with the new reply last
const updatedTicket = {
  id: 42,
  subject: 'Refund for my course',
  messages: [
    {
      id: 7,
      senderType: 'AGENT',
      author: { id: 'u1', name: 'Alan Agent' },
      fromEmail: 'alan@example.com',
      fromName: 'Alan Agent',
      body: 'We have refunded your order.',
      receivedAt: '2026-10-03T11:00:00.000Z',
    },
  ],
}

function httpError(status?: number, data?: unknown) {
  return Object.assign(new Error('Request failed'), status ? { response: { status, data } } : {})
}

function typeReply(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Reply' }), { target: { value } })
}

function send() {
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('TicketReplyForm', () => {
  it('starts with an empty, enabled reply box, a disabled Send reply button and no error', () => {
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    const textbox = screen.getByRole('textbox', { name: 'Reply' })
    expect(textbox).toHaveValue('')
    expect(textbox).toBeEnabled()
    expect(textbox).toHaveAttribute('placeholder', 'Write a reply to the customer…')
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('enables Send reply from 5 characters, and disables it again when the reply gets shorter', () => {
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('Okay')
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled()

    typeReply('On it')
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeEnabled()

    typeReply('')
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled()
  })

  it('counts characters after trimming, without a validation error', () => {
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('   Okay \n  ')
    send()

    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled()
    expect(screen.queryByText('Reply must be at least 5 characters')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveAttribute('aria-invalid', 'false')
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('rejects a reply over 10,000 characters', async () => {
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('a'.repeat(10001))
    send()

    expect(await screen.findByText('Reply must be at most 10,000 characters')).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('accepts a reply of exactly 10,000 characters', async () => {
    mockPost.mockResolvedValue({ data: { ticket: updatedTicket } })
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('a'.repeat(10000))
    send()

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/tickets/42/replies', { body: 'a'.repeat(10000) }))
  })

  it('clears the validation error once the reply is fixed', async () => {
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('a'.repeat(10001))
    send()
    expect(await screen.findByText('Reply must be at most 10,000 characters')).toBeInTheDocument()

    typeReply('On it')

    await waitFor(() =>
      expect(screen.queryByText('Reply must be at most 10,000 characters')).not.toBeInTheDocument()
    )
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveAttribute('aria-invalid', 'false')
  })

  it('posts the trimmed reply, stores the returned ticket and clears the box', async () => {
    mockPost.mockResolvedValue({ data: { ticket: updatedTicket } })
    const { queryClient } = renderWithQuery(<TicketReplyForm ticketId={42} />)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    typeReply('  We have refunded your order.  ')
    send()

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue(''))
    expect(mockPost).toHaveBeenCalledWith('/api/tickets/42/replies', { body: 'We have refunded your order.' })
    expect(queryClient.getQueryData(['tickets', 42])).toEqual(updatedTicket)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] })
  })

  it('disables the form while the reply is being sent', async () => {
    mockPost.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('On it')
    send()

    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeDisabled()
  })

  it("shows the server's error and keeps the reply", async () => {
    mockPost.mockRejectedValue(httpError(404, { error: 'Ticket not found' }))
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('On it')
    send()

    expect(await screen.findByText('Could not send reply (Ticket not found).')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('On it')
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeEnabled()
  })

  it('shows the HTTP status when the server sends no message', async () => {
    mockPost.mockRejectedValue(httpError(500))
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('On it')
    send()

    expect(await screen.findByText('Could not send reply (HTTP 500).')).toBeInTheDocument()
  })

  it('shows the error message for a network error', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'))
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('On it')
    send()

    expect(await screen.findByText('Could not send reply (Network Error).')).toBeInTheDocument()
  })

  it('clears the error when a retry succeeds', async () => {
    mockPost.mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce({ data: { ticket: updatedTicket } })
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('On it')
    send()
    expect(await screen.findByText('Could not send reply (HTTP 500).')).toBeInTheDocument()

    send()

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue(''))
    expect(screen.queryByText('Could not send reply (HTTP 500).')).not.toBeInTheDocument()
    expect(mockPost).toHaveBeenCalledTimes(2)
  })
})

describe('TicketReplyForm: Polish', () => {
  function polish() {
    fireEvent.click(screen.getByRole('button', { name: 'Polish' }))
  }

  it('shows the Polish button immediately before Send reply', () => {
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    const buttons = screen.getAllByRole('button')
    const polishIndex = buttons.indexOf(screen.getByRole('button', { name: 'Polish' }))
    expect(buttons[polishIndex + 1]).toBe(screen.getByRole('button', { name: 'Send reply' }))
  })

  it('replaces the draft with the polished reply without sending it', async () => {
    mockPost.mockResolvedValue({ data: { body: 'Hi Carla, we have refunded your order.' } })
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('  hi carla we refunded ur order  ')
    polish()

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('Hi Carla, we have refunded your order.')
    )
    expect(mockPost).toHaveBeenCalledTimes(1)
    // Sent as typed; the server trims it with polishReplySchema
    expect(mockPost).toHaveBeenCalledWith('/api/tickets/42/replies/polish', { body: '  hi carla we refunded ur order  ' })
  })

  it('sends the polished reply when Send reply is clicked afterwards', async () => {
    mockPost
      .mockResolvedValueOnce({ data: { body: 'Hi Carla, we have refunded your order.' } })
      .mockResolvedValueOnce({ data: { ticket: updatedTicket } })
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('hi carla we refunded ur order')
    polish()
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('Hi Carla, we have refunded your order.')
    )
    send()

    await waitFor(() =>
      expect(mockPost).toHaveBeenLastCalledWith('/api/tickets/42/replies', {
        body: 'Hi Carla, we have refunded your order.',
      })
    )
  })

  it('disables Polish until the draft has 5 characters, without a validation error', () => {
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    expect(screen.getByRole('button', { name: 'Polish' })).toBeDisabled()
    typeReply('  Okay  ')
    polish()
    expect(screen.getByRole('button', { name: 'Polish' })).toBeDisabled()
    expect(screen.queryByText('Reply must be at least 5 characters')).not.toBeInTheDocument()

    typeReply('On it')
    expect(screen.getByRole('button', { name: 'Polish' })).toBeEnabled()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('shows the length error instead of polishing a draft over 10,000 characters', async () => {
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('a'.repeat(10001))
    polish()

    expect(await screen.findByText('Reply must be at most 10,000 characters')).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('disables the form while polishing', async () => {
    mockPost.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('On it')
    polish()

    expect(await screen.findByRole('button', { name: 'Polishing…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeDisabled()
  })

  it("shows the server's error and keeps the draft", async () => {
    mockPost.mockRejectedValue(httpError(503, { error: 'Reply polishing is not configured' }))
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('On it')
    polish()

    expect(await screen.findByText('Could not polish reply (Reply polishing is not configured).')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('On it')
    expect(screen.getByRole('button', { name: 'Polish' })).toBeEnabled()
  })

  it('clears the error when polishing again succeeds', async () => {
    mockPost.mockRejectedValueOnce(httpError(502)).mockResolvedValueOnce({ data: { body: 'On it!' } })
    renderWithQuery(<TicketReplyForm ticketId={42} />)

    typeReply('On it')
    polish()
    expect(await screen.findByText('Could not polish reply (HTTP 502).')).toBeInTheDocument()

    polish()

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('On it!'))
    expect(screen.queryByText('Could not polish reply (HTTP 502).')).not.toBeInTheDocument()
  })
})
