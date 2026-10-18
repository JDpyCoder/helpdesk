import { Navigate, Outlet } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { authClient } from '../lib/auth-client.ts'
import { Role } from 'core'
import NavBar from './NavBar.tsx'

// Wraps every page that requires a signed-in user
function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      // Mirrors the NavBar + page layout so nothing jumps when the session arrives
      <div role="status" aria-label="Loading" className="min-h-screen md:flex">
        <div className="flex items-center justify-between border-b bg-sidebar px-4 py-3 md:h-screen md:w-60 md:flex-col md:items-stretch md:justify-start md:gap-6 md:border-r md:border-b-0 md:px-5 md:py-5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-9 w-40 md:w-full" />
        </div>
        <div className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
          <Skeleton className="h-40 w-full rounded-xl bg-card" />
        </div>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen md:flex">
      <NavBar userName={session.user.name} isAdmin={session.user.role === Role.ADMIN} />
      {/* Each child layout (ContentLayout, TicketSplitLayout) sets its own width and padding */}
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export default ProtectedLayout
