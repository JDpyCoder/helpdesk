import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import CreateUserDialog from './CreateUserDialog.tsx'

vi.mock('axios')
const mockPost = vi.mocked(axios.post)

// Shape of an axios error that got (or didn't get) an HTTP response
function httpError(status?: number, data?: unknown) {
  return Object.assign(new Error('Request failed'), status ? { response: { status, data } } : {})
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'New user' }))
  return screen.getByRole('dialog', { name: 'Create user' })
}

function fillForm(dialog: HTMLElement, values: { name: string; email: string; password: string }) {
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: values.name } })
  fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: values.email } })
  fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: values.password } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create user' }))
}

const valid = { name: 'Grace Hopper', email: 'grace@example.com', password: 'secret123' }

afterEach(() => {
  vi.resetAllMocks()
})

describe('CreateUserDialog', () => {
  it('opens a form with name, email and password fields', () => {
    renderWithQuery(<CreateUserDialog />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const dialog = openDialog()

    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Password')).toBeInTheDocument()
  })

  it('has no password-type input, so browsers do not autofill the admin login', () => {
    renderWithQuery(<CreateUserDialog />)
    const dialog = openDialog()

    expect(dialog.querySelector('input[type="password"]')).toBeNull()
    expect(within(dialog).getByLabelText('Password')).toHaveAttribute('autocomplete', 'off')
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('autocomplete', 'off')
  })

  it('shows validation errors and does not submit invalid input', async () => {
    renderWithQuery(<CreateUserDialog />)
    const dialog = openDialog()

    fillForm(dialog, { name: 'Al', email: 'not-an-email', password: 'short' })

    expect(await within(dialog).findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument()
    expect(within(dialog).getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('creates the user, refreshes the user list and closes', async () => {
    mockPost.mockResolvedValue({ data: { user: { id: '3', ...valid, role: 'AGENT' } } })
    const { queryClient } = renderWithQuery(<CreateUserDialog />)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const dialog = openDialog()

    fillForm(dialog, valid)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockPost).toHaveBeenCalledWith('/api/users', valid)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it("shows the server's error message and stays open", async () => {
    mockPost.mockRejectedValue(httpError(409, { error: 'A user with this email already exists' }))
    renderWithQuery(<CreateUserDialog />)
    const dialog = openDialog()

    fillForm(dialog, valid)

    expect(await within(dialog).findByText('A user with this email already exists')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Create user' })).toBeInTheDocument()
  })

  it('falls back to the HTTP status when the server sends no message', async () => {
    mockPost.mockRejectedValue(httpError(500))
    renderWithQuery(<CreateUserDialog />)
    const dialog = openDialog()

    fillForm(dialog, valid)

    expect(await within(dialog).findByText('Could not create user (HTTP 500).')).toBeInTheDocument()
  })
})
