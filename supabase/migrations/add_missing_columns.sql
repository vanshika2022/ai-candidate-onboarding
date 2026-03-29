-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add_missing_columns.sql
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. has_discrepancies (BOOLEAN) on applications
--    Added by Phase 2 enrichment. Set to TRUE when Claude Sonnet + Tavily
--    detect discrepancies between resume claims and web findings (e.g. employer
--    not found on LinkedIn, job title mismatch). Advisory only — does NOT
--    change status. Surfaced as a warning badge in the admin dashboard.
--    Default FALSE so existing rows without enrichment are not flagged.
--
-- 2. pending_slack_messages table
--    Stores queued Slack messages that could not be delivered immediately
--    (e.g. candidate not yet in the Slack workspace). A cron job or webhook
--    handler polls this table and retries delivery once the user joins.
--    sent_at is NULL until delivery succeeds.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS has_discrepancies BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS pending_slack_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_email TEXT        NOT NULL,
  message         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  sent_at         TIMESTAMPTZ
);
