-- Data migration: deleting a user now unassigns their tickets (DELETE /api/users/:id).
-- Clear the assignee on tickets still assigned to users soft-deleted before that change.
UPDATE "ticket"
SET "assignedToId" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "assignedToId" IN (SELECT "id" FROM "user" WHERE "deletedAt" IS NOT NULL);
