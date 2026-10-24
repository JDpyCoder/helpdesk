\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE shift AS
SELECT (now() AT TIME ZONE 'UTC') - interval '1 hour' - GREATEST(
  (SELECT MAX(GREATEST("createdAt", "updatedAt", COALESCE("resolvedAt", "createdAt"))) FROM ticket),
  (SELECT MAX("receivedAt") FROM ticket_message)
) AS d;
UPDATE ticket SET
  "createdAt"  = "createdAt"  + (SELECT d FROM shift),
  "updatedAt"  = "updatedAt"  + (SELECT d FROM shift),
  "resolvedAt" = "resolvedAt" + (SELECT d FROM shift);
UPDATE ticket_message SET "receivedAt" = "receivedAt" + (SELECT d FROM shift);
COMMIT;
SELECT MIN("createdAt") AS oldest, MAX("createdAt") AS newest FROM ticket;
