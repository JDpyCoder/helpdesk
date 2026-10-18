import TicketsTable from '@/components/TicketsTable.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'

function TicketsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
        <p className="text-sm text-muted-foreground">Support requests from customers</p>
      </header>
      <Card>
        <CardContent className="text-sm">
          <TicketsTable />
        </CardContent>
      </Card>
    </div>
  )
}

export default TicketsPage
