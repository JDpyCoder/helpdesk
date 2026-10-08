import { zodResolver } from '@hookform/resolvers/zod'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createUserSchema, type CreateUserInput } from 'core'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UserForm, { userFormDefaults } from './UserForm.tsx'

const onSubmit = vi.fn()
// The form instance of the current render, so tests can set errors like the dialog's mutation does
let form: UseFormReturn<CreateUserInput>

// Owns the form the same way CreateUserDialog does
function Harness() {
  form = useForm<CreateUserInput>({ resolver: zodResolver(createUserSchema), defaultValues: userFormDefaults })
  return (
    <UserForm form={form} onSubmit={onSubmit}>
      <button type="submit">Save</button>
    </UserForm>
  )
}

const valid = { name: 'Grace Hopper', email: 'grace@example.com', password: 'secret123' }

function fill(values: Partial<CreateUserInput>) {
  if (values.name !== undefined) fireEvent.change(screen.getByLabelText('Name'), { target: { value: values.name } })
  if (values.email !== undefined) fireEvent.change(screen.getByLabelText('Email'), { target: { value: values.email } })
  if (values.password !== undefined)
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: values.password } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('UserForm', () => {
  it('renders empty, labelled name, email and password fields and the given actions', () => {
    render(<Harness />)

    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows every required-field error when submitted empty', async () => {
    render(<Harness />)

    submit()

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('marks invalid fields with aria-invalid', async () => {
    render(<Harness />)
    fill({ ...valid, email: 'not-an-email' })

    submit()

    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'false')
  })

  it('counts the name length after trimming spaces', async () => {
    render(<Harness />)
    fill({ ...valid, name: '  Al  ' })

    submit()

    expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a password longer than 128 characters', async () => {
    render(<Harness />)
    fill({ ...valid, password: 'a'.repeat(129) })

    submit()

    expect(await screen.findByText('Password must be at most 128 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('accepts values exactly at the length limits', async () => {
    render(<Harness />)
    fill({ name: 'Ada', email: valid.email, password: 'a'.repeat(128) })

    submit()

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: 'Ada', email: valid.email, password: 'a'.repeat(128) })
  })

  it('submits the parsed values: name trimmed, email lowercased', async () => {
    render(<Harness />)
    fill({ name: '  Grace Hopper ', email: 'Grace@Example.COM', password: valid.password })

    submit()

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(valid)
  })

  it('clears a field error once the field is corrected', async () => {
    render(<Harness />)
    fill({ ...valid, email: 'not-an-email' })
    submit()
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()

    fill({ email: valid.email })

    await waitFor(() => expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument())
  })

  it('shows a server error set on root.serverError', async () => {
    render(<Harness />)

    act(() => form.setError('root.serverError', { message: 'A user with this email already exists' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A user with this email already exists')
  })
})
