import { cn } from 'cn'

// The helpdesk logo: three overlapping circles for the customer, the AI and the agent
function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" aria-hidden className={cn('size-6.5 shrink-0', className)}>
      <circle cx="7" cy="13" r="5" className="fill-customer" />
      <circle cx="13" cy="13" r="5" className="fill-ai" opacity="0.9" />
      <circle cx="19" cy="13" r="5" className="fill-agent" opacity="0.9" />
    </svg>
  )
}

export default BrandMark
