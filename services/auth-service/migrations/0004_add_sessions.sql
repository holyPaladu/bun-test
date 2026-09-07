CREATE TABLE sessions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz,
  ip_address     inet,
  user_agent     text,
  revoked_at     timestamptz,
  revoked_reason text  -- 'logout' | 'reuse_detected' | 'session_limit'
);

CREATE INDEX sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;

ALTER TABLE refresh_tokens ADD COLUMN session_id uuid REFERENCES sessions(id) ON DELETE CASCADE;

-- бэкфилл: каждой существующей refresh_tokens-строке своя сессия,
-- старые цепочки ротации распадаются — для дев-базы ок
INSERT INTO sessions (id, user_id, created_at, last_seen_at, ip_address, user_agent, revoked_at)
SELECT id, user_id, created_at, last_used_at, ip_address, user_agent, revoked_at FROM refresh_tokens;

UPDATE refresh_tokens SET session_id = id WHERE session_id IS NULL;
ALTER TABLE refresh_tokens ALTER COLUMN session_id SET NOT NULL;
CREATE INDEX refresh_tokens_session_id_idx ON refresh_tokens (session_id);
