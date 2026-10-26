import { LifeBuoyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { SUPPORT_REQUEST_MAILTO } from '@/lib/support.ts'

// Floating bottom-right link that starts a support email; icon only on small screens to cover less of the page
function HelpButton() {
  return (
    <Button
      asChild
      size="lg"
      className="fixed right-4 bottom-4 z-40 size-11 rounded-full shadow-lg sm:size-auto sm:h-10 sm:px-4 md:right-6 md:bottom-6"
    >
      <a href={SUPPORT_REQUEST_MAILTO} aria-label="Need help? Email support">
        <LifeBuoyIcon className="size-5 sm:size-4" />
        <span className="hidden sm:inline">Need help?</span>
      </a>
    </Button>
  )
}

export default HelpButton
