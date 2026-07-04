# Activation & Destinations

> Create destinations, subscribe them to segments, and monitor deliveries — push segment membership changes to external systems.

## Purpose

Activation is the last stage of the async CDP pipeline: when a customer **enters or exits a segment**,
osscdp pushes that membership change to external **destinations** (webhooks / Kafka topics). This
screen lets operators create destinations, subscribe them to segments, and monitor the resulting
delivery attempts (with retry/backoff, circuit-breaker, and consent-based skipping).

Remember the pipeline is **asynchronous**: a membership change is produced seconds after ingest and
segmentation. Deliveries do not appear instantly — surface processing-lag/refresh affordances (see
[API integration](../04-api-integration.md)).

## Route(s)

| Route                                      | Screen                                                |
| ------------------------------------------ | ----------------------------------------------------- |
| `/t/:tenantId/destinations`                | Destinations list + create                            |
| `/t/:tenantId/destinations/:destinationId` | Destination detail: config, subscriptions, deliveries |

## Required permission(s)

| Action                                            | Permission          |
| ------------------------------------------------- | ------------------- |
| View destinations / detail                        | `destination:read`  |
| Create destination                                | `destination:write` |
| Edit / disable destination                        | `destination:write` |
| Add subscription                                  | `destination:write` |
| Remove (soft-disable) subscription                | `destination:write` |
| View delivery log                                 | `activation:read`   |
| Pick a segment to subscribe (segment list/detail) | `segment:read`      |

Roles holding `destination:write`: `SUPER_ADMIN`, `TENANT_ADMIN`, `MARKETER`. `activation:read` and
`destination:read` are in the read set (all roles). Gate write actions with `<RequirePerm perm="destination:write">`.
See [RBAC](../05-auth-rbac-tenancy.md).

## API calls used (exact paths)

All paths are prefixed `/admin/v1/tenants/{tenantID}` (built via `tenantPath(tenantId, suffix)`), sent
with `Authorization: Bearer <adminToken>`.

| Method   | Path                                                              | Permission          | Notes                                                                                        |
| -------- | ----------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| `POST`   | `.../destinations`                                                | `destination:write` | Body `{type, name, secret?, channel?, purpose?, config}` → `201`. **secret never returned.** |
| `GET`    | `.../destinations/{destinationID}`                                | `destination:read`  | Fetch one destination.                                                                       |
| `PUT`    | `.../destinations/{destinationID}`                                | `destination:write` | Edit; e.g. disable (`status`).                                                               |
| `POST`   | `.../destinations/{destinationID}/subscriptions`                  | `destination:write` | Body `{trigger_type:"segment_membership", segment_id}`.                                      |
| `DELETE` | `.../destinations/{destinationID}/subscriptions/{subscriptionID}` | `destination:write` | Soft-disable, **idempotent**.                                                                |
| `GET`    | `.../destinations/{destinationID}/deliveries`                     | `activation:read`   | Delivery attempts (filter-only, no paging → full array).                                     |
| `GET`    | `.../segments/{segmentID}/destinations`                           | `destination:read`  | Destinations wired to a given segment (used from Segments screen).                           |

> **TBD — backend gap:** there is **no confirmed "list all destinations" `GET .../destinations`
> endpoint** in the spec extract. The list view needs it. Until confirmed, see
> [Backend gaps & caveats](../10-backend-gaps-and-caveats.md). Fallback: track created destination
> IDs client-side, or reach destinations only via a segment's `.../segments/{id}/destinations`. Do not
> invent the list endpoint — flag it.

## Layout & components

### Destinations list (`/t/:tenantId/destinations`)

- **PageHeader**: title "Destinations", primary action **New destination** (gated `destination:write`).
- **MUI X Data Grid** (client mode — filter-only, no server paging). Columns: `name`, `type`
  (StatusChip), `status` (`active`/`disabled` StatusChip), `channel`, `purpose`, id (copyable),
  row actions → View, Disable.
- If the list endpoint is unavailable (see TBD above), render an **EmptyState/ErrorState** explaining
  destinations are reachable via detail links / segments.

