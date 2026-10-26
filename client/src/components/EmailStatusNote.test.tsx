import { fireEvent, screen } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import EmailStatusNote from './EmailStatusNote.tsx'

vi.mock('axios')
const mockPost = vi.mocked(axios.post)

function httpError(status?: number, data?: unknown, message = 'Request failed') {
  return Object.assign(new Error(message), status ? { response: { status, data } } : {})
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('EmailStatusNote', () => {
  it.each([
    ['SENT', 'Emailed'],
    ['DELIVERED', 'Delivered'],
    ['PENDING', 'Sending email…'],
  ] as const)('shows %s as "%s", without a retry button', (emailStatus, label) => {
    renderWithQuery(<EmailStatusNote ticketId={42} messageId={7} emailStatus={emailStatus} emailError={null} />)

    expect(screen.getByRole('status')).toHaveTextContent(label)
    expect(screen.queryByRole('button', { name: 'Retry sending' })).not.toBeInTheDocument()
  })

  it.each([
    ['BOUNCED', 'Email bounced: The email bounced (Permanent, NoEmail)', 'The email bounced (Permanent, NoEmail)'],
    ['REJECTED', 'Email rejected: AgentMail rejected the email', 'AgentMail rejected the email'],
  ] as const)('shows %s with its reason and no retry (resending would fail the same way)', (emailStatus, text, error) => {
    renderWithQuery(<EmailStatusNote ticketId={42} messageId={7} emailStatus={emailStatus} emailError={error} />)

    expect(screen.getByRole('status')).toHaveTextContent(text)
    expect(screen.queryByRole('button', { name: 'Retry sending' })).not.toBeInTheDocument()
  })

  it('shows why a send failed, with a retry button', () => {
    renderWithQuery(
      <EmailStatusNote ticketId={42} messageId={7} emailStatus="FAILED" emailError="AgentMail did not answer in time" />
    )

    expect(screen.getByRole('status')).toHaveTextContent('Email not sent: AgentMail did not answer in time')
    expect(screen.getByRole('button', { name: 'Retry sending' })).toBeEnabled()
  })

  it('retries the send and puts the returned ticket in the cache', async () => {
    const ticket = { id: 42, messages: [{ id: 7, emailStatus: 'SENT' }] }
    mockPost.mockResolvedValue({ data: { ticket } })
    const { queryClient } = renderWithQuery(
      <EmailStatusNote ticketId={42} messageId={7} emailStatus="FAILED" emailError="Could not reach AgentMail" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry sending' }))

    await vi.waitFor(() => expect(queryClient.getQueryData(['tickets', 42])).toEqual(ticket))
    expect(mockPost).toHaveBeenCalledWith('/api/tickets/42/messages/7/resend')
  })

  it('shows "Sending email…" and disables the button while retrying', async () => {
    mockPost.mockReturnValue(new Promise(() => {}))
    renderWithQuery(
      <EmailStatusNote ticketId={42} messageId={7} emailStatus="FAILED" emailError="Could not reach AgentMail" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry sending' }))

    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Sending email…'))
    expect(screen.getByRole('button', { name: 'Retry sending' })).toBeDisabled()
  })

  it("shows the server's error when the retry is refused", async () => {
    mockPost.mockRejectedValue(httpError(409, { error: 'Only a reply whose email failed can be sent again' }))
    renderWithQuery(
      <EmailStatusNote ticketId={42} messageId={7} emailStatus="FAILED" emailError="Could not reach AgentMail" />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry sending' }))

    expect(
      await screen.findByText('Could not retry (Only a reply whose email failed can be sent again).')
    ).toBeInTheDocument()
  })
})
