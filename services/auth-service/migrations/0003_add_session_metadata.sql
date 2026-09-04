ALTER TABLE refresh_tokens
  ADD COLUMN ip_address   inet,
  ADD COLUMN user_agent   text,
  ADD COLUMN last_used_at timestamptz,
  ADD COLUMN replaced_by  uuid REFERENCES refresh_tokens(id);

-- Для join'а "старый токен -> чем заменён" при reuse-detection.
CREATE INDEX refresh_tokens_replaced_by_idx ON refresh_tokens (replaced_by);
