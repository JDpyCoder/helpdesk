import { type AgentTicketStatus, agentTicketStatusSchema } from 'core'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select.tsx'
import { statusLabels } from '@/lib/ticket-labels.ts'
import { updateErrorMessage, useUpdateTicket } from '@/lib/use-update-ticket.ts'
import type { TicketDetail } from '@/pages/TicketDetailPage.tsx'

// Changes the ticket's status and saves it straight away with PATCH /api/tickets/:id
function TicketStatusSelect({ ticket }: { ticket: TicketDetail }) {
  const update = useUpdateTicket(ticket.id)
  // While saving, show the choice being saved rather than snapping back to the old one
  const selected = (update.isPending && update.variables.status) || ticket.status
  // Agents can't choose NEW or PROCESSING (AI auto-resolution sets them), but a ticket in one still shows it
  const aiStatus = agentTicketStatusSchema.options.some((status) => status === ticket.status) ? null : ticket.status

  return (
    <div className="space-y-1">
      <NativeSelect
        size="sm"
        className="w-full"
        aria-label="Status"
        value={selected}
        disabled={update.isPending}
        aria-invalid={update.isError || undefined}
        onChange={(e) => update.mutate({ status: e.target.value as AgentTicketStatus })}
      >
        {aiStatus && (
          <NativeSelectOption value={aiStatus} disabled>
            {statusLabels[aiStatus]}
          </NativeSelectOption>
        )}
        {agentTicketStatusSchema.options.map((status) => (
          <NativeSelectOption key={status} value={status}>
            {statusLabels[status]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {update.error && <p className="text-destructive">Could not update status ({updateErrorMessage(update.error)}).</p>}
    </div>
  )
}

export default TicketStatusSelect
