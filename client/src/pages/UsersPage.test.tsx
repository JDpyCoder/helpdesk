import { screen, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import UsersPage from './UsersPage.tsx'

vi.mock('axios')
const mockGet = vi.mocked(axios.get)

const users = [
  { id: '1', name: 'Ada Admin', email: 'ada@example.com', role: 'ADMIN', createdAt: '2026-01-15T10:00:00.000Z' },
  { id: '2', name: 'Alan Agent', email: 'alan@example.com', role: 'AGENT', createdAt: '2026-03-02T10:00:00.000Z' },
]

// Shape of an axios error that got (or didn't get) an HTTP response
function httpError(status?: number, message = 'Request failed') {
  return Object.assign(new Error(message), status ? { response: { status } } : {})
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('UsersPage', () => {
  it('shows the page heading and description', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<UsersPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument()
    expect(screen.getByText('People who can sign in to the helpdesk')).toBeInTheDocument()
  })

  it('shows a loading skeleton while users are being fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderWithQuery(<UsersPage />)

    expect(screen.getByRole('status', { name: 'Loading users' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('requests the user list from the API', async () => {
    mockGet.mockResolvedValue({ data: { users } })
    renderWithQuery(<UsersPage />)

    await screen.findByRole('table')
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/api/users')
  })

  it('renders a row per user with name, email, role badge and created date', async () => {
    mockGet.mockResolvedValue({ data: { users } })
    renderWithQuery(<UsersPage />)

    const table = await screen.findByRole('table')
    expect(screen.queryByRole('status', { name: 'Loading users' })).not.toBeInTheDocument()

    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent)
    expect(headers).toEqual(['Name', 'Email', 'Role', 'Created'])

    const [, adminRow, agentRow] = within(table).getAllByRole('row')
    expect(within(adminRow).getAllByRole('cell').map((td) => td.textContent)).toEqual([
      'Ada Admin',
      'ada@example.com',
      'Admin',
      new Date(users[0].createdAt).toLocaleDateString(),
    ])
    expect(within(agentRow).getAllByRole('cell').map((td) => td.textContent)).toEqual([
      'Alan Agent',
      'alan@example.com',
      'Agent',
      new Date(users[1].createdAt).toLocaleDateString(),
    ])
  })

  it('shows an empty message when there are no users', async () => {
    mockGet.mockResolvedValue({ data: { users: [] } })
    renderWithQuery(<UsersPage />)

    expect(await screen.findByText('No users found.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the HTTP status when the server rejects the request', async () => {
    mockGet.mockRejectedValue(httpError(403))
    renderWithQuery(<UsersPage />)

    expect(await screen.findByText('Could not load users (HTTP 403).')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it("shows axios's message when the server can't be reached", async () => {
    mockGet.mockRejectedValue(httpError(undefined, 'Network Error'))
    renderWithQuery(<UsersPage />)

    expect(await screen.findByText('Could not load users (Network Error).')).toBeInTheDocument()
  })
})
