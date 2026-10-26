import { cn } from 'cn'

// The helpdesk logo: a white "H" on a violet (primary) rounded tile
function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" aria-hidden className={cn('size-6.5 shrink-0', className)}>
      <rect width="26" height="26" rx="7" className="fill-primary" />
      <path d="M8.5 7v12M17.5 7v12M8.5 13h9" className="stroke-primary-foreground" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export default BrandMark
