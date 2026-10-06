import { Navigate, Outlet } from 'react-router'
import { authClient } from '../lib/auth-client.ts'
import NavBar from './NavBar.tsx'

// Wraps every page that requires a signed-in user
function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar userName={session.user.name} />
      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  )
}

export default ProtectedLayout
