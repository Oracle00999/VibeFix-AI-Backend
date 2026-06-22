CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  desktop_screenshot TEXT,
  mobile_screenshot TEXT,
  score INTEGER,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  before_after JSONB,
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  improved_preview JSONB,
  generated_code JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audits ADD COLUMN IF NOT EXISTS improved_preview JSONB;

CREATE INDEX IF NOT EXISTS audits_created_at_idx ON audits (created_at DESC);
CREATE INDEX IF NOT EXISTS audits_status_idx ON audits (status);
