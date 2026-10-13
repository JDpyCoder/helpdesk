import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { rowSortingFeature, tableFeatures, useTable } from '@tanstack/react-table'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import axios from 'axios'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
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
import type { SortOrder, TicketSortField } from 'core'

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

const features = tableFeatures({ rowSortingFeature })

// Column ids are the API's sortBy values, so the table's sorting state is sent as-is.
// sortDescFirst is set on every column: with manual sorting there is no data to infer it from.
const columns: (ColumnDef<typeof features, TicketListItem> & { id: TicketSortField })[] = [
  {
    id: 'id',
    accessorKey: 'id',
    header: '#',
    sortDescFirst: true,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.id}</span>,
  },
  {
    id: 'subject',
    accessorKey: 'subject',
    header: 'Subject',
    sortDescFirst: false,
    cell: ({ row }) => <div className="max-w-80 truncate font-medium">{row.original.subject}</div>,
  },
  {
    id: 'fromName',
    accessorKey: 'fromName',
    header: 'From',
    sortDescFirst: false,
    cell: ({ row }) => (
      <>
        <div>{row.original.fromName}</div>
        <div className="text-muted-foreground">{row.original.fromEmail}</div>
      </>
    ),
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    sortDescFirst: false,
    cell: ({ row }) => (
      <Badge variant={statusVariants[row.original.status]}>{statusLabels[row.original.status]}</Badge>
    ),
  },
  {
    id: 'category',
    accessorKey: 'category',
    header: 'Category',
    sortDescFirst: false,
    cell: ({ row }) =>
      row.original.category ? (
        categoryLabels[row.original.category]
      ) : (
        <span className="text-muted-foreground">Unclassified</span>
      ),
  },
  {
    id: 'assignedTo',
    accessorFn: (ticket) => ticket.assignedTo?.name ?? null,
    header: 'Assigned to',
    sortDescFirst: false,
    cell: ({ row }) =>
      row.original.assignedTo?.name ?? <span className="text-muted-foreground">Unassigned</span>,
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Created',
    sortDescFirst: true,
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{new Date(row.original.createdAt).toLocaleString()}</span>
    ),
  },
]

const ariaSort = { asc: 'ascending', desc: 'descending' } as const

// Loads GET /api/tickets and renders the list with its loading, error and empty states.
// Sorting is manual: clicking a header changes the sorting state, which refetches with ?sortBy=&order=.
function TicketsTable() {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const sortBy = sorting[0].id as TicketSortField
  const order: SortOrder = sorting[0].desc ? 'desc' : 'asc'

  const { data: tickets, error } = useQuery({
    queryKey: ['tickets', { sortBy, order }],
    queryFn: () =>
      axios
        .get<{ tickets: TicketListItem[] }>('/api/tickets', { params: { sortBy, order } })
        .then((res) => res.data.tickets),
    // Keep showing the current rows while a re-sorted list loads
    placeholderData: keepPreviousData,
  })

  const table = useTable({
    features,
    columns,
    data: tickets ?? [],
    getRowId: (ticket) => String(ticket.id),
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    state: { sorting },
    onSortingChange: setSorting,
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
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted()
              const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
              return (
                <TableHead key={header.id} aria-sort={sorted ? ariaSort[sorted] : 'none'}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2.5"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <table.FlexRender header={header} />
                    <SortIcon aria-hidden className={sorted ? undefined : 'text-muted-foreground'} />
                  </Button>
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default TicketsTable
