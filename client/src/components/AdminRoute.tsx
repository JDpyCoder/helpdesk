import { Navigate, Outlet } from 'react-router'
import { authClient } from '../lib/auth-client.ts'
import { Role } from '../lib/roles.ts'

// Nest inside ProtectedLayout: the session is already loaded and non-null there
function AdminRoute() {
  const { data: session } = authClient.useSession()

  if (session?.user.role !== Role.ADMIN) return <Navigate to="/" replace />

  return <Outlet />
}

export default AdminRoute
