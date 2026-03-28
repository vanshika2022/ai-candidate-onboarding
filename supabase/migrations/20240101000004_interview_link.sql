-- Phase 03: interview scheduling column
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_link TEXT;
