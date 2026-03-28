-- Phase 3: Dedicated AI intelligence columns
ALTER TABLE applications ADD COLUMN IF NOT EXISTS discrepancy_flags TEXT[];
ALTER TABLE applications ADD COLUMN IF NOT EXISTS social_research JSONB;

-- Storage bucket: create resumes bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow anon to INSERT into the resumes bucket
-- (Server actions use service_role which bypasses RLS; this allows
--  direct client-side uploads if ever needed in future)
CREATE POLICY IF NOT EXISTS "resumes_anon_insert" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'resumes');

-- Service role retains full access (covers SELECT for signed URLs)
CREATE POLICY IF NOT EXISTS "resumes_service_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'resumes')
  WITH CHECK (bucket_id = 'resumes');
