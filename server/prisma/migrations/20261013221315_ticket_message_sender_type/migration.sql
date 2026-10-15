-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('CUSTOMER', 'AGENT');

-- AlterTable
ALTER TABLE "ticket_message" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "senderType" "SenderType" NOT NULL DEFAULT 'CUSTOMER';

-- CreateIndex
CREATE INDEX "ticket_message_authorId_idx" ON "ticket_message"("authorId");

-- AddForeignKey
ALTER TABLE "ticket_message" ADD CONSTRAINT "ticket_message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
