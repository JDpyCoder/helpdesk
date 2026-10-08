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
import { Role } from '@/lib/roles.ts'

export type User = {
  id: string
  name: string
  email: string
  role: Role
  createdAt: string
}

// Loads GET /api/users and renders the list with its loading, error and empty states
function UsersTable() {
  const { data: users, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => axios.get<{ users: User[] }>('/api/users').then((res) => res.data.users),
  })

  if (error) {
    return <p className="text-destructive">Could not load users ({errorMessage(error)}).</p>
  }

  if (!users) {
    return (
      <div role="status" aria-label="Loading users" className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    )
  }

  if (users.length === 0) {
    return <p className="text-muted-foreground">No users found.</p>
  }

  return (
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
              <Badge variant={user.role === Role.ADMIN ? 'default' : 'secondary'}>
                {user.role === Role.ADMIN ? 'Admin' : 'Agent'}
              </Badge>
            </TableCell>
            <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export default UsersTable
