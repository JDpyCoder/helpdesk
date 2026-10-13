import { type TicketCategory, ticketCategorySchema } from 'core'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select.tsx'
import { categoryLabels } from '@/lib/ticket-labels.ts'
import { updateErrorMessage, useUpdateTicket } from '@/lib/use-update-ticket.ts'
import type { TicketDetail } from '@/pages/TicketDetailPage.tsx'

// Changes the ticket's category ("Unclassified" clears it) and saves it straight away with PATCH /api/tickets/:id
function TicketCategorySelect({ ticket }: { ticket: TicketDetail }) {
  const update = useUpdateTicket(ticket.id)
  // While saving, show the choice being saved rather than snapping back to the old one
  const selected = update.isPending ? update.variables.category : ticket.category

  return (
    <div className="space-y-1">
      <NativeSelect
        size="sm"
        className="w-full"
        aria-label="Category"
        value={selected ?? ''}
        disabled={update.isPending}
        aria-invalid={update.isError || undefined}
        onChange={(e) => update.mutate({ category: (e.target.value as TicketCategory) || null })}
      >
        <NativeSelectOption value="">Unclassified</NativeSelectOption>
        {ticketCategorySchema.options.map((category) => (
          <NativeSelectOption key={category} value={category}>
            {categoryLabels[category]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {update.error && (
        <p className="text-destructive">Could not update category ({updateErrorMessage(update.error)}).</p>
      )}
    </div>
  )
}

export default TicketCategorySelect
