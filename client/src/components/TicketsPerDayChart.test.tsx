import { screen, within } from '@testing-library/react'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '@/test/render.tsx'
import TicketsPerDayChart from './TicketsPerDayChart.tsx'

vi.mock('axios')
const mockGet = vi.mocked(axios.get)

const days = [
  { date: '2026-10-14', count: 3 },
  { date: '2026-10-15', count: 0 },
  { date: '2026-10-16', count: 12 },
]

// As the component shows a day: a local calendar date, not UTC midnight
const dayLabel = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

afterEach(() => {
  vi.resetAllMocks()
})

// jsdom has no layout, so Recharts draws nothing; the screen-reader table carries the same numbers
describe('TicketsPerDayChart', () => {
  it("requests the counts for the viewer's time zone and lists them per day", async () => {
    mockGet.mockResolvedValue({ data: { days } })

    renderWithQuery(<TicketsPerDayChart />)

    expect(screen.getByRole('heading', { name: 'Tickets per day' })).toBeInTheDocument()
    expect(screen.getByText('New tickets over the last 30 days')).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Tickets per day, last 30 days' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      `${dayLabel(2026, 10, 14)}3`,
      `${dayLabel(2026, 10, 15)}0`,
      `${dayLabel(2026, 10, 16)}12`,
    ])
    expect(mockGet).toHaveBeenCalledWith('/api/dashboard/tickets-per-day', {
      params: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    })
  })

  it('shows a loading placeholder', () => {
    mockGet.mockReturnValue(new Promise(() => {}))

    renderWithQuery(<TicketsPerDayChart />)

    expect(screen.getByRole('status', { name: 'Loading tickets per day' })).toBeInTheDocument()
  })

  it('shows an HTTP error', async () => {
    mockGet.mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 503 } }))

    renderWithQuery(<TicketsPerDayChart />)

    expect(await screen.findByText('Could not load tickets per day (HTTP 503).')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
