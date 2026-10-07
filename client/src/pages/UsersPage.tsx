import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { Badge } from '@/components/ui/badge.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.tsx'
import { errorMessage } from '@/lib/query-client.ts'

type User = {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'AGENT'
  createdAt: string
}

function UsersPage() {
  const { data: users, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => axios.get<{ users: User[] }>('/api/users').then((res) => res.data.users),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl" role="heading" aria-level={1}>
          Users
        </CardTitle>
        <CardDescription>People who can sign in to the helpdesk</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">
        {error ? (
          <p className="text-destructive">Could not load users ({errorMessage(error)}).</p>
        ) : !users ? (
          <p className="text-muted-foreground">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="text-muted-foreground">No users found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                      {user.role === 'ADMIN' ? 'Admin' : 'Agent'}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export default UsersPage
