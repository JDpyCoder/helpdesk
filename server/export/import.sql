\set ON_ERROR_STOP on
SET client_encoding TO 'UTF8';
BEGIN;
DELETE FROM ticket;
\copy ticket (id, subject, "fromEmail", "fromName", status, category, "createdAt", "updatedAt", "resolvedAt") FROM 'E:/helpdesk/server/export/tickets.csv' WITH (FORMAT csv, HEADER)
\copy ticket_message (id, "ticketId", "messageId", "fromEmail", "fromName", body, "receivedAt", "senderType", "emailStatus") FROM 'E:/helpdesk/server/export/messages.csv' WITH (FORMAT csv, HEADER)
UPDATE ticket_message SET "authorId" = (SELECT id FROM "user" WHERE email = 'admin@helpdesk.com') WHERE "senderType" = 'AGENT';
SELECT setval('ticket_id_seq', (SELECT MAX(id) FROM ticket));
SELECT setval('ticket_message_id_seq', (SELECT MAX(id) FROM ticket_message));
COMMIT;
SELECT (SELECT COUNT(*) FROM ticket) AS tickets, (SELECT COUNT(*) FROM ticket_message) AS messages;
