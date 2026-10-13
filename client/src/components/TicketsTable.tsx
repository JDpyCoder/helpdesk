import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Badge } from '@/components/ui/badge.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.tsx'
import { errorMessage } from '@/lib/query-client.ts'
import { TicketCategory, TicketStatus } from 'core'

export type TicketListItem = {
  id: number
  subject: string
  fromEmail: string
  fromName: string
  status: TicketStatus
  category: TicketCategory | null
  assignedTo: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

const statusLabels: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'Open',
  [TicketStatus.RESOLVED]: 'Resolved',
  [TicketStatus.CLOSED]: 'Closed',
}

const statusVariants: Record<TicketStatus, 'default' | 'secondary' | 'outline'> = {
  [TicketStatus.OPEN]: 'default',
  [TicketStatus.RESOLVED]: 'secondary',
  [TicketStatus.CLOSED]: 'outline',
}

const categoryLabels: Record<TicketCategory, string> = {
  [TicketCategory.GENERAL_QUESTION]: 'General question',
  [TicketCategory.TECHNICAL_QUESTION]: 'Technical question',
  [TicketCategory.REFUND_REQUEST]: 'Refund request',
}

// Loads GET /api/tickets (the server sorts newest first) and renders the list with its loading, error and empty states
function TicketsTable() {
  const { data: tickets, error } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => axios.get<{ tickets: TicketListItem[] }>('/api/tickets').then((res) => res.data.tickets),
  })

  if (error) {
    return <p className="text-destructive">Could not load tickets ({errorMessage(error)}).</p>
  }

  if (!tickets) {
    return (
      <div role="status" aria-label="Loading tickets" className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-5 w-10" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-28" />
          </div>
        ))}
      </div>
    )
  }

  if (tickets.length === 0) {
    return <p className="text-muted-foreground">No tickets yet.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>From</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Assigned to</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell className="text-muted-foreground">{ticket.id}</TableCell>
            <TableCell className="max-w-80 truncate font-medium">{ticket.subject}</TableCell>
            <TableCell>
              <div>{ticket.fromName}</div>
              <div className="text-muted-foreground">{ticket.fromEmail}</div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariants[ticket.status]}>{statusLabels[ticket.status]}</Badge>
            </TableCell>
            <TableCell className={ticket.category ? undefined : 'text-muted-foreground'}>
              {ticket.category ? categoryLabels[ticket.category] : 'Unclassified'}
            </TableCell>
            <TableCell className={ticket.assignedTo ? undefined : 'text-muted-foreground'}>
              {ticket.assignedTo?.name ?? 'Unassigned'}
            </TableCell>
            <TableCell className="whitespace-nowrap">{new Date(ticket.createdAt).toLocaleString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default TicketsTable
