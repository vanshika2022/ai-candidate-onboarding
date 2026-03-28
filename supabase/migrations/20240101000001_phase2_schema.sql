-- Phase 2: AI Intelligence columns
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_text TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS structured_data JSONB;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_analysis JSONB;

-- RLS: applications insertable by public, readable only by authenticated admins
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_letters ENABLE ROW LEVEL SECURITY;

-- Jobs: public can read open roles
CREATE POLICY "jobs_public_read" ON jobs
  FOR SELECT TO anon USING (status = 'open');

-- Candidates: public can insert (apply), service role can do all
CREATE POLICY "candidates_public_insert" ON candidates
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "candidates_service_all" ON candidates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Applications: public can insert, authenticated (admin) can read/update/delete
CREATE POLICY "applications_public_insert" ON applications
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "applications_service_all" ON applications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "applications_authenticated_select" ON applications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "applications_authenticated_update" ON applications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
