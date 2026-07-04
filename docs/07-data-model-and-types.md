# Data Model & TypeScript Types

> Canonical TypeScript types mirroring the osscdp backend entities — the single source of truth that every screen imports from.

These hand-written types **supplement** the Orval-generated types where the OpenAPI spec (`openapi.yaml`) is incomplete or missing endpoints. Orval will generate similar shapes from the spec, but the spec has gaps (see [Backend gaps & caveats](10-backend-gaps-and-caveats.md)); these types fill them. **Screens must import these exact names** — do not redefine or rename them per feature. Place them in `src/types/` as described in [API integration](04-api-integration.md) and the [architecture overview](03-architecture.md).

Rules:

- Use the exact names, enum members, and field names below. They map 1:1 to backend JSON.
- PII fields (email/phone/name) arrive **server-side masked** unless the token holds `pii:read`; the frontend renders values as received and never unmasks client-side.
- `traits_json` and `computed_attributes_json` are **open maps** (`Record<string, unknown>`); known keys are listed at the end.
- Where an endpoint or field is not confirmed in the spec, it is flagged "TBD — backend gap" with a link to [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## Enums

```ts
// ---- Enums ----
export type AdminRole =
  'SUPER_ADMIN' | 'TENANT_ADMIN' | 'MARKETER' | 'ANALYST' | 'OPERATOR' | 'VIEWER';
export type Permission =
  | 'source:read'
  | 'source:write'
  | 'event:read'
  | 'event:replay'
  | 'profile:read'
  | 'profile:delete'
  | 'segment:read'
  | 'segment:write'
  | 'destination:read'
  | 'destination:write'
  | 'activation:read'
  | 'dlq:read'
  | 'dlq:retry'
  | 'audit:read'
  | 'consent:write'
  | 'pii:read'
  | 'admin:write';

export type ConsentChannel = 'email' | 'sms' | 'push' | 'ads' | 'webhook';
export type ConsentPurpose = 'marketing' | 'analytics' | 'personalization' | 'transactional';
export type ConsentStatus = 'granted' | 'denied' | 'unknown';

export type DestinationType = 'webhook' | 'kafka' | 'push' | 'email' | 'crm' | 'ads' | 'warehouse';
export type ActivationTaskStatus =
  'pending' | 'sending' | 'succeeded' | 'failed_retryable' | 'failed_permanent' | 'dlq' | 'skipped';
export type DlqStatus = 'open' | 'retried' | 'discarded';
export type EventType = 'track' | 'identify' | 'alias';
export type RuleOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';
export type LogicalOp = 'and' | 'or' | 'not';
```

| Enum                   | Members                                                                                     | Notes                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AdminRole`            | `SUPER_ADMIN`, `TENANT_ADMIN`, `MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER`                  | 6 roles. Not returned by any API (no admin `whoami`) → declared client-side. See [Auth & RBAC](05-auth-rbac-tenancy.md). |
| `Permission`           | 17 permissions (see list)                                                                   | Derived from role via the client-side role→perm table; used by `<RequirePerm>`.                                          |
| `ConsentChannel`       | `email`, `sms`, `push`, `ads`, `webhook`                                                    | Consent editor axis (channel × purpose).                                                                                 |
| `ConsentPurpose`       | `marketing`, `analytics`, `personalization`, `transactional`                                | Consent editor axis.                                                                                                     |
| `ConsentStatus`        | `granted`, `denied`, `unknown`                                                              | Absence = `unknown`. Activation skips `denied` (task = `skipped`).                                                       |
| `DestinationType`      | `webhook`, `kafka`, `push`, `email`, `crm`, `ads`, `warehouse`                              | Only `webhook`, `kafka` implemented; rest render disabled/"coming soon".                                                 |
| `ActivationTaskStatus` | `pending`, `sending`, `succeeded`, `failed_retryable`, `failed_permanent`, `dlq`, `skipped` | `skipped` = consent denied. Drives `StatusChip` colors.                                                                  |
| `DlqStatus`            | `open`, `retried`, `discarded`                                                              | DLQ list filter values.                                                                                                  |
| `EventType`            | `track`, `identify`, `alias`                                                                | `RawEvent.type` also allows `'batch'` (see below).                                                                       |
| `RuleOp`               | 12 ops                                                                                      | `in`/`not_in` take arrays; `exists`/`not_exists` take no value.                                                          |
| `LogicalOp`            | `and`, `or`, `not`                                                                          | Rule tree grouping operators.                                                                                            |

---

## Identity & Profiles

```ts
export interface Tenant {
  id: string;
  name: string;
  status: 'active';
  created_at: string;
  updated_at: string;
}

export interface CustomerProfile {
  canonical_user_id: string;
  identity_cluster_id: string;
  traits_json: Record<string, unknown>; // email, phone, name, country (PII-masked unless pii:read)
  computed_attributes_json: Record<string, unknown>; // total_events, total_orders, last_event_name, last_source_id, last_page_url, last_product_viewed, last_order_at
  first_seen_at: string;
  last_seen_at: string;
  version: number;
  status?: string;
}

export interface IdentityNode {
  namespace: string;
  value_hash: string;
  value_encrypted?: string | null;
}
export interface IdentityCluster {
  canonical_user_id: string;
  status: string;
  nodes?: IdentityNode[];
}
export interface MergeHistoryEntry {
  from_cluster_id: string;
  to_cluster_id: string;
  reason: string;
  event_id?: string;
  created_at: string;
}
```

| Field                                      | Type                      | Notes                                                                                           |
| ------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------- |
| `Tenant.id`                                | `string`                  | UUID; used as the `{tenantID}` path segment.                                                    |
| `Tenant.status`                            | `'active'`                | Only value observed.                                                                            |
| `CustomerProfile.canonical_user_id`        | `string`                  | Primary key of the unified profile; used in profile routes.                                     |
| `CustomerProfile.identity_cluster_id`      | `string`                  | FK to the identity cluster.                                                                     |
| `CustomerProfile.traits_json`              | `Record<string, unknown>` | **PII-masked** open map (email/phone/name masked unless `pii:read`).                            |
| `CustomerProfile.computed_attributes_json` | `Record<string, unknown>` | **Computed** open map (derived server-side from events).                                        |
| `CustomerProfile.version`                  | `number`                  | Optimistic profile version; increments on update.                                               |
| `IdentityNode.value_hash`                  | `string`                  | Non-reversible hash of the identifier value.                                                    |
| `IdentityNode.value_encrypted`             | `string \| null`          | PII; present/decrypted only with `pii:read`.                                                    |
| `MergeHistoryEntry`                        | —                         | Cluster merge audit; exact endpoint TBD — backend gap ([gaps](10-backend-gaps-and-caveats.md)). |

Profile lookup + sub-resources: `GET .../profiles?email=|?phone=`, `GET .../profiles/{canonicalUserID}`, `GET .../profiles/{canonicalUserID}/identifiers`. Per-profile identity-cluster / events / segments sub-resources are addressed under the profile; where an exact endpoint isn't in the spec, mark "TBD — backend gap".

---

## Events

```ts
export interface RawEvent {
  id: string;
  tenant_id: string;
  event_id: string;
  source_id: string;
  type: EventType | 'batch';
  event_name?: string;
  identifier_key?: string;
  payload_json: Record<string, unknown>;
  payload_hash?: string;
  timestamp: string;
  received_at: string;
  processing_status: string;
  error_reason?: string;
}
```

| Field                                | Type                      | Notes                                                         |
| ------------------------------------ | ------------------------- | ------------------------------------------------------------- |
| `RawEvent.id`                        | `string`                  | Internal row id.                                              |
| `RawEvent.event_id`                  | `string`                  | Client-supplied/pipeline event id (used in replay routes).    |
| `RawEvent.source_id`                 | `string`                  | Source that ingested the event.                               |
| `RawEvent.type`                      | `EventType \| 'batch'`    | `track`/`identify`/`alias`/`batch`.                           |
| `RawEvent.identifier_key`            | `string?`                 | e.g. `user_id:u1`; filter key for the events list.            |
| `RawEvent.payload_json`              | `Record<string, unknown>` | Raw payload; shown in JSON viewer.                            |
| `RawEvent.processing_status`         | `string`                  | Async pipeline status; open string (not an enum in spec).     |
| `RawEvent.timestamp` / `received_at` | `string`                  | ISO timestamps; `timestamp` = client, `received_at` = server. |

Events list is **keyset-paginated** (`limit`, `cursor` → `next_cursor`); use `useInfiniteQuery` + Data Grid server mode. See [Events explorer](screens/04-events-explorer.md) and [API integration](04-api-integration.md).

---

## Segments & Rules

```ts
// Segment rule tree (recursive)
export type Rule = RuleNode | RuleLeaf;
export interface RuleNode {
  operator: LogicalOp;
  conditions: Rule[];
}
export interface RuleLeaf {
  field: string;
  op: RuleOp;
  value?: unknown | unknown[];
}
// Stateful (advanced/feature-flagged) leaf variant, mutually exclusive with field/op/value:
export interface BehaviorLeaf {
  behavior: {
    kind: 'count' | 'frequency' | 'recency' | 'absence' | 'sequence';
    event_name?: string;
    window?: string; // "7d","24h","30m"
    op?: 'gte' | 'gt' | 'lte' | 'lt' | 'eq';
    value?: number;
    value_prop?: string;
    where?: RuleLeaf;
    steps?: Array<{ event_name: string; where?: RuleLeaf }>;
    within?: string;
    anchor?: object;
    exact?: boolean;
  };
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
  status: string;
  current_version_id?: string;
}
export interface SegmentVersion {
  version: number;
  rule_json: Rule;
  status: string;
}
export interface SegmentMembership {
  customer_profile_id: string;
  status: 'member' | string;
  entered_at?: string;
  exited_at?: string | null;
  last_evaluated_at?: string;
  version?: number;
  transition_seq?: number;
}
```

| Field                                   | Type                   | Notes                                                                                                                                                                                                            |
| --------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Rule`                                  | `RuleNode \| RuleLeaf` | Recursive tree; validated client-side (Zod) and server-side on create/edit.                                                                                                                                      |
| `RuleNode.operator`                     | `LogicalOp`            | `and`/`or`/`not`.                                                                                                                                                                                                |
| `RuleLeaf.field`                        | `string`               | Dotted path from the field namespaces (see [Segments screen](screens/06-segments-and-rule-builder.md)).                                                                                                          |
| `RuleLeaf.value`                        | `unknown \| unknown[]` | Array for `in`/`not_in`; omitted for `exists`/`not_exists`.                                                                                                                                                      |
| `BehaviorLeaf`                          | —                      | **Advanced/feature-flagged** stateful leaf; mutually exclusive with `field/op/value`. Time-window rules not shipped yet → gate behind a flag, label "advanced/beta". See [gaps](10-backend-gaps-and-caveats.md). |
| `Segment.current_version_id`            | `string?`              | Points at the active `SegmentVersion`; edits create a NEW version.                                                                                                                                               |
| `SegmentVersion.rule_json`              | `Rule`                 | The rule tree for that version.                                                                                                                                                                                  |
| `SegmentMembership.customer_profile_id` | `string`               | Member profile ref.                                                                                                                                                                                              |
| `SegmentMembership.status`              | `'member' \| string`   | Membership state; open string.                                                                                                                                                                                   |

Note: there is **no confirmed "list all segments" endpoint** in the spec extract (TBD — backend gap; UI needs a segment list, likely `GET .../segments`). `DELETE .../segments/{id}` exists in code but not in `openapi.yaml` (Orval won't generate it; add by hand). See [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## Destinations & Activation

```ts
export interface Source {
  id: string;
  tenant_id: string;
  name: string;
  type: string; // e.g. "server"
  status: 'active' | 'disabled';
  config_json?: Record<string, unknown>;
  rate_limit?: number;
  allowed_event_types?: string[];
  created_at: string;
  updated_at: string;
}
export interface SourceKeyOnce {
  api_key: string;
} // shown once on create/rotate (prefix cdp_)

export interface AdminToken {
  id: string;
  name: string;
  role: AdminRole;
  tenant_id: string | null;
  status: 'active';
  created_at?: string;
}
export interface AdminTokenOnce {
  api_token: string;
  role: AdminRole;
} // plaintext once (prefix cdpadm_)

export interface Destination {
  id: string;
  tenant_id: string;
  type: DestinationType;
  name: string;
  status: 'active' | 'disabled' | string;
  config_json: Record<string, unknown>;
  channel?: ConsentChannel;
  purpose?: ConsentPurpose; /* secret_ref never returned */
}
export interface WebhookConfig {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  timeout_ms?: number;
  max_retries?: number;
}
export interface KafkaConfig {
  topic: string;
}
export interface Subscription {
  id: string;
  destination_id: string;
  trigger_type: 'segment_membership';
  segment_id: string;
  status: string;
}
export interface DeliveryLog {
  id?: string;
  status: ActivationTaskStatus | string;
  http_status?: number;
  response_body_hash?: string;
  error_message?: string;
  attempt_count: number;
  sent_at?: string;
}
```

| Field                        | Type                             | Notes                                                                                            |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Source.allowed_event_types` | `string[]?`                      | Restricts which event types the source may send.                                                 |
| `SourceKeyOnce.api_key`      | `string`                         | **One-time** plaintext, prefix `cdp_`; show in `OneTimeSecretDialog`, cannot be retrieved again. |
| `AdminToken.tenant_id`       | `string \| null`                 | `null` = cross-tenant (SUPER_ADMIN).                                                             |
| `AdminTokenOnce.api_token`   | `string`                         | **One-time** plaintext, prefix `cdpadm_`; copy-once modal.                                       |
| `Destination.type`           | `DestinationType`                | Only `webhook`/`kafka` implemented.                                                              |
| `Destination.config_json`    | `Record<string, unknown>`        | Holds `WebhookConfig` or `KafkaConfig`. Secret (`secret_ref`) **never returned**.                |
| `WebhookConfig`              | —                                | `config` + top-level `secret` (HMAC) at create time only.                                        |
| `KafkaConfig.topic`          | `string`                         | Kafka destination target topic.                                                                  |
| `Subscription.trigger_type`  | `'segment_membership'`           | Only trigger type today.                                                                         |
| `DeliveryLog.status`         | `ActivationTaskStatus \| string` | Delivery attempt outcome; drives `StatusChip`.                                                   |
| `DeliveryLog.attempt_count`  | `number`                         | Retry backoff 10s→15min, max 5 attempts.                                                         |

Activation notes (for UI copy, not fields): retryable = HTTP 408/429/5xx, permanent = 400/401/403/404; circuit breaker exposed via metric `activation_circuit_open_total`. Webhook delivery headers: `Idempotency-Key, X-CDP-Tenant-Id, X-CDP-Event-Id, X-CDP-Destination-Id, X-CDP-Signature: sha256=<hmac(secret,body)>`. Webhook body shape: `{type:"segment_membership_changed", tenant_id, segment_id, customer:{id, traits, computed_attributes}, change, occurred_at}`. See [Activation & Destinations](screens/07-activation-destinations.md).

---

## Consent

```ts
export interface ConsentRecord {
  channel: ConsentChannel;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  source?: string;
  updated_at?: string;
}
```

| Field                   | Type             | Notes                                                                               |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `ConsentRecord.channel` | `ConsentChannel` | `email`/`sms`/`push`/`ads`/`webhook`.                                               |
| `ConsentRecord.purpose` | `ConsentPurpose` | `marketing`/`analytics`/`personalization`/`transactional`.                          |
| `ConsentRecord.status`  | `ConsentStatus`  | `granted`/`denied`/`unknown`; absence = `unknown`. `denied` → activation `skipped`. |
| `ConsentRecord.source`  | `string?`        | Provenance of the consent record.                                                   |

Consent is per `canonicalUserID`: `PUT .../profiles/{canonicalUserID}/consent` (`consent:write`), `GET .../profiles/{canonicalUserID}/consent` (`profile:read`, returns `{consent:[...]}`). See [Customer 360](screens/05-customer-360.md).

---

## DLQ

```ts
export interface DlqEvent {
  id: string;
  tenant_id: string;
  event_id: string;
  source_id?: string;
  component: string;
  error_code: string;
  error_message: string;
  original_payload: Record<string, unknown>;
  retry_count: number;
  status: DlqStatus;
  failed_at: string;
}
```

| Field                       | Type                      | Notes                                         |
| --------------------------- | ------------------------- | --------------------------------------------- |
| `DlqEvent.component`        | `string`                  | Pipeline stage that failed.                   |
| `DlqEvent.error_code`       | `string`                  | Failure code from the failing component.      |
| `DlqEvent.original_payload` | `Record<string, unknown>` | Original event payload; shown in JSON viewer. |
| `DlqEvent.retry_count`      | `number`                  | Prior retry attempts.                         |
| `DlqEvent.status`           | `DlqStatus`               | `open`/`retried`/`discarded`; list filter.    |
| `DlqEvent.failed_at`        | `string`                  | Sort key (`failed_at DESC`).                  |

DLQ list is filter-only (no keyset paging), default limit 100 / max 500. `retry` needs `dlq:retry`; `discard` also needs `dlq:retry` (shared permission). No export / mark-resolved (backend gap). See [DLQ admin](screens/08-dlq-admin.md).

---

## Audit

```ts
export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor_id?: string;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  before_json?: unknown;
  after_json?: unknown;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}
```

| Field                                      | Type       | Notes                                                                              |
| ------------------------------------------ | ---------- | ---------------------------------------------------------------------------------- |
| `AuditLogEntry.actor_id`                   | `string?`  | **Not populated** — tokens carry no identity; attribution is coarse (backend gap). |
| `AuditLogEntry.action`                     | `string`   | e.g. create/update/delete action name.                                             |
| `AuditLogEntry.before_json` / `after_json` | `unknown?` | Diff of the change; rendered as before/after JSON.                                 |

**The audit log is WRITE-ONLY — there is no read/query endpoint.** The `audit:read` permission exists but no route implements it. The audit screen is **Phase 2 / blocked on a new backend `GET .../audit` endpoint** — spec the table but show a "requires backend endpoint" banner. See [Audit log](screens/10-audit-log.md) and [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## Errors / Pagination

```ts
export interface ApiError {
  error: { code: string; message: string };
}
export interface KeysetPage<T> {
  events: T[];
  next_cursor: string;
} // events list shape
```

| Type            | Shape                          | Notes                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ApiError`      | `{ error: { code, message } }` | Envelope for **all** errors. Codes → HTTP: `bad_request`(400), `unauthorized`(401), `forbidden`(403), `not_found`(404), `conflict`(409), `payload_too_large`(413), `rate_limited`(429, `Retry-After` header), `internal_error`(500), `not_ready`(503). |
| `KeysetPage<T>` | `{ events, next_cursor }`      | Response shape of the events list only. Other list endpoints return full arrays (client-side paging).                                                                                                                                                  |

Pagination conventions: **keyset/cursor** applies ONLY to `GET .../events`. Filter-only (full array, no paging): profiles, dlq, segment members, deliveries, consent, replay. See [API integration](04-api-integration.md).

---

## Entity relationship summary

```
Tenant ─1─N─ Source
Tenant ─1─N─ Segment
Tenant ─1─N─ Destination
Tenant ─1─N─ CustomerProfile

Events ─→ IdentityCluster (canonical_user_id) ─→ CustomerProfile
CustomerProfile ─1─N─ ConsentRecord
CustomerProfile ─1─N─ SegmentMembership
Segment ─1─N─ SegmentVersion
Segment ─1─N─ SegmentMembership
Destination ─1─N─ Subscription ─→ Segment
SegmentMembership change ─→ Activation task ─→ DeliveryLog
```

- A **Tenant** owns Sources, Segments, Destinations, and CustomerProfiles.
- Ingested **Events** are resolved into an **IdentityCluster** (keyed by `canonical_user_id`), which backs one **CustomerProfile**.
- A **CustomerProfile** has many **ConsentRecords** and many **SegmentMemberships**.
- A **Segment** has many **SegmentVersions** (each edit = new version) and many **SegmentMemberships**.
- A **Destination** has many **Subscriptions**, each pointing at one **Segment**.
- A **SegmentMembership change** produces an **Activation task**, which produces a **DeliveryLog** entry.

---

## Open maps: known keys

`traits_json` and `computed_attributes_json` on `CustomerProfile` are open `Record<string, unknown>` maps. Screens should render all keys present but can special-case these known keys:

| Map                                               | Known keys                                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `traits_json` (PII-masked unless `pii:read`)      | `email`, `phone`, `name`, `country`                                                                                          |
| `computed_attributes_json` (computed server-side) | `total_events`, `total_orders`, `last_event_name`, `last_source_id`, `last_page_url`, `last_product_viewed`, `last_order_at` |

```tsx
// Illustrative: masking-aware trait rendering (values arrive already masked from the server).
function TraitValue({ value, hasPii }: { value: unknown; hasPii: boolean }) {
  const text = String(value ?? '');
  const looksMasked = /\*/.test(text); // e.g. "u***@x.com", "+8490****567", "N***"
  return (
    <span>
      {text}
      {looksMasked && !hasPii && (
        <LockIcon titleAccess="unmask requires pii:read" fontSize="inherit" />
      )}
    </span>
  );
}
```

Related: [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md) · [API integration](04-api-integration.md) · [Architecture & conventions](03-architecture.md) · [Backend gaps & caveats](10-backend-gaps-and-caveats.md).
