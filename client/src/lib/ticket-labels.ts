import { TicketCategory, TicketStatus } from 'core'

// Display labels and badge styles shared by the ticket list and the ticket detail page

export const statusLabels: Record<TicketStatus, string> = {
  [TicketStatus.OPEN]: 'Open',
  [TicketStatus.RESOLVED]: 'Resolved',
  [TicketStatus.CLOSED]: 'Closed',
}

export const statusVariants: Record<TicketStatus, 'default' | 'secondary' | 'outline'> = {
  [TicketStatus.OPEN]: 'default',
  [TicketStatus.RESOLVED]: 'secondary',
  [TicketStatus.CLOSED]: 'outline',
}

export const categoryLabels: Record<TicketCategory, string> = {
  [TicketCategory.GENERAL_QUESTION]: 'General question',
  [TicketCategory.TECHNICAL_QUESTION]: 'Technical question',
  [TicketCategory.REFUND_REQUEST]: 'Refund request',
}
