CREATE TABLE jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  team        TEXT NOT NULL,
  location    TEXT NOT NULL,
  level       TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  linkedin_url    TEXT,
  github_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TYPE app_status AS ENUM (
  'applied', 'screening', 'shortlisted', 'slots_offered',
  'interview_scheduled', 'interviewed', 'offer_sent', 'hired', 'rejected'
);

CREATE TABLE applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      UUID REFERENCES candidates(id),
  job_id            UUID REFERENCES jobs(id),
  status            app_status NOT NULL DEFAULT 'applied',
  resume_url        TEXT,
  ai_score          INT,
  ai_rationale      TEXT,
  ai_brief          TEXT,
  research_profile  JSONB,
  admin_override_note TEXT,
  screened_at       TIMESTAMPTZ,
  shortlisted_at    TIMESTAMPTZ,
  hired_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(candidate_id, job_id)
);

CREATE TYPE slot_status AS ENUM (
  'available', 'tentative_hold', 'confirmed', 'expired'
);

CREATE TABLE interview_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID REFERENCES applications(id),
  interviewer_id  TEXT NOT NULL,
  gcal_event_id   TEXT,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  status          slot_status NOT NULL DEFAULT 'available',
  hold_expires_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_slots_application ON interview_slots(application_id, status);

CREATE TABLE transcripts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID REFERENCES applications(id),
  fireflies_id    TEXT,
  summary         TEXT,
  full_transcript JSONB,
  retrieved_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE offer_letters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  UUID REFERENCES applications(id),
  pandadoc_id     TEXT,
  content         TEXT,
  status          TEXT DEFAULT 'draft',
  signed_at       TIMESTAMPTZ,
  signer_ip       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
