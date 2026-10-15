-- AlterEnum
ALTER TYPE "SenderType" ADD VALUE 'AI';

-- AlterTable
ALTER TABLE "ticket" ADD COLUMN     "aiResolving" BOOLEAN NOT NULL DEFAULT false;
