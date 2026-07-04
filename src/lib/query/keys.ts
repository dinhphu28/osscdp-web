import type { DlqStatus } from '@/types';

/**
 * Query-key factory. Every server-state cache entry is namespaced by tenant so
 * switching tenants never leaks or collides. Mutations invalidate by prefix.
 * Prefix shape is always ['t', tenantId, <feature>, ...].
 * See docs/03-architecture.md §5.
 */
export const qk = {
  events: (tenantId: string) => ({
    all: ['t', tenantId, 'events'] as const,
    list: (filters: { identifier_key?: string; event_name?: string }) =>
      ['t', tenantId, 'events', 'list', filters] as const,
    detail: (eventId: string) => ['t', tenantId, 'events', eventId] as const,
  }),
  sources: (tenantId: string) => ({
    all: ['t', tenantId, 'sources'] as const,
  }),
  profiles: (tenantId: string) => ({
    all: ['t', tenantId, 'profiles'] as const,
    detail: (cuid: string) => ['t', tenantId, 'profiles', cuid] as const,
    consent: (cuid: string) => ['t', tenantId, 'profiles', cuid, 'consent'] as const,
    identifiers: (cuid: string) => ['t', tenantId, 'profiles', cuid, 'identifiers'] as const,
  }),
  segments: (tenantId: string) => ({
    all: ['t', tenantId, 'segments'] as const,
    detail: (segmentId: string) => ['t', tenantId, 'segments', segmentId] as const,
    members: (segmentId: string) => ['t', tenantId, 'segments', segmentId, 'members'] as const,
  }),
  destinations: (tenantId: string) => ({
    all: ['t', tenantId, 'destinations'] as const,
    detail: (destinationId: string) => ['t', tenantId, 'destinations', destinationId] as const,
    deliveries: (destinationId: string) =>
      ['t', tenantId, 'destinations', destinationId, 'deliveries'] as const,
  }),
  dlq: (tenantId: string) => ({
    list: (status: DlqStatus) => ['t', tenantId, 'dlq', status] as const,
  }),
} as const;
