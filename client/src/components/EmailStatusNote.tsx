import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import type { TicketDetail } from '@/pages/TicketDetailPage.tsx'
import { emailFailedStatuses, emailStatusLabels } from '@/lib/ticket-labels.ts'
import { updateErrorMessage } from '@/lib/use-update-ticket.ts'
import { cn } from 'cn'
import { EmailStatus } from 'core'

type EmailStatusNoteProps = {
  ticketId: number
  messageId: number
  emailStatus: EmailStatus
  emailError: string | null
}

// Whether a reply was emailed to the customer, next to its time. A failed send can be retried
// (POST /api/tickets/:id/messages/:messageId/resend, which can't send it twice).
function EmailStatusNote({ ticketId, messageId, emailStatus, emailError }: EmailStatusNoteProps) {
  const queryClient = useQueryClient()
  const resend = useMutation({
    mutationFn: () =>
      axios
        .post<{ ticket: TicketDetail }>(`/api/tickets/${ticketId}/messages/${messageId}/resend`)
        .then((res) => res.data.ticket),
    onSuccess: async (ticket) => {
      queryClient.setQueryData(['tickets', ticketId], ticket)
      await queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const failed = emailFailedStatuses.includes(emailStatus)
  const pending = emailStatus === EmailStatus.PENDING || resend.isPending

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span role="status" className={cn('flex items-center gap-1', failed ? 'text-destructive' : 'text-muted-foreground')}>
        {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {resend.isPending ? emailStatusLabels[EmailStatus.PENDING] : emailStatusLabels[emailStatus]}
        {failed && emailError && !resend.isPending && `: ${emailError}`}
      </span>
      {emailStatus === EmailStatus.FAILED && (
        <Button type="button" variant="outline" size="xs" onClick={() => resend.mutate()} disabled={resend.isPending}>
          <RotateCw aria-hidden />
          Retry sending
        </Button>
      )}
      {resend.isError && (
        <span className="text-destructive">Could not retry ({updateErrorMessage(resend.error)}).</span>
      )}
    </div>
  )
}

export default EmailStatusNote
