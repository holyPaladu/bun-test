/** Metadata persisted to reserve an integration event for processing. */
export interface InboxEntry {
  eventId: string
  eventType: string
  occurredAt: string
}
