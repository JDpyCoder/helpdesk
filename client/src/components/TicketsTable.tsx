import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table'
import axios from 'axios'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SearchIcon,
  X,
} from 'lucide-react'
import { createContext, useContext, useState } from 'react'
import ConversationStrip from '@/components/ConversationStrip.tsx'
import { TextLink } from '@/components/TextLink.tsx'
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
import { categoryLabels, statusLabels, statusVariants } from '@/lib/ticket-labels.ts'
import { useDebouncedValue } from '@/lib/use-debounced-value.ts'
import {
  DEFAULT_TICKET_PAGE_SIZE,
  TICKET_PAGE_SIZES,
  ticketCategorySchema,
  TicketStatus,
  ticketStatusSchema,
  UNCLASSIFIED,
} from 'core'
import type {
  ListTicketsQuery,
  SenderType,
  SortOrder,
  TicketCategory,
  TicketCategoryFilter,
  TicketSortField,
} from 'core'

// The list never shows PROCESSING tickets (the AI is answering them), so they can't be filtered for
const listedStatuses = ticketStatusSchema.options.filter((status) => status !== TicketStatus.PROCESSING)

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

// History state on a ticket page opened from the list: the query that list was showing
export type TicketListState = { ticketList: ListTicketsQuery }

// A list row also says who wrote the latest messages, oldest first (the detail view has the messages instead)
export type TicketListRow = TicketListItem & { conversation: SenderType[] }

// GET /api/tickets: one page of tickets plus the number of tickets matching the filters
type TicketListResponse = {
  tickets: TicketListRow[]
  total: number
  page: number
  pageSize: number
}

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
})

type TicketTable = ReturnType<typeof useTable<typeof features, TicketListRow>>

// Column ids are the API's sortBy values, so the table's sorting state is sent as-is.
// sortDescFirst is set on every column: with manual sorting there is no data to infer it from.
// The list's current query, for the subject links (the columns are defined outside the component)
const ListParamsContext = createContext<ListTicketsQuery | null>(null)

// Opens the ticket and carries this list's filters, sort and page in the history state, so the ticket list
// beside the ticket (TicketQueue) shows the same tickets the agent came from
function SubjectLink({ ticket }: { ticket: TicketListRow }) {
  const params = useContext(ListParamsContext)
  return (
    <TextLink
      to={`/tickets/${ticket.id}`}
      state={params ? ({ ticketList: params } satisfies TicketListState) : undefined}
      className="block max-w-80 truncate font-medium"
    >
      {ticket.subject}
    </TextLink>
  )
}

const columns: (ColumnDef<typeof features, TicketListRow> & { id: TicketSortField })[] = [
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
    cell: ({ row }) => (
      <div className="flex flex-col gap-1.5">
        <SubjectLink ticket={row.original} />
        <ConversationStrip senders={row.original.conversation} />
      </div>
    ),
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
      <span className="whitespace-nowrap">{new Date(row.original.createdAt).toLocaleDateString()}</span>
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
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_TICKET_PAGE_SIZE,
  })
  const resetPage = () => setPagination((old) => ({ ...old, pageIndex: 0 }))

  // A new search starts from page 1. Reset when the debounced search changes (not on every keystroke),
  // so the old search isn't refetched for page 1 first.
  const [pagedSearch, setPagedSearch] = useState(search)
  if (pagedSearch !== search) {
    setPagedSearch(search)
    resetPage()
  }

  // Unset filters and a blank search are left out of the query string; page is 1-based on the API
  const params = {
    sortBy,
    order,
    ...(status && { status }),
    ...(category && { category }),
    ...(search && { search }),
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
  }

  const { data, error, isPlaceholderData } = useQuery({
    queryKey: ['tickets', params],
    queryFn: () => axios.get<TicketListResponse>('/api/tickets', { params }).then((res) => res.data),
    // Keep showing the current rows while another page, sort or filter loads
    placeholderData: keepPreviousData,
  })

  // A page past the end (e.g. tickets closed elsewhere shrank the list) moves to the last page
  const pageCount = data ? Math.max(1, Math.ceil(data.total / pagination.pageSize)) : 1
  if (data && !isPlaceholderData && pagination.pageIndex >= pageCount) {
    setPagination((old) => ({ ...old, pageIndex: pageCount - 1 }))
  }

  const table = useTable({
    features,
    columns,
    data: data?.tickets ?? [],
    getRowId: (ticket) => String(ticket.id),
    manualSorting: true,
    enableSortingRemoval: false,
    enableMultiSort: false,
    manualFiltering: true,
    manualPagination: true,
    rowCount: data?.total ?? 0,
    state: { sorting, columnFilters, globalFilter, pagination },
    // A new sort or filter starts from page 1
    onSortingChange: (updater) => {
      setSorting(updater)
      resetPage()
    },
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater)
      resetPage()
    },
    // resetGlobalFilter(true) passes undefined; the search box needs a string
    onGlobalFilterChange: (updater) =>
      setGlobalFilter((old) => (typeof updater === 'function' ? updater(old) : updater) ?? ''),
    onPaginationChange: setPagination,
  })
  const tickets = data?.tickets

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
      <ListParamsContext value={params}>
        <TicketsTableContent
          table={table}
          tickets={tickets}
          error={error}
          isFiltered={columnFilters.length > 0 || search !== ''}
          isUpdating={isPlaceholderData}
        />
      </ListParamsContext>
      {data && data.total > 0 && <TicketsPagination table={table} total={data.total} pagination={pagination} />}
    </div>
  )
}

type TicketsPaginationProps = {
  table: TicketTable
  total: number
  pagination: PaginationState
}

// "Showing 26–50 of 101", a page-size select and first/previous/next/last buttons
function TicketsPagination({ table, total, pagination }: TicketsPaginationProps) {
  const { pageIndex, pageSize } = pagination
  const first = pageIndex * pageSize + 1
  const last = Math.min(total, (pageIndex + 1) * pageSize)

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground">
        Showing {first}–{last} of {total} {total === 1 ? 'ticket' : 'tickets'}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="ticket-page-size">Rows per page</Label>
          <NativeSelect
            id="ticket-page-size"
            size="sm"
            value={pageSize}
            // setPageSize keeps the first visible row on screen by adjusting the page
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {TICKET_PAGE_SIZES.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <span>
          Page {pageIndex + 1} of {table.getPageCount()}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="First page"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Last page"
            onClick={() => table.lastPage()}
            disabled={!table.getCanLastPage()}
          >
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
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
          {listedStatuses.map((value) => (
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
  table: TicketTable
  tickets: TicketListRow[] | undefined
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
