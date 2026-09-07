CREATE TABLE event_inbox (
  event_id      uuid        PRIMARY KEY,
  event_type    text        NOT NULL,
  occurred_at   timestamptz NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_inbox_processed_at_idx ON event_inbox (processed_at);
