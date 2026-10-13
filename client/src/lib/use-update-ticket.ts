import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import type { UpdateTicketInput } from 'core'
import { errorMessage } from '@/lib/query-client.ts'
import type { TicketDetail } from '@/pages/TicketDetailPage.tsx'

// Saves changes to one ticket with PATCH /api/tickets/:id, then puts the returned ticket in the
// detail cache and refetches the lists (they show status, category and assignee and may sort by them)
export function useUpdateTicket(ticketId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (changes: UpdateTicketInput) =>
      axios.patch<{ ticket: TicketDetail }>(`/api/tickets/${ticketId}`, changes).then((res) => res.data.ticket),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['tickets', ticketId], updated)
      await queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

// The server's `error` message when it sent one (e.g. a 400), otherwise the HTTP status or network error
export function updateErrorMessage(error: Parameters<typeof errorMessage>[0]) {
  return (error.response?.data as { error?: string } | undefined)?.error ?? errorMessage(error)
}
