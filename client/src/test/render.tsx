import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip.tsx'

// Renders inside a fresh QueryClient: no cache shared between tests, and no
// retries so error states show immediately. Also provides the app-wide
// TooltipProvider that main.tsx sets up.
export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{ui}</TooltipProvider>
      </QueryClientProvider>
    ),
  }
}
