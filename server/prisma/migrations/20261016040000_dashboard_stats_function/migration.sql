-- Dashboard stats (GET /api/dashboard/stats) in one pass over "ticket".
-- Prisma doesn't model functions: change this one with a new migration (CREATE OR REPLACE, or DROP + CREATE
-- when the returned columns change), never by editing this file.
--
-- ai_agent_email identifies the AI Agent user (AI_AGENT_EMAIL in server/src/lib/ai-agent.ts). Tickets it
-- still holds once RESOLVED or CLOSED count as resolved by AI; with no such active user, none do.
CREATE FUNCTION dashboard_stats(ai_agent_email text)
RETURNS TABLE (
  total_tickets          integer,
  open_tickets           integer,
  ai_resolved_tickets    integer,
  -- Share of all tickets, 0–100 with one decimal; 0 when there are no tickets
  ai_resolved_percent    double precision,
  -- Mean resolvedAt − createdAt over resolved/closed tickets, in whole seconds; NULL when there are none
  avg_resolution_seconds double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH ai_agent AS (
    SELECT id FROM "user" WHERE email = ai_agent_email AND "deletedAt" IS NULL
  ),
  counts AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE t.status = 'OPEN') AS open,
      COUNT(*) FILTER (
        WHERE t.status IN ('RESOLVED', 'CLOSED') AND t."assignedToId" IN (SELECT id FROM ai_agent)
      ) AS ai_resolved,
      AVG(EXTRACT(EPOCH FROM t."resolvedAt" - t."createdAt")) FILTER (
        WHERE t.status IN ('RESOLVED', 'CLOSED') AND t."resolvedAt" IS NOT NULL
      ) AS avg_seconds
    FROM "ticket" t
  )
  SELECT
    total::integer,
    open::integer,
    ai_resolved::integer,
    CASE WHEN total = 0 THEN 0 ELSE ROUND(100.0 * ai_resolved / total, 1) END::double precision,
    ROUND(avg_seconds)::double precision
  FROM counts
$$;
