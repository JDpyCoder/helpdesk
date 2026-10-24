\set ON_ERROR_STOP on
SET client_encoding TO 'UTF8';
\copy (SELECT id, subject, "fromEmail", "fromName", CASE WHEN status::text = 'PROCESSING' THEN 'OPEN' ELSE status::text END AS status, category, "createdAt", "updatedAt", "resolvedAt" FROM ticket ORDER BY id) TO 'E:/helpdesk/server/export/tickets.csv' WITH (FORMAT csv, HEADER)
\copy (SELECT id, "ticketId", "messageId", "fromEmail", "fromName", body, "receivedAt", "senderType", "emailStatus" FROM ticket_message ORDER BY id) TO 'E:/helpdesk/server/export/messages.csv' WITH (FORMAT csv, HEADER)
