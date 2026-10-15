-- AlterEnum: NEW and PROCESSING come before OPEN, so sorting by status follows the ticket's lifecycle
ALTER TYPE "TicketStatus" ADD VALUE 'NEW' BEFORE 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'PROCESSING' BEFORE 'OPEN';

-- AlterTable: the PROCESSING status replaces the aiResolving flag
ALTER TABLE "ticket" DROP COLUMN "aiResolving";
