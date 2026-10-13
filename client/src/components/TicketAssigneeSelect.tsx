import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select.tsx'
import { errorMessage } from '@/lib/query-client.ts'
import type { TicketDetail } from '@/pages/TicketDetailPage.tsx'
import type { UpdateTicketInput } from 'core'

export type Agent = { id: string; name: string }

// Picks the ticket's assignee from GET /api/agents and saves it straight away with PATCH /api/tickets/:id
function TicketAssigneeSelect({ ticket }: { ticket: TicketDetail }) {
  const queryClient = useQueryClient()

  const { data: agents, error: agentsError } = useQuery({
    queryKey: ['agents'],
    queryFn: () => axios.get<{ agents: Agent[] }>('/api/agents').then((res) => res.data.agents),
  })

  const assign = useMutation({
    mutationFn: (assignedToId: string | null) =>
      axios
        .patch<{ ticket: TicketDetail }>(`/api/tickets/${ticket.id}`, { assignedToId } satisfies UpdateTicketInput)
        .then((res) => res.data.ticket),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['tickets', ticket.id], updated)
      // The list shows the assignee and may be sorted by it
      await queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const current = ticket.assignedTo
  // While saving, show the choice being saved rather than snapping back to the old one
  const selectedId = assign.isPending ? (assign.variables ?? '') : (current?.id ?? '')
  // Keep the current assignee selectable while agents load, or if they are no longer an active agent
  const options =
    current && !agents?.some((agent) => agent.id === current.id) ? [current, ...(agents ?? [])] : (agents ?? [])
  const serverMessage = (assign.error?.response?.data as { error?: string } | undefined)?.error

  return (
    <div className="space-y-1">
      <NativeSelect
        size="sm"
        aria-label="Assigned to"
        value={selectedId}
        disabled={!agents || assign.isPending}
        aria-invalid={assign.isError || undefined}
        onChange={(e) => assign.mutate(e.target.value || null)}
      >
        <NativeSelectOption value="">Unassigned</NativeSelectOption>
        {options.map((agent) => (
          <NativeSelectOption key={agent.id} value={agent.id}>
            {agent.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {agentsError && <p className="text-destructive">Could not load agents ({errorMessage(agentsError)}).</p>}
      {assign.error && (
        <p className="text-destructive">Could not assign ticket ({serverMessage ?? errorMessage(assign.error)}).</p>
      )}
    </div>
  )
}

export default TicketAssigneeSelect
