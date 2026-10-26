-- AgentMail: additive only (new enum values, nullable columns, one new table)

-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "EmailStatus" ADD VALUE 'BOUNCED';
ALTER TYPE "EmailStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN "agentmailThreadId" TEXT;

-- AlterTable
ALTER TABLE "ticket_message" ADD COLUMN "agentmailMessageId" TEXT,
ADD COLUMN "emailError" TEXT;

-- CreateTable
CREATE TABLE "agentmail_event" (
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agentmail_event_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_agentmailThreadId_key" ON "ticket"("agentmailThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_message_agentmailMessageId_key" ON "ticket_message"("agentmailMessageId");
