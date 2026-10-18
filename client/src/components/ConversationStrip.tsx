import { senderTypeColors, senderTypeLabels } from '@/lib/ticket-labels.ts'
import { cn } from 'cn'
import type { SenderType } from 'core'

// Who wrote a ticket's latest messages, oldest first, as a row of colored marks: e.g. customer, AI,
// customer means the AI answered and the customer wrote back
function ConversationStrip({ senders }: { senders: SenderType[] }) {
  if (senders.length === 0) return null
  const label = `Conversation: ${senders.map((sender) => senderTypeLabels[sender]).join(', then ')}`

  return (
    <span role="img" aria-label={label} title={label} className="flex gap-0.75">
      {senders.map((sender, index) => (
        <span key={index} className={cn('h-1.5 w-3.5 rounded-full', senderTypeColors[sender])} />
      ))}
    </span>
  )
}

export default ConversationStrip
