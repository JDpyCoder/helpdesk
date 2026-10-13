import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type { ColumnDef, ColumnFiltersState, SortingState } from '@tanstack/react-table'
import axios from 'axios'
import { ArrowDown, ArrowUp, ArrowUpDown, SearchIcon, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select.tsx'
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
import { useDebouncedValue } from '@/lib/use-debounced-value.ts'
import { TicketCategory, TicketStatus, ticketCategorySchema, ticketStatusSchema, UNCLASSIFIED } from 'core'
import type { SortOrder, TicketCategoryFilter, TicketSortField } from 'core'

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

const features = tableFeatures({ rowSortingFeature, columnFilteringFeature, globalFilteringFeature })

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
    // The server filters (manualFiltering), but TanStack resolves a filterFn whenever a filter is set,
    // and the default 'auto' lookup warns because no built-in filterFns are registered
    filterFn: (row, _columnId, value) => row.original.status === value,
    cell: ({ row }) => (
      <Badge variant={statusVariants[row.original.status]}>{statusLabels[row.original.status]}</Badge>
    ),
  },
  {
    id: 'category',
    accessorKey: 'category',
    header: 'Category',
    sortDescFirst: false,
    // Mirrors the server's ?category= rule; see the Status column for why it is set
    filterFn: (row, _columnId, value) =>
      value === UNCLASSIFIED ? row.original.category === null : row.original.category === value,
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

// How long typing has to pause before the search is sent
export const SEARCH_DEBOUNCE_MS = 300

// Loads GET /api/tickets and renders the search, filters and the list with its loading, error and empty states.
// Sorting, filtering and search are manual: header clicks, the filter selects and the search box change the
// table state, which refetches with ?sortBy=&order=&status=&category=&search=; the server returns the rows in order.
function TicketsTable() {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  // The search box text; it is sent once typing pauses
  const [globalFilter, setGlobalFilter] = useState('')
  const search = useDebouncedValue(globalFilter.trim(), SEARCH_DEBOUNCE_MS)
  const sortBy = sorting[0].id as TicketSortField
  const order: SortOrder = sorting[0].desc ? 'desc' : 'asc'
  const status = columnFilters.find((f) => f.id === 'status')?.value as TicketStatus | undefined
  const category = columnFilters.find((f) => f.id === 'category')?.value as TicketCategoryFilter | undefined
  // Unset filters and a blank search are left out of the query string
  const params = { sortBy, order, ...(status && { status }), ...(category && { category }), ...(search && { search }) }

  const { data: tickets, error, isPlaceholderData } = useQuery({
    queryKey: ['tickets', params],
    queryFn: () =>
      axios.get<{ tickets: TicketListItem[] }>('/api/tickets', { params }).then((res) => res.data.tickets),
    // Keep showing the current rows while a re-sorted or re-filtered list loads
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
    manualFiltering: true,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    // resetGlobalFilter(true) passes undefined; the search box needs a string
    onGlobalFilterChange: (updater) =>
      setGlobalFilter((old) => (typeof updater === 'function' ? updater(old) : updater) ?? ''),
  })

  return (
    <div className="space-y-4">
      <TicketFilters
        search={globalFilter}
        status={status}
        category={category}
        onSearchChange={(value) => table.setGlobalFilter(value)}
        // An empty value ("All …") removes the column's filter
        onStatusChange={(value) => table.getColumn('status')?.setFilterValue(value || undefined)}
        onCategoryChange={(value) => table.getColumn('category')?.setFilterValue(value || undefined)}
        onClear={() => {
          table.resetColumnFilters(true)
          table.resetGlobalFilter(true)
        }}
      />
      <TicketsTableContent
        table={table}
        tickets={tickets}
        error={error}
        isFiltered={columnFilters.length > 0 || search !== ''}
        isUpdating={isPlaceholderData}
      />
    </div>
  )
}

type TicketFiltersProps = {
  search: string
  status: TicketStatus | undefined
  category: TicketCategoryFilter | undefined
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onClear: () => void
}

function TicketFilters({
  search,
  status,
  category,
  onSearchChange,
  onStatusChange,
  onCategoryChange,
  onClear,
}: TicketFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="ticket-search">Search</Label>
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="ticket-search"
            type="search"
            placeholder="Subject, customer or #id"
            maxLength={200}
            className="w-72 pl-8"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ticket-filter-status">Status</Label>
        <NativeSelect
          id="ticket-filter-status"
          value={status ?? ''}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          {ticketStatusSchema.options.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {statusLabels[value]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ticket-filter-category">Category</Label>
        <NativeSelect
          id="ticket-filter-category"
          value={category ?? ''}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          <NativeSelectOption value="">All categories</NativeSelectOption>
          {ticketCategorySchema.options.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {categoryLabels[value]}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={UNCLASSIFIED}>Unclassified</NativeSelectOption>
        </NativeSelect>
      </div>
      {(search || status || category) && (
        <Button variant="ghost" onClick={onClear}>
          <X aria-hidden />
          Clear filters
        </Button>
      )}
    </div>
  )
}

type TicketsTableContentProps = {
  table: ReturnType<typeof useTable<typeof features, TicketListItem>>
  tickets: TicketListItem[] | undefined
  error: Parameters<typeof errorMessage>[0] | null
  isFiltered: boolean
  isUpdating: boolean
}

function TicketsTableContent({ table, tickets, error, isFiltered, isUpdating }: TicketsTableContentProps) {
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
    return (
      <p className="text-muted-foreground">{isFiltered ? 'No tickets match your search or filters.' : 'No tickets yet.'}</p>
    )
  }

  return (
    // Dimmed while the previous rows are shown as a placeholder for the next list
    <Table aria-busy={isUpdating} className={isUpdating ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
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
