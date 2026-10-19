/**
 * Idle time after which polling parks, measured from the last pointer, key or visibility event.
 * The same events re-arm it with one immediate catch-up tick.
 */
export const IDLE_PARK_MS = 30 * 60_000;
