ALTER TABLE sessions
  ADD COLUMN absolute_expires_at timestamptz;

-- Старые сессии получают тот же абсолютный лимит от момента их создания.
UPDATE sessions
SET absolute_expires_at = created_at + INTERVAL '90 days';

ALTER TABLE sessions
  ALTER COLUMN absolute_expires_at SET NOT NULL,
  ADD CONSTRAINT sessions_absolute_expiry_check
    CHECK (absolute_expires_at > created_at);

CREATE INDEX sessions_absolute_expires_at_idx
  ON sessions (absolute_expires_at)
  WHERE revoked_at IS NULL;
