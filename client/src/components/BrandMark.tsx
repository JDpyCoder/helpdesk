import { cn } from 'cn'

// The helpdesk logo: a support headset (headband, ear cups and microphone) on a violet (primary) rounded tile.
// public/favicon.svg repeats it with the light theme's colors; keep the two in step.
function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" aria-hidden className={cn('size-6.5 shrink-0', className)}>
      <rect width="26" height="26" rx="7" className="fill-primary" />
      <g className="stroke-primary-foreground" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M7.5 13v-1.5a5.5 5.5 0 0 1 11 0V13" />
        <path d="M18.5 17.5v.5a2.5 2.5 0 0 1-2.5 2.5h-1.6" strokeWidth="1.6" />
      </g>
      <g className="fill-primary-foreground">
        <rect x="5.5" y="12" width="4" height="5.5" rx="1.5" />
        <rect x="16.5" y="12" width="4" height="5.5" rx="1.5" />
        <circle cx="13.2" cy="20.5" r="1.3" />
      </g>
    </svg>
  )
}

export default BrandMark
