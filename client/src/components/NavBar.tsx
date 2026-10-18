import { Inbox, LayoutDashboard, LogOut, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import BrandMark from '@/components/BrandMark.tsx'
import { textLinkVariants } from '@/components/TextLink.tsx'
import ThemeToggle from '@/components/ThemeToggle.tsx'
import { Button } from '@/components/ui/button.tsx'
import { authClient } from '@/lib/auth-client.ts'
import { queryClient } from '@/lib/query-client.ts'

const sidebarLink = textLinkVariants({ variant: 'sidebar' })

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

// The app's navigation: a sidebar from md up, a bar across the top on smaller screens
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
    <nav
      aria-label="Main"
      className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b bg-sidebar px-4 py-3 text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:flex-col md:flex-nowrap md:items-stretch md:gap-6 md:border-r md:border-b-0 md:px-3 md:py-5"
    >
      <Link to="/" className="flex items-center gap-2.5 rounded-sm px-2.5 text-base font-bold tracking-tight">
        <BrandMark />
        Helpdesk
      </Link>
      <div className="flex flex-wrap gap-1 md:flex-col">
        <NavLink to="/" end className={sidebarLink}>
          <LayoutDashboard aria-hidden />
          Dashboard
        </NavLink>
        <NavLink to="/tickets" className={sidebarLink}>
          <Inbox aria-hidden />
          Tickets
        </NavLink>
        {isAdmin && (
          <NavLink to="/users" className={sidebarLink}>
            <Users aria-hidden />
            Users
          </NavLink>
        )}
      </div>
      <ThemeToggle className="ml-auto md:mt-auto md:ml-0 md:self-start md:px-0.5" />
      <div className="flex items-center gap-3 md:border-t md:px-2.5 md:pt-4">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-agent-soft text-xs font-semibold text-agent-soft-foreground"
        >
          {initials(userName)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{userName}</span>
        <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={signingOut}>
          <LogOut aria-hidden />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </nav>
  )
}

export default NavBar
