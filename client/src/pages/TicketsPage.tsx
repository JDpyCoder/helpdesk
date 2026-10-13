import TicketsTable from '@/components/TicketsTable.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'

function TicketsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl" role="heading" aria-level={1}>
          Tickets
        </CardTitle>
        <CardDescription>Support requests from customers, newest first</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        <TicketsTable />
      </CardContent>
    </Card>
  )
}

export default TicketsPage
