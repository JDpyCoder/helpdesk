import { Navigate, Outlet } from 'react-router'
import { authClient } from '../lib/auth-client.ts'
import NavBar from './NavBar.tsx'

// Wraps every page that requires a signed-in user
function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-muted">
      <NavBar userName={session.user.name} isAdmin={session.user.role === 'ADMIN'} />
      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  )
}

export default ProtectedLayout
