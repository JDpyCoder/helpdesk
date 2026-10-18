import { Monitor, Moon, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.tsx'
import { type Theme, useTheme } from '@/lib/theme.ts'
import { cn } from 'cn'

const options: Record<Theme, { label: string; icon: LucideIcon }> = {
  light: { label: 'Light theme', icon: Sun },
  dark: { label: 'Dark theme', icon: Moon },
  system: { label: 'System theme', icon: Monitor },
}

// Three buttons for light, dark and the system theme; the current one is pressed
function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  return (
    <div role="group" aria-label="Theme" className={cn('flex gap-0.5 rounded-lg bg-muted p-0.5', className)}>
      {(Object.keys(options) as Theme[]).map((value) => {
        const { label, icon: Icon } = options[value]
        return (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={label}
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
                className="text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
              >
                <Icon aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export default ThemeToggle
