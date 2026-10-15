import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { TICKETS_PER_DAY_DAYS, type TicketsPerDay } from 'core'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { errorMessage } from '@/lib/query-client.ts'

const chartConfig = {
  count: { label: 'Tickets', color: 'var(--chart-2)' },
} satisfies ChartConfig

// "2026-10-16" is a calendar day in the viewer's time zone: build it as a local date, not UTC midnight
function parseDay(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

const formatTick = (date: string) => parseDay(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const formatDay = (date: string) =>
  parseDay(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

function TicketsPerDayChart() {
  // Days are counted in the viewer's time zone, so "today" is their today
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { data, error } = useQuery({
    queryKey: ['dashboard', 'tickets-per-day', timeZone],
    queryFn: () =>
      axios.get<TicketsPerDay>('/api/dashboard/tickets-per-day', { params: { timeZone } }).then((res) => res.data),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Tickets per day
        </CardTitle>
        <CardDescription>New tickets over the last {TICKETS_PER_DAY_DAYS} days</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">Could not load tickets per day ({errorMessage(error)}).</p>
        ) : data ? (
          <>
            <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full" aria-hidden="true">
              <BarChart data={data.days} margin={{ left: -16, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={formatTick}
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={48} />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)' }}
                  content={<ChartTooltipContent labelFormatter={(label) => formatDay(String(label))} />}
                />
                <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
            {/* The chart is drawn for sighted users; screen readers get the same numbers as a table */}
            <table className="sr-only">
              <caption>Tickets per day, last {TICKETS_PER_DAY_DAYS} days</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map(({ date, count }) => (
                  <tr key={date}>
                    <td>{formatDay(date)}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <Skeleton role="status" aria-label="Loading tickets per day" className="h-64 w-full" />
        )}
      </CardContent>
    </Card>
  )
}

export default TicketsPerDayChart
