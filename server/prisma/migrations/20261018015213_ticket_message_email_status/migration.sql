-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "ticket_message" ADD COLUMN     "emailStatus" "EmailStatus";
