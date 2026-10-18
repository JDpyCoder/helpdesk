import { keepPreviousData, useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { NavLink, useLocation } from 'react-router'
import ConversationStrip from '@/components/ConversationStrip.tsx'
import { TextLink } from '@/components/TextLink.tsx'
import type { TicketListRow, TicketListState } from '@/components/TicketsTable.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { formatDuration } from '@/lib/format-duration.ts'
import { errorMessage } from '@/lib/query-client.ts'
import { statusLabels, statusVariants } from '@/lib/ticket-labels.ts'
import { cn } from 'cn'
import { listTicketsQuerySchema } from 'core'
import type { ListTicketsQuery } from 'core'

// Without a list to follow: the latest tickets, newest first
export const queueParams: ListTicketsQuery = { sortBy: 'createdAt', order: 'desc', page: 1, pageSize: 25 }

// The query of the list the ticket was opened from (TicketListState), when the history state holds a valid one
function listParamsFrom(state: unknown): ListTicketsQuery | null {
  if (typeof state !== 'object' || state === null || !('ticketList' in state)) return null
  const parsed = listTicketsQuerySchema.safeParse(state.ticketList)
  return parsed.success ? parsed.data : null
}

// The ticket list beside an open ticket, so agents can move between tickets without going back. Opened from the
// Tickets page, it shows the same tickets (filters, search, sort and page) and passes that list on to the next
// ticket; otherwise the latest tickets. The current ticket's row is highlighted (NavLink sets aria-current).
function TicketQueue({ className }: { className?: string }) {
  const location = useLocation()
  const listParams = listParamsFrom(location.state)
  const params = listParams ?? queueParams

  const { data, error } = useQuery({
    queryKey: ['tickets', params],
    queryFn: () =>
      axios.get<{ tickets: TicketListRow[]; total: number }>('/api/tickets', { params }).then((res) => res.data),
    // Keep the rows while a ticket opened from elsewhere switches the list
    placeholderData: keepPreviousData,
  })

  return (
    <nav aria-label="Ticket list" className={cn('flex flex-col overflow-hidden rounded-xl border bg-card text-sm', className)}>
      <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-semibold">{listParams ? 'Your ticket list' : 'Latest tickets'}</h2>
        <TextLink to="/tickets" className="text-muted-foreground">
          All tickets
        </TextLink>
      </div>
      <TicketQueueContent
        tickets={data?.tickets}
        error={error}
        linkState={listParams ? ({ ticketList: listParams } satisfies TicketListState) : undefined}
      />
    </nav>
  )
}

function TicketQueueContent({
  tickets,
  error,
  linkState,
}: {
  tickets: TicketListRow[] | undefined
  error: Parameters<typeof errorMessage>[0] | null
  linkState: TicketListState | undefined
}) {
  if (error) {
    return <p className="px-4 py-3 text-destructive">Could not load tickets ({errorMessage(error)}).</p>
  }

  if (!tickets) {
    return (
      <div role="status" aria-label="Loading tickets" className="space-y-4 px-4 py-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (tickets.length === 0) {
    return <p className="px-4 py-3 text-muted-foreground">No tickets in this list.</p>
  }

  return (
    <ol className="min-h-0 flex-1 overflow-y-auto">
      {tickets.map((ticket) => (
        <li key={ticket.id} className="border-b last:border-b-0">
          <NavLink
            to={`/tickets/${ticket.id}`}
            state={linkState}
            className="flex flex-col gap-1.5 px-4 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset aria-[current=page]:bg-ai-soft/50 aria-[current=page]:shadow-[inset_3px_0_0_var(--ai)]"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold">{ticket.fromName}</span>
              <time
                dateTime={ticket.createdAt}
                title={new Date(ticket.createdAt).toLocaleString()}
                className="shrink-0 text-xs text-muted-foreground tabular-nums"
              >
                {formatDuration((Date.now() - new Date(ticket.createdAt).getTime()) / 1000)} ago
              </time>
            </span>
            <span className="truncate">{ticket.subject}</span>
            <span className="flex items-center justify-between gap-2">
              <ConversationStrip senders={ticket.conversation} />
              <Badge variant={statusVariants[ticket.status]} className="ml-auto">
                {statusLabels[ticket.status]}
              </Badge>
            </span>
          </NavLink>
        </li>
      ))}
    </ol>
  )
}

export default TicketQueue
