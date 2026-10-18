import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import type { DashboardStats } from 'core'
import TicketsPerDayChart from '@/components/TicketsPerDayChart.tsx'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { formatDuration } from '@/lib/format-duration.ts'
import { errorMessage } from '@/lib/query-client.ts'
import { cn } from 'cn'

// valueClass colors a number by who it is about: open tickets wait on an agent, AI tiles count the AI's work
const tiles: { label: string; value: (stats: DashboardStats) => string; valueClass?: string }[] = [
  { label: 'Total tickets', value: (s) => s.totalTickets.toLocaleString() },
  { label: 'Open tickets', value: (s) => s.openTickets.toLocaleString(), valueClass: 'text-attention' },
  { label: 'Resolved by AI', value: (s) => s.aiResolvedTickets.toLocaleString(), valueClass: 'text-ai' },
  { label: 'Resolved by AI (%)', value: (s) => `${s.aiResolvedPercent.toLocaleString()}%`, valueClass: 'text-ai' },
  { label: 'Avg. resolution time', value: (s) => formatDuration(s.avgResolutionSeconds) },
]

function DashboardPage() {
  const { data: stats, error } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => axios.get<DashboardStats>('/api/dashboard/stats').then((res) => res.data),
  })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      {error ? (
        <p className="text-sm text-destructive">Could not load dashboard ({errorMessage(error)}).</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {tiles.map(({ label, value, valueClass }) => (
            <Card key={label} role="group" aria-label={label}>
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                {stats ? (
                  <CardTitle className={cn('text-3xl font-semibold tracking-tight tabular-nums', valueClass)}>
                    {value(stats)}
                  </CardTitle>
                ) : (
                  <Skeleton role="status" aria-label={`Loading ${label.toLowerCase()}`} className="h-9 w-20" />
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
      <TicketsPerDayChart />
    </div>
  )
}

export default DashboardPage
