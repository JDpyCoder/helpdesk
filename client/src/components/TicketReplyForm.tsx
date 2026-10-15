import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { type CreateReplyInput, createReplySchema } from 'core'
import { AlertCircle, Loader2, Send } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import { updateErrorMessage } from '@/lib/use-update-ticket.ts'
import type { TicketDetail } from '@/pages/TicketDetailPage.tsx'

const replyDefaults: CreateReplyInput = { body: '' }

// Sends an agent's reply with POST /api/tickets/:id/replies; the reply joins the thread above
function TicketReplyForm({ ticketId }: { ticketId: number }) {
  const queryClient = useQueryClient()
  const form = useForm<CreateReplyInput>({
    resolver: zodResolver(createReplySchema),
    defaultValues: replyDefaults,
  })
  const { errors } = form.formState

  const sendReply = useMutation({
    mutationFn: (values: CreateReplyInput) =>
      axios.post<{ ticket: TicketDetail }>(`/api/tickets/${ticketId}/replies`, values).then((res) => res.data.ticket),
    onSuccess: async (ticket) => {
      queryClient.setQueryData(['tickets', ticketId], ticket)
      form.reset(replyDefaults)
      // The lists show the ticket's updated time and may sort by it
      await queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (error) => {
      // The text stays in the box so the agent can try again
      form.setError('root.serverError', { message: `Could not send reply (${updateErrorMessage(error)}).` })
    },
  })

  return (
    <form onSubmit={form.handleSubmit((values) => sendReply.mutate(values))} noValidate>
      <FieldGroup>
        {errors.root?.serverError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{errors.root.serverError.message}</AlertDescription>
          </Alert>
        )}

        <Controller
          name="body"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="ticket-reply-body">Reply</FieldLabel>
              <Textarea
                {...field}
                id="ticket-reply-body"
                placeholder="Write a reply to the customer…"
                className="min-h-28"
                disabled={sendReply.isPending}
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={sendReply.isPending}>
            {sendReply.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {sendReply.isPending ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

export default TicketReplyForm