### Create destination form (dialog or `/destinations` inline panel)

- **Type selector**: `webhook` and `kafka` **ENABLED**; `push`, `email`, `crm`, `ads`, `warehouse`
  rendered **DISABLED** with a "coming soon" label (declared-but-deferred types).
- Common fields: `name` (required), `channel?` (ConsentChannel), `purpose?` (ConsentPurpose) — the
  channel/purpose pair drives **consent routing** (activation skips customers who denied that
  channel×purpose → delivery status `skipped`).
- **Webhook config** (`type: "webhook"`):
  | Field         | Location                                  | Default | Required          |
  | ------------- | ----------------------------------------- | ------- | ----------------- |
  | `url`         | `config.url`                              | —       | ✅                |
  | `method`      | `config.method`                           | `POST`  | — (`POST`\|`PUT`) |
  | `headers`     | `config.headers` (key/value editor `{}`)  | `{}`    | —                 |
  | `timeout_ms`  | `config.timeout_ms`                       | `5000`  | —                 |
  | `max_retries` | `config.max_retries`                      | `5`     | —                 |
  | `secret`      | **top-level** `secret` (HMAC signing key) | —       | —                 |
- **Kafka config** (`type: "kafka"`):

  | Field    | Location           | Required     |
  | -------- | ------------------ | ------------ |
  | `topic`  | `config.topic`     | ✅           |
  | `secret` | top-level `secret` | — (optional) |

