import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import DeleteUserDialog from './DeleteUserDialog.tsx'

vi.mock('axios')
const mockDelete = vi.mocked(axios.delete)

const agent = {
  id: 'u2',
  name: 'Alan Agent',
  email: 'alan@example.com',
  role: 'AGENT' as const,
  createdAt: '2026-03-02T10:00:00.000Z',
}
const admin = { ...agent, id: 'u1', name: 'Ada Admin', email: 'ada@example.com', role: 'ADMIN' as const }

// Shape of an axios error that got (or didn't get) an HTTP response
function httpError(status?: number, data?: unknown) {
  return Object.assign(new Error('Request failed'), status ? { response: { status, data } } : {})
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete Alan Agent' }))
  return screen.getByRole('alertdialog', { name: 'Delete user' })
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('DeleteUserDialog', () => {
  it('asks for confirmation, naming the user', () => {
    renderWithQuery(<DeleteUserDialog user={agent} />)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    const dialog = openDialog()

    expect(
      within(dialog).getByText(
        'Delete Alan Agent (alan@example.com)? They will be signed out and can no longer sign in.'
      )
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('closes on Cancel without deleting', async () => {
    renderWithQuery(<DeleteUserDialog user={agent} />)
    const dialog = openDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes the user, refreshes the user list and closes', async () => {
    mockDelete.mockResolvedValue({ data: '' })
    const { queryClient } = renderWithQuery(<DeleteUserDialog user={agent} />)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const dialog = openDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mockDelete).toHaveBeenCalledWith('/api/users/u2')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it("shows the server's error message and stays open", async () => {
    mockDelete.mockRejectedValue(httpError(404, { error: 'User not found' }))
    renderWithQuery(<DeleteUserDialog user={agent} />)
    const dialog = openDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await within(dialog).findByText('User not found')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog', { name: 'Delete user' })).toBeInTheDocument()
  })

  it('falls back to the HTTP status when the server sends no message', async () => {
    mockDelete.mockRejectedValue(httpError(500))
    renderWithQuery(<DeleteUserDialog user={agent} />)
    const dialog = openDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await within(dialog).findByText('Could not delete user (HTTP 500).')).toBeInTheDocument()
  })

  it('clears an earlier error when reopened', async () => {
    mockDelete.mockRejectedValue(httpError(500))
    renderWithQuery(<DeleteUserDialog user={agent} />)
    let dialog = openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await within(dialog).findByText('Could not delete user (HTTP 500).')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    dialog = openDialog()

    expect(within(dialog).queryByText('Could not delete user (HTTP 500).')).not.toBeInTheDocument()
  })

  it("disables delete for admins and says why", async () => {
    renderWithQuery(<DeleteUserDialog user={admin} />)
    const button = screen.getByRole('button', { name: 'Delete Ada Admin' })

    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    // Radix opens the tooltip when its trigger (the span around the disabled button) gets focus
    act(() => button.parentElement!.focus())
    expect(await screen.findByRole('tooltip')).toHaveTextContent("Admins can't be deleted")
  })
})
