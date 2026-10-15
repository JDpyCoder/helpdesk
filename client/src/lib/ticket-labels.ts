import { SenderType, TicketCategory, TicketStatus } from 'core'

// Display labels and badge styles shared by the ticket list and the ticket detail page

export const statusLabels: Record<TicketStatus, string> = {
  [TicketStatus.NEW]: 'New',
  [TicketStatus.PROCESSING]: 'Processing',
  [TicketStatus.OPEN]: 'Open',
  [TicketStatus.RESOLVED]: 'Resolved',
  [TicketStatus.CLOSED]: 'Closed',
}

export const statusVariants: Record<TicketStatus, 'default' | 'secondary' | 'outline'> = {
  [TicketStatus.NEW]: 'default',
  [TicketStatus.PROCESSING]: 'secondary',
  [TicketStatus.OPEN]: 'default',
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

export const senderTypeVariants: Record<SenderType, 'default' | 'secondary' | 'outline'> = {
  [SenderType.CUSTOMER]: 'outline',
  [SenderType.AGENT]: 'secondary',
  [SenderType.AI]: 'default',
}
