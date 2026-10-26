import { useState } from 'react'
import { MailIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { SUPPORT_BANNER_STORAGE_KEY, SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/support.ts'

function readDismissed() {
  try {
    return localStorage.getItem(SUPPORT_BANNER_STORAGE_KEY) === 'true'
  } catch {
    // Storage can be blocked (private mode, site data off): show the banner
    return false
  }
}

// Tells visitors where to email for help; shown above every page until closed
function SupportBanner() {
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(SUPPORT_BANNER_STORAGE_KEY, 'true')
    } catch {
      // Not saved; the banner stays hidden until the page is reloaded
    }
  }

  return (
    <aside
      aria-label="Support notice"
      className="flex items-start gap-3 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm sm:items-center sm:justify-center"
    >
      <MailIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary sm:mt-0" />
      <p className="min-w-0 flex-1 sm:flex-none">
        Have a query? Email us at{' '}
        <a
          href={SUPPORT_MAILTO}
          className="font-medium break-all text-primary underline-offset-4 hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>{' '}
        and a ticket will be raised automatically.
      </p>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={dismiss}
        aria-label="Dismiss support notice"
        className="-my-0.5 shrink-0"
      >
        <XIcon />
      </Button>
    </aside>
  )
}

export default SupportBanner
