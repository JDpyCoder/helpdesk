import type { VariantProps } from 'class-variance-authority'
import type { badgeVariants } from '@/components/ui/badge.tsx'
import { EmailStatus, SenderType, TicketCategory, TicketStatus } from 'core'

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

// Display labels and badge styles shared by the ticket list and the ticket detail page

export const statusLabels: Record<TicketStatus, string> = {
  [TicketStatus.NEW]: 'New',
  [TicketStatus.PROCESSING]: 'Processing',
  [TicketStatus.OPEN]: 'Open',
  [TicketStatus.RESOLVED]: 'Resolved',
  [TicketStatus.CLOSED]: 'Closed',
}

// NEW and PROCESSING are the AI's turn; OPEN is waiting on an agent
export const statusVariants: Record<TicketStatus, BadgeVariant> = {
  [TicketStatus.NEW]: 'ai',
  [TicketStatus.PROCESSING]: 'ai',
  [TicketStatus.OPEN]: 'attention',
  [TicketStatus.RESOLVED]: 'secondary',
  [TicketStatus.CLOSED]: 'outline',
}

export const categoryLabels: Record<TicketCategory, string> = {
  [TicketCategory.GENERAL_QUESTION]: 'General Question',
  [TicketCategory.TECHNICAL_QUESTION]: 'Technical Question',
  [TicketCategory.REFUND_REQUEST]: 'Refund Request',
}

export const senderTypeLabels: Record<SenderType, string> = {
  [SenderType.CUSTOMER]: 'Customer',
  [SenderType.AGENT]: 'Agent',
  [SenderType.AI]: 'AI',
}

export const senderTypeVariants: Record<SenderType, BadgeVariant> = {
  [SenderType.CUSTOMER]: 'customer',
  [SenderType.AGENT]: 'agent',
  [SenderType.AI]: 'ai',
}

// The mark for each sender in the list's conversation strip
export const senderTypeColors: Record<SenderType, string> = {
  [SenderType.CUSTOMER]: 'bg-customer',
  [SenderType.AGENT]: 'bg-agent',
  [SenderType.AI]: 'bg-ai',
}

// Shown on replies that are emailed to the customer. "Delivered" means the customer's mail server accepted it,
// not that it reached their inbox.
export const emailStatusLabels: Record<EmailStatus, string> = {
  [EmailStatus.PENDING]: 'Sending email…',
  [EmailStatus.SENT]: 'Emailed',
  [EmailStatus.FAILED]: 'Email not sent',
  [EmailStatus.DELIVERED]: 'Delivered',
  [EmailStatus.BOUNCED]: 'Email bounced',
  [EmailStatus.REJECTED]: 'Email rejected',
}

// Statuses that mean the customer didn't get the email
export const emailFailedStatuses: readonly EmailStatus[] = [EmailStatus.FAILED, EmailStatus.BOUNCED, EmailStatus.REJECTED]
