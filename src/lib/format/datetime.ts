import { formatDistanceToNowStrict, parseISO } from 'date-fns';

/** Relative time ("3 minutes ago") for table timestamp columns. */
export function relativeTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return `${formatDistanceToNowStrict(parseISO(iso))} ago`;
  } catch {
    return iso;
  }
}

/** Absolute local timestamp for tooltips / detail views. */
export function absoluteTime(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return parseISO(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Heuristic: does a value look server-masked (e.g. "u***@x.com", "N***")?
 * Used to show an "unmask requires pii:read" affordance. The frontend NEVER
 * unmasks — it only renders what the server returns. See docs/05-auth-rbac-tenancy.md.
 */
export function looksMasked(value: unknown): boolean {
  return typeof value === 'string' && value.includes('***');
}
