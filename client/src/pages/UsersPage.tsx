import CreateUserDialog from '@/components/CreateUserDialog.tsx'
import UsersTable from '@/components/UsersTable.tsx'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx'

function UsersPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl" role="heading" aria-level={1}>
          Users
        </CardTitle>
        <CardDescription>People who can sign in to the helpdesk</CardDescription>
        <CardAction>
          <CreateUserDialog />
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm">
        <UsersTable />
      </CardContent>
    </Card>
  )
}

export default UsersPage
