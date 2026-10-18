import CreateUserDialog from '@/components/CreateUserDialog.tsx'
import UsersTable from '@/components/UsersTable.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'

function UsersPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">People who can sign in to the helpdesk</p>
        </div>
        <CreateUserDialog />
      </header>
      <Card>
        <CardContent className="text-sm">
          <UsersTable />
        </CardContent>
      </Card>
    </div>
  )
}

export default UsersPage
