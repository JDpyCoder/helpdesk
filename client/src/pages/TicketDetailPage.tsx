import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import TicketAssigneeSelect from '@/components/TicketAssigneeSelect.tsx'
import TicketCategorySelect from '@/components/TicketCategorySelect.tsx'
import TicketReplyForm from '@/components/TicketReplyForm.tsx'
import TicketStatusSelect from '@/components/TicketStatusSelect.tsx'
import type { TicketListItem } from '@/components/TicketsTable.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Separator } from '@/components/ui/separator.tsx'
import { Skeleton } from '@/components/ui/skeleton.tsx'
import { errorMessage } from '@/lib/query-client.ts'
import { senderTypeLabels, senderTypeVariants } from '@/lib/ticket-labels.ts'
import { cn } from 'cn'
import { SenderType, ticketIdSchema } from 'core'

export type TicketMessage = {
  id: number
  senderType: SenderType
  // The agent or admin who wrote an AGENT message; null for customer emails
  author: { id: string; name: string } | null
  fromEmail: string
  fromName: string
  body: string
  receivedAt: string
}

// GET /api/tickets/:id: the list columns plus the conversation, oldest message first
export type TicketDetail = TicketListItem & { messages: TicketMessage[] }

// /tickets/:id — one ticket's details and its email conversation
function TicketDetailPage() {
  const { id } = useParams()
  // A malformed id in the URL can't match a ticket, so it isn't requested
  const parsedId = ticketIdSchema.safeParse(id)
  const ticketId = parsedId.success ? parsedId.data : null

  const { data: ticket, error } = useQuery({
    queryKey: ['tickets', ticketId],
    queryFn: () => axios.get<{ ticket: TicketDetail }>(`/api/tickets/${ticketId}`).then((res) => res.data.ticket),
    enabled: ticketId !== null,
  })

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2.5" asChild>
        <Link to="/tickets">
          <ArrowLeft aria-hidden />
          Back to tickets
        </Link>
      </Button>
      <TicketDetailContent ticket={ticket} error={ticketId === null ? 'not-found' : error} />
    </div>
  )
}

type TicketDetailContentProps = {
  ticket: TicketDetail | undefined
  error: Parameters<typeof errorMessage>[0] | 'not-found' | null
}

function TicketDetailContent({ ticket, error }: TicketDetailContentProps) {
  if (error === 'not-found' || error?.response?.status === 404) {
    return <p className="text-sm text-muted-foreground">Ticket not found.</p>
  }

  if (error) {
    return <p className="text-sm text-destructive">Could not load ticket ({errorMessage(error)}).</p>
  }

  if (!ticket) {
    return (
      <div role="status" aria-label="Loading ticket" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-7 w-96 max-w-full" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // The email that opened the ticket, then everything after it: customer follow-ups and agent replies
  const [original, ...replies] = ticket.messages

  // Two columns from lg up: the conversation on the left, the editable details on the right
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl" role="heading" aria-level={1}>
            <span className="text-muted-foreground">#{ticket.id}</span> {ticket.subject}
          </CardTitle>
          <CardDescription>
            From {ticket.fromName} &lt;{ticket.fromEmail}&gt;
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <Separator />
          {original && (
            <section aria-labelledby="ticket-message-heading" className="space-y-4">
              <h2 id="ticket-message-heading" className="font-medium">
                Message
              </h2>
              <MessageItem message={original} />
            </section>
          )}
          <section aria-labelledby="ticket-replies-heading" className="space-y-4">
            <h2 id="ticket-replies-heading" className="font-medium">
              Replies ({replies.length})
            </h2>
            {replies.length === 0 ? (
              <p className="text-muted-foreground">No replies yet.</p>
            ) : (
              <ol className="space-y-4">
                {replies.map((message) => (
                  <MessageItem key={message.id} message={message} as="li" />
                ))}
              </ol>
            )}
          </section>
          <Separator />
          <TicketReplyForm ticketId={ticket.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Details
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <dl className="space-y-4">
            <DetailItem label="Status">
              <TicketStatusSelect ticket={ticket} />
            </DetailItem>
            <DetailItem label="Category">
              <TicketCategorySelect ticket={ticket} />
            </DetailItem>
            <DetailItem label="Assigned to">
              <TicketAssigneeSelect ticket={ticket} />
            </DetailItem>
            <DetailItem label="Created">{new Date(ticket.createdAt).toLocaleString()}</DetailItem>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

// One message in the conversation; agent replies are tinted so the two sides are easy to tell apart
function MessageItem({ message, as: Tag = 'article' }: { message: TicketMessage; as?: 'article' | 'li' }) {
  return (
    <Tag
      aria-label={`Message from ${message.fromName}`}
      className={cn('rounded-lg border p-4', message.senderType === SenderType.AGENT && 'bg-muted/50')}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{message.fromName}</span>
          <span className="text-muted-foreground">&lt;{message.fromEmail}&gt;</span>
          <Badge variant={senderTypeVariants[message.senderType]}>{senderTypeLabels[message.senderType]}</Badge>
        </div>
        <time dateTime={message.receivedAt} className="text-muted-foreground">
          {new Date(message.receivedAt).toLocaleString()}
        </time>
      </div>
      <p className="break-words whitespace-pre-wrap">{message.body}</p>
    </Tag>
  )
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default TicketDetailPage