- **Secret handling (one-time, write-only):** the top-level `secret` is used for HMAC signing, stored
  **encrypted at rest, and NEVER returned** by any GET. On submit:
  - If the API surfaces the secret back once → show **OneTimeSecretDialog** (copy-once, "you cannot see
    this again" warning). See [components / OneTimeSecretDialog](../06-design-system.md).
  - Since the create response does **not** return the secret, the form should instead **warn inline**
    that the secret is write-only: the operator must keep whatever they typed; it cannot be retrieved
    and can only be replaced by editing the destination.

### Destination detail (`/t/:tenantId/destinations/:destinationId`)

Three regions (tabs or stacked panels):

1. **Config** — read-only view of `type`, `name`, `status`, `channel`, `purpose`, `config_json`
   (JsonViewer). Actions: **Edit**, **Disable** (`PUT`, ConfirmDialog).
2. **Subscriptions** — list of segment subscriptions; **Add subscription** (pick a segment); each row
   has **Unsubscribe** (soft-disable).
3. **Deliveries** — delivery monitoring table (below).

## Subscriptions

- **Add subscription**: pick a **segment** (needs the segment list — **TBD — backend gap**, no
  confirmed `GET .../segments`; see [Backend gaps](../10-backend-gaps-and-caveats.md)). Body:
  `{trigger_type: "segment_membership", segment_id}`.
- `trigger_type` is fixed to `"segment_membership"` today. **Event-triggered activation is deferred** —
  render other trigger types disabled / omit them.
- **Unsubscribe** calls `DELETE .../subscriptions/{subscriptionID}` which **soft-disables** and is
  **idempotent** (safe to retry; no hard error if already removed). Use ConfirmDialog for clarity.

```tsx
// Subscribe a destination to a segment
await api.post(tenantPath(tenantId, `/destinations/${destId}/subscriptions`), {
  trigger_type: 'segment_membership',
  segment_id: segmentId,
});
// Unsubscribe (idempotent soft-disable)
await api.delete(tenantPath(tenantId, `/destinations/${destId}/subscriptions/${subId}`));
```

## Delivery monitoring

`GET .../destinations/{destinationID}/deliveries` returns the full array of delivery attempts (no
paging params → client-mode Data Grid).

### Deliveries table columns

| Column   | Field           | Render                        |
| -------- | --------------- | ----------------------------- |
| Status   | `status`        | StatusChip (see status table) |
| HTTP     | `http_status`   | numeric badge (webhook only)  |
| Attempts | `attempt_count` | number                        |
| Error    | `error_message` | truncated + tooltip           |
| Sent at  | `sent_at`       | relative time                 |

### Delivery / task statuses (`ActivationTaskStatus`)

| Status             | Meaning                                                   | Chip color    |
| ------------------ | --------------------------------------------------------- | ------------- |
| `pending`          | queued, not yet sent                                      | default       |
| `sending`          | in flight                                                 | info          |
| `succeeded`        | delivered OK                                              | success       |
| `failed_retryable` | transient failure, will retry                             | warning       |
| `failed_permanent` | non-retryable failure                                     | error         |
| `dlq`              | exhausted retries → dead-letter queue                     | error         |
| `skipped`          | **consent_denied** — customer denied this channel×purpose | default/muted |

### Retry / backoff & permanence rules (reference, backend behavior)

- **Retryable** HTTP: `408`, `429`, `5xx` → `failed_retryable`, re-attempted.
- **Permanent** HTTP: `400`, `401`, `403`, `404` → `failed_permanent`.
- **Backoff:** `10s → 15min`, **max 5 retries**; on exhaustion the task lands in `dlq`.
- **Circuit breaker:** exposed as Prometheus metric `activation_circuit_open_total`. Show a
  circuit-breaker indicator on the destination when this is elevated.
  > **TBD — metrics gap:** `/metrics` is Prometheus **text, not JSON**; the console cannot parse it
  > per-destination today. Link/embed Grafana or show the indicator as "unavailable". See
  > [Backend gaps](../10-backend-gaps-and-caveats.md).

### Enable / disable toggle

Destination-level **Enable/Disable** via `PUT .../destinations/{id}` (set `status`). Disabling stops
new deliveries. Confirm with ConfirmDialog (it affects live activation).

## Webhook delivery payload & signing (receiver reference)

Provide this as **documentation for the receiving system** (the console does not receive it). When a
membership changes, osscdp POSTs this body to the webhook `url`:

```json
{
  "type": "segment_membership_changed",
  "tenant_id": "…",
  "segment_id": "…",
  "customer": { "id": "…", "traits": {}, "computed_attributes": {} },
  "change": "…",
  "occurred_at": "…"
}
```

**Delivery headers** sent on every webhook call (show verbatim in the destination's help panel):

| Header                 | Value                                        |
| ---------------------- | -------------------------------------------- |
| `X-CDP-Signature`      | `sha256=<hmac(secret, body)>`                |
| `Idempotency-Key`      | dedupe key (receiver should treat as unique) |
| `X-CDP-Tenant-Id`      | tenant UUID                                  |
| `X-CDP-Event-Id`       | source event id                              |
| `X-CDP-Destination-Id` | destination id                               |

Receivers verify `X-CDP-Signature` as HMAC-SHA256 of the raw body using the shared `secret`, and use
`Idempotency-Key` to deduplicate.

## Data & TS types

From [Data model & types](../07-data-model-and-types.md) — use these exact names:

```ts
export type DestinationType = 'webhook' | 'kafka' | 'push' | 'email' | 'crm' | 'ads' | 'warehouse';
export type ActivationTaskStatus =
  'pending' | 'sending' | 'succeeded' | 'failed_retryable' | 'failed_permanent' | 'dlq' | 'skipped';

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

> Only `webhook` and `kafka` are implemented types; the other `DestinationType` values are
> declared-but-deferred and must be shown disabled.

### Create-destination request bodies

```ts
// Webhook
{ type: 'webhook', name, channel?, purpose?, secret?,
  config: { url, method: 'POST', headers: {}, timeout_ms: 5000, max_retries: 5 } }
// Kafka
{ type: 'kafka', name, channel?, purpose?, secret?, config: { topic } }
```

## States (loading / empty / error)

- **Loading:** skeleton rows in the Data Grid; spinner in detail panels.
- **Empty:** no destinations → EmptyState "No destinations yet" + New destination CTA. No
  subscriptions → EmptyState with Add subscription. No deliveries → "No deliveries yet — activation is
  async; changes appear after a customer enters/exits a subscribed segment. Refresh to check."
- **Error:** ErrorState with retry; map the error envelope `{error:{code,message}}`. `403` → toast
  (missing `destination:write`/`activation:read` or tenant-scope). `429` → respect `Retry-After`.
  `400` (`bad_request`) on create → map to form fields / form-level alert.
- **List-endpoint TBD:** if `GET .../destinations` is not available, show an informational state, not a
  hard error (see gap above).

## Actions & confirmations

| Action              | Trigger                         | Confirmation                                |
| ------------------- | ------------------------------- | ------------------------------------------- |
| Create destination  | New destination form submit     | inline warning that `secret` is write-only  |
| Disable destination | Disable button                  | **ConfirmDialog** — stops live deliveries   |
| Add subscription    | Add subscription (pick segment) | none (reversible)                           |
| Unsubscribe         | Unsubscribe button              | **ConfirmDialog** (idempotent soft-disable) |
| Refresh deliveries  | manual refresh button           | none                                        |

- Mutations invalidate the relevant query keys (destination detail, subscriptions, deliveries).
- After subscribing, show the async-pipeline note: deliveries appear once membership changes are
  processed — "refresh to see updates".

## RBAC & PII notes

- Hide/disable **New destination**, **Edit**, **Disable**, **Add/Unsubscribe** for roles lacking
  `destination:write` (i.e. `ANALYST`, `OPERATOR`, `VIEWER`). Disabled buttons carry tooltip
  "requires destination:write".
- Deliveries tab requires `activation:read` (in the read set → all roles).
- **PII:** the webhook payload includes `customer.traits` and `computed_attributes`; the console does
  not render those (it only shows delivery status/metadata). Any masked values elsewhere are rendered
  as received — never attempt client-side unmasking (`pii:read` gate is server-side).
- UI gating is UX only; the server also enforces `403`.

## Acceptance criteria (checklist)

- [ ] Destinations list renders with type/status/channel/purpose columns; New destination gated by `destination:write`.
- [ ] Create form offers a type selector with `webhook` + `kafka` enabled and `push/email/crm/ads/warehouse` disabled ("coming soon").
- [ ] Webhook form captures `config.url` (required), `method` (default `POST`), `headers` key/value editor, `timeout_ms` (5000), `max_retries` (5), and top-level `secret`.
- [ ] Kafka form captures `config.topic` (required) and optional top-level `secret`.
- [ ] Secret is treated as write-only: OneTimeSecretDialog shown if surfaced, otherwise an inline "cannot be retrieved" warning.
- [ ] Add subscription posts `{trigger_type:"segment_membership", segment_id}`; other trigger types are not offered (deferred).
- [ ] Unsubscribe calls `DELETE .../subscriptions/{subId}` and tolerates repeat calls (idempotent).
- [ ] Deliveries table shows `status`, `http_status`, `attempt_count`, `error_message`, `sent_at` with correct StatusChip mapping incl. `skipped` = consent_denied.
- [ ] Retry/backoff (10s→15min, max 5) and retryable(408/429/5xx) vs permanent(400/401/403/404) documented in the UI help.
- [ ] Circuit-breaker indicator present (or shows "unavailable" per metrics gap).
- [ ] Destination Enable/Disable via `PUT .../destinations/{id}` behind ConfirmDialog.
- [ ] Webhook payload shape and signing headers (`X-CDP-Signature`, `Idempotency-Key`, `X-CDP-Tenant-Id`, `X-CDP-Event-Id`, `X-CDP-Destination-Id`) shown as receiver reference.
- [ ] Missing "list all destinations" endpoint flagged as TBD linking [Backend gaps](../10-backend-gaps-and-caveats.md); no invented endpoint.
- [ ] Loading/empty/error states present on list, subscriptions, and deliveries.

## See also

- [API integration](../04-api-integration.md)
- [Auth, RBAC & tenancy](../05-auth-rbac-tenancy.md)
- [Data model & types](../07-data-model-and-types.md)
- [Segments & rule builder](06-segments-and-rule-builder.md)
- [Backend gaps & caveats](../10-backend-gaps-and-caveats.md)
