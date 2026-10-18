import { Outlet } from 'react-router'
import TicketQueue from '@/components/TicketQueue.tsx'
import { useMediaQuery } from '@/lib/use-media-query.ts'
import { cn } from 'cn'

// The width from which the ticket list fits beside the ticket and its details
const SPLIT_QUERY = '(min-width: 90rem)'

// Wraps the ticket detail page: from 1440px up, the ticket list sits beside the open ticket, wider than other
// pages. Below that there isn't room for three columns, so the list isn't rendered (or fetched) at all.
function TicketSplitLayout() {
  const split = useMediaQuery(SPLIT_QUERY)

  return (
    <div
      className={cn(
        'mx-auto p-4 md:p-8',
        split ? 'grid grid-cols-[18rem_minmax(0,1fr)] items-start gap-6' : 'max-w-6xl'
      )}
    >
      {split && <TicketQueue className="sticky top-8 max-h-[calc(100vh-4rem)]" />}
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}

export default TicketSplitLayout
