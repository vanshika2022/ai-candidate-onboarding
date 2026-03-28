-- Phase 5: Extend app_status enum with new operational values
-- manual_review_required : PDF extraction failed — recruiter must review manually
-- slots_held             : 5 tentative calendar holds created, awaiting candidate selection
-- confirmed              : Candidate confirmed a slot; remaining holds released

ALTER TYPE app_status ADD VALUE IF NOT EXISTS 'manual_review_required';
ALTER TYPE app_status ADD VALUE IF NOT EXISTS 'slots_held';
ALTER TYPE app_status ADD VALUE IF NOT EXISTS 'confirmed';
