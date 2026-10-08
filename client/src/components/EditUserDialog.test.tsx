import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import EditUserDialog from './EditUserDialog.tsx'

vi.mock('axios')
const mockPatch = vi.mocked(axios.patch)

const user = {
  id: 'u2',
  name: 'Alan Agent',
  email: 'alan@example.com',
  role: 'AGENT' as const,
  createdAt: '2026-03-02T10:00:00.000Z',
}

// Shape of an axios error that got (or didn't get) an HTTP response
function httpError(status?: number, data?: unknown) {
  return Object.assign(new Error('Request failed'), status ? { response: { status, data } } : {})
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit Alan Agent' }))
  return screen.getByRole('dialog', { name: 'Edit user' })
}

function change(dialog: HTMLElement, label: string, value: string) {
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } })
}

function save(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('EditUserDialog', () => {
  it("opens with the user's name and email filled in and a blank password", () => {
    renderWithQuery(<EditUserDialog user={user} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const dialog = openDialog()

    expect(within(dialog).getByLabelText('Name')).toHaveValue('Alan Agent')
    expect(within(dialog).getByLabelText('Email')).toHaveValue('alan@example.com')
    expect(within(dialog).getByLabelText('Password')).toHaveValue('')
    expect(within(dialog).getByText('Leave blank to keep the current password.')).toBeInTheDocument()
  })

  it('saves with a blank password, refreshes the user list and closes', async () => {
    mockPatch.mockResolvedValue({ data: { user } })
    const { queryClient } = renderWithQuery(<EditUserDialog user={user} />)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const dialog = openDialog()

    change(dialog, 'Name', 'Alan Turing')
    save(dialog)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockPatch).toHaveBeenCalledWith('/api/users/u2', {
      name: 'Alan Turing',
      email: 'alan@example.com',
      password: '',
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('sends a new password when one is entered', async () => {
    mockPatch.mockResolvedValue({ data: { user } })
    renderWithQuery(<EditUserDialog user={user} />)
    const dialog = openDialog()

    change(dialog, 'Password', 'newsecret1')
    save(dialog)

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/api/users/u2', {
        name: 'Alan Agent',
        email: 'alan@example.com',
        password: 'newsecret1',
      })
    )
  })

  it('rejects a new password that is too short', async () => {
    renderWithQuery(<EditUserDialog user={user} />)
    const dialog = openDialog()

    change(dialog, 'Password', 'short')
    save(dialog)

    expect(await within(dialog).findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it("shows the server's error message and stays open", async () => {
    mockPatch.mockRejectedValue(httpError(409, { error: 'A user with this email already exists' }))
    renderWithQuery(<EditUserDialog user={user} />)
    const dialog = openDialog()

    change(dialog, 'Email', 'ada@example.com')
    save(dialog)

    expect(await within(dialog).findByText('A user with this email already exists')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Edit user' })).toBeInTheDocument()
  })

  it('falls back to the HTTP status when the server sends no message', async () => {
    mockPatch.mockRejectedValue(httpError(500))
    renderWithQuery(<EditUserDialog user={user} />)
    const dialog = openDialog()

    save(dialog)

    expect(await within(dialog).findByText('Could not update user (HTTP 500).')).toBeInTheDocument()
  })

  it('discards unsaved edits when cancelled', async () => {
    renderWithQuery(<EditUserDialog user={user} />)
    let dialog = openDialog()
    change(dialog, 'Name', 'Someone Else')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    dialog = openDialog()

    expect(within(dialog).getByLabelText('Name')).toHaveValue('Alan Agent')
    expect(mockPatch).not.toHaveBeenCalled()
  })
})
