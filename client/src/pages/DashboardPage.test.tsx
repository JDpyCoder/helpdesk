import { screen } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import DashboardPage from './DashboardPage.tsx'

vi.mock('axios')
const mockGet = vi.mocked(axios.get)
// The chart loads its own data and has its own spec (TicketsPerDayChart.test.tsx)
vi.mock('@/components/TicketsPerDayChart.tsx', () => ({ default: () => <p>Tickets per day chart</p> }))

const stats = {
  totalTickets: 1234,
  openTickets: 56,
  aiResolvedTickets: 420,
  aiResolvedPercent: 34.0,
  avgResolutionSeconds: 3 * 3600 + 20 * 60,
}

afterEach(() => {
  vi.resetAllMocks()
})

function tile(name: string) {
  return screen.getByRole('group', { name })
}

describe('DashboardPage', () => {
  it('shows the ticket stats', async () => {
    mockGet.mockResolvedValue({ data: stats })

    renderWithQuery(<DashboardPage />)

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(await screen.findByText((1234).toLocaleString())).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith('/api/dashboard/stats')
    expect(tile('Total tickets')).toHaveTextContent((1234).toLocaleString())
    expect(tile('Open tickets')).toHaveTextContent('56')
    expect(tile('Resolved by AI')).toHaveTextContent('420')
    expect(tile('Resolved by AI (%)')).toHaveTextContent('34%')
    expect(tile('Avg. resolution time')).toHaveTextContent('3h 20m')
    expect(screen.getByText('Tickets per day chart')).toBeInTheDocument()
  })

  it('shows a dash when no ticket has been resolved yet', async () => {
    mockGet.mockResolvedValue({ data: { ...stats, avgResolutionSeconds: null } })

    renderWithQuery(<DashboardPage />)

    await screen.findByText((1234).toLocaleString())
    expect(tile('Avg. resolution time')).toHaveTextContent('—')
  })

  it('shows a loading placeholder in every tile', () => {
    mockGet.mockReturnValue(new Promise(() => {}))

    renderWithQuery(<DashboardPage />)

    expect(screen.getAllByRole('status')).toHaveLength(5)
    expect(screen.getByRole('status', { name: 'Loading total tickets' })).toBeInTheDocument()
  })

  it('shows an HTTP error', async () => {
    mockGet.mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 500 } }))

    renderWithQuery(<DashboardPage />)

    expect(await screen.findByText('Could not load dashboard (HTTP 500).')).toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
