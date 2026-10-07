import { QueryClient } from '@tanstack/react-query'
import type { AxiosError } from 'axios'

// Queries fetch with axios, so their errors are AxiosErrors
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: AxiosError
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx (401, 403, 404) won't fix themselves; only retry network and server errors
      retry: (failureCount, error) =>
        (!error.response || error.response.status >= 500) && failureCount < 3,
    },
  },
})

// "HTTP 403" when the server answered, otherwise axios's message (e.g. "Network Error")
export function errorMessage(error: AxiosError) {
  return error.response ? `HTTP ${error.response.status}` : error.message
}
