-- Text cuid ids can't be cast to integers, and fromName becomes required, so existing ticket
-- rows (only ever test data at this point) are removed before the columns change.
TRUNCATE TABLE "ticket_message", "ticket";

/*
  Warnings:

  - The primary key for the `ticket` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `ticket` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `ticket_message` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `ticket_message` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `fromName` on table `ticket` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `ticketId` on the `ticket_message` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `fromName` on table `ticket_message` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ticket_message" DROP CONSTRAINT "ticket_message_ticketId_fkey";

-- AlterTable
ALTER TABLE "ticket" DROP CONSTRAINT "ticket_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ALTER COLUMN "fromName" SET NOT NULL,
ADD CONSTRAINT "ticket_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ticket_message" DROP CONSTRAINT "ticket_message_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "ticketId",
ADD COLUMN     "ticketId" INTEGER NOT NULL,
ALTER COLUMN "fromName" SET NOT NULL,
ADD CONSTRAINT "ticket_message_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "ticket_message_ticketId_idx" ON "ticket_message"("ticketId");

-- AddForeignKey
ALTER TABLE "ticket_message" ADD CONSTRAINT "ticket_message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
