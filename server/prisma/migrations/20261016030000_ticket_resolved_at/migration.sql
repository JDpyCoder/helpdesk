-- AlterTable
ALTER TABLE "ticket" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- Backfill: the best estimate for tickets resolved before this column existed
UPDATE "ticket" SET "resolvedAt" = "updatedAt" WHERE "status" IN ('RESOLVED', 'CLOSED');
