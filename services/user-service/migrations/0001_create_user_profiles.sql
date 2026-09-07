CREATE TABLE user_profiles (
  user_id      uuid        PRIMARY KEY,
  display_name text,
  avatar_url   text,
  locale       text,
  timezone     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
