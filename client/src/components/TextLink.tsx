import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import type { ComponentProps } from 'react'
import { Link } from 'react-router'

// The app's text link styles, so links don't repeat hover classes. Links styled as buttons use
// <Button asChild><Link /></Button> instead.
const textLinkVariants = cva('rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50', {
  variants: {
    variant: {
      // A link inside content, e.g. a ticket subject: underlined on hover
      default: 'underline-offset-4 hover:underline',
      // A navigation link: muted until hovered
      nav: 'text-sm text-muted-foreground transition-colors hover:text-foreground',
      // A sidebar item: highlighted while it is the current page (NavLink sets aria-current)
      sidebar:
        'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

function TextLink({
  className,
  variant,
  ...props
}: ComponentProps<typeof Link> & VariantProps<typeof textLinkVariants>) {
  return <Link className={cn(textLinkVariants({ variant, className }))} {...props} />
}

export { TextLink, textLinkVariants }
