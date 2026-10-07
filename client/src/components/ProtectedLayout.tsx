import { Navigate, Outlet } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { authClient } from '../lib/auth-client.ts'
import NavBar from './NavBar.tsx'

// Wraps every page that requires a signed-in user
function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      // Mirrors the NavBar + page layout so nothing jumps when the session arrives
      <div role="status" aria-label="Loading" className="min-h-screen bg-muted">
        <div className="border-b bg-background">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-9 w-40" />
          </div>
        </div>
        <div className="mx-auto max-w-6xl p-4">
          <Skeleton className="h-40 w-full rounded-xl bg-background" />
        </div>
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
