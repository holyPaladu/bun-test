CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  password_hash text        NOT NULL,
  status        text        NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_status_check CHECK (status IN ('active', 'blocked'))
);

-- Уникальность email — единственная настоящая гарантия от дублей:
-- проверка в use-case не переживает две одновременные регистрации.
CREATE UNIQUE INDEX users_email_key ON users (email);
