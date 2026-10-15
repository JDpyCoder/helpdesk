import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { TextLink } from '@/components/TextLink.tsx'
import { Button } from '@/components/ui/button.tsx'
import { authClient } from '@/lib/auth-client.ts'
import { queryClient } from '@/lib/query-client.ts'

function NavBar({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await authClient.signOut()
    // Drop cached server data so the next user to sign in never sees it
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            Helpdesk
          </Link>
          <TextLink to="/" variant="nav">
            Dashboard
          </TextLink>
          <TextLink to="/tickets" variant="nav">
            Tickets
          </TextLink>
          {isAdmin && (
            <TextLink to="/users" variant="nav">
              Users
            </TextLink>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{userName}</span>
          <Button variant="outline" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    </nav>
  )
}

export default NavBar
