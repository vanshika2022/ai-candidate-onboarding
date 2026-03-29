-- Phase 3B: Rescheduling support
-- Adds columns to applications table for tracking reschedule requests

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS reschedule_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reschedule_reason TEXT,
ADD COLUMN IF NOT EXISTS reschedule_status TEXT DEFAULT NULL;
-- reschedule_status values: 'pending_admin' | 'approved' | 'declined' | 'new_slots_sent'

-- Add reschedule_requested to the status enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'reschedule_requested'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_status')
  ) THEN
    ALTER TYPE app_status ADD VALUE 'reschedule_requested';
  END IF;
END
$$;
