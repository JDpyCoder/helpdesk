import { useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert.tsx'
import { Button } from '@/components/ui/button.tsx'
import { updateErrorMessage } from '@/lib/use-update-ticket.ts'
import { cn } from 'cn'

// "Summarize" asks AI for a summary of the ticket and its conversation (POST /api/tickets/:id/summary).
// Summaries aren't stored: every click generates a new one from the latest messages.
function TicketSummary({ ticketId }: { ticketId: number }) {
  // Kept outside the mutation so the previous summary stays on screen while a new one is generated
  const [summary, setSummary] = useState<string | null>(null)

  const summarize = useMutation({
    mutationFn: () =>
      axios.post<{ summary: string }>(`/api/tickets/${ticketId}/summary`).then((res) => res.data.summary),
    onSuccess: setSummary,
  })

  return (
    <div className="space-y-3">
      <Button type="button" variant="ai" size="sm" onClick={() => summarize.mutate()} disabled={summarize.isPending}>
        {summarize.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {summarize.isPending ? 'Summarizing…' : 'Summarize'}
      </Button>
      {summarize.isError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>Could not summarize ticket ({updateErrorMessage(summarize.error)}).</AlertDescription>
        </Alert>
      )}
      {summary !== null && (
        <section
          aria-label="Summary"
          aria-busy={summarize.isPending}
          className={cn(
            'rounded-xl bg-ai-soft p-4 text-ai-soft-foreground transition-opacity',
            summarize.isPending && 'opacity-60'
          )}
        >
          <h3 className="mb-2 flex items-center gap-1.5 font-semibold">
            <Sparkles className="size-4 text-ai" aria-hidden />
            Summary
          </h3>
          <p className="break-words whitespace-pre-wrap">{summary}</p>
        </section>
      )}
    </div>
  )
}

export default TicketSummary
