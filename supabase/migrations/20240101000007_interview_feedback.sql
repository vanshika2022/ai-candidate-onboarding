-- Interview feedback: post-interview rating + comments from interviewer/admin
-- Gates offer letter generation — no offer without feedback first.

CREATE TABLE IF NOT EXISTS interview_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  rating          INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comments        TEXT NOT NULL CHECK (char_length(comments) > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (application_id)
);

-- RLS disabled for prototype (matches existing pattern in 20240101000003_disable_rls.sql)
ALTER TABLE interview_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON interview_feedback FOR ALL USING (true) WITH CHECK (true);
