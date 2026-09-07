CREATE TABLE outbox_events (
  id               uuid        PRIMARY KEY,
  event_type       text        NOT NULL,
  aggregate_id     uuid        NOT NULL,
  payload          jsonb       NOT NULL,
  occurred_at      timestamptz NOT NULL,
  attempt_count    integer     NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  locked_until     timestamptz,
  published_at     timestamptz,
  dead_lettered_at timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_events_terminal_state_check CHECK (
    NOT (published_at IS NOT NULL AND dead_lettered_at IS NOT NULL)
  )
);

CREATE INDEX outbox_events_delivery_idx
  ON outbox_events (next_attempt_at, occurred_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;

CREATE INDEX outbox_events_dead_letter_idx
  ON outbox_events (dead_lettered_at)
  WHERE dead_lettered_at IS NOT NULL;
