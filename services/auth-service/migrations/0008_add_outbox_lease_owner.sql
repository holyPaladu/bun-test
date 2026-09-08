ALTER TABLE outbox_events ADD COLUMN lease_owner text;

-- Старые claims нельзя безопасно присвоить новому worker: освобождаем их.
-- Возможная повторная доставка допустима at-least-once семантикой.
UPDATE outbox_events SET locked_until = NULL WHERE locked_until IS NOT NULL;

ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_lease_check CHECK (
  (locked_until IS NULL AND lease_owner IS NULL)
  OR (locked_until IS NOT NULL AND lease_owner IS NOT NULL)
);
