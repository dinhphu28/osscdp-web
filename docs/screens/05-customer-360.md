# Customer 360 (incl. Consent, GDPR)

Single-customer unified view: search a person, inspect profile detail tabs, edit consent, and run GDPR export/delete — the star screen of the console.

## Purpose

Give an operator one place to answer "who is this customer, what do we know, what have they consented to, and can I export/erase them?" It unifies the resolved profile, identity graph, recent events, segment memberships, and consent grid, plus the two GDPR governance actions (export bundle, delete/anonymize). PII masking applies throughout unless the token holds `pii:read`.

> The CDP pipeline is **asynchronous**. A newly ingested/identified customer may not appear (or may be stale) for a few seconds. Every data view here must show loading/empty states and offer a manual refresh; never promise instant results. See [Async pipeline UX](../03-architecture.md).

## Route(s)

| Route                                    | Screen                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `/t/:tenantId/profiles`                  | Search (by email/phone) + result → redirect to detail                    |
| `/t/:tenantId/profiles/:canonicalUserId` | Profile detail with tabs (Overview, Identity, Events, Segments, Consent) |

Detail tabs are sub-views of the same route (tab state in a query param or nested segment; no separate top-level routes required).

## Required permission(s)

| Action                                      | Permission                                                 |
| ------------------------------------------- | ---------------------------------------------------------- |
| Search profiles / view detail / identifiers | `profile:read`                                             |
| Read consent grid                           | `profile:read`                                             |
| Edit consent cell                           | `consent:write`                                            |
| GDPR export bundle                          | `profile:read`                                             |
| GDPR delete / anonymize                     | `profile:delete`                                           |
| Unmask PII (email/phone/name)               | `pii:read` (server-side; UI only renders what it receives) |

`profile:delete` and `pii:read` are ONLY held by `SUPER_ADMIN` / `TENANT_ADMIN`. Compute the current role's permissions from the role→permission table and gate accordingly — see [RBAC](../05-auth-rbac-tenancy.md). UI gating is UX only; the server also enforces `403`.

## API calls used (exact paths)

All paths are prefixed with the tenant path helper `tenantPath(tenantId, suffix)` → `/admin/v1/tenants/${tenantId}${suffix}`. Every request carries `Authorization: Bearer <adminToken>`. See [API integration](../04-api-integration.md).

| Purpose               | Method + path                                    | Perm             | Notes                                                                                  |
| --------------------- | ------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------- |
| Search by email/phone | `GET .../profiles?email=…` **or** `?phone=…`     | `profile:read`   | **400 `bad_request` if neither** supplied. Filter-only (no paging).                    |
| Get profile by id     | `GET .../profiles/{canonicalUserID}`             | `profile:read`   | Returns `CustomerProfile`.                                                             |
| Identifier inventory  | `GET .../profiles/{canonicalUserID}/identifiers` | `profile:read`   | `{canonical_user_id, total, by_namespace, values}`; `values` masked unless `pii:read`. |
| Read consent          | `GET .../profiles/{canonicalUserID}/consent`     | `profile:read`   | `{consent:[{channel,purpose,status,source,updated_at}]}`.                              |
| Write consent         | `PUT .../profiles/{canonicalUserID}/consent`     | `consent:write`  | body `{channel, purpose, status, source?}` → `{status:"ok"}`.                          |
| GDPR export           | `GET .../profiles/{canonicalUserID}/export`      | `profile:read`   | Bundle download (JSON).                                                                |
| GDPR delete/anonymize | `DELETE .../profiles/{canonicalUserID}`          | `profile:delete` | `{deleted:{<table>:count}}`; audited; irreversible.                                    |

### Endpoints that are TBD (backend gaps)

The following per-profile sub-resources are referenced by domain but **not confirmed in the OpenAPI spec extract**. Build the UI against them but treat them as unconfirmed and degrade gracefully (show a "TBD — backend gap" note if they 404). See [Backend gaps and caveats](../10-backend-gaps-and-caveats.md).

| Tab need                | Likely endpoint                                                                          | Status                     |
| ----------------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| Identity cluster detail | `GET .../profiles/{canonicalUserID}/identity-cluster` (shape)                            | **TBD — confirm endpoint** |
| Identity merge history  | (merge timeline route)                                                                   | **TBD — confirm endpoint** |
| Per-profile events      | per-profile events route, else fall back to Events explorer filtered by `identifier_key` | **TBD — confirm endpoint** |
| Per-profile segments    | `GET .../profiles/{canonicalUserID}/segments` (memberships)                              | **TBD — confirm endpoint** |

For the **Events** tab, the confirmed fallback is the Events explorer keyset endpoint filtered by an identifier belonging to this profile: `GET .../events?identifier_key=<namespace>:<value>` (`event:read`). See [Events explorer](04-events-explorer.md).

## Layout & components

`PageHeader` (title "Customer 360", a search box as the primary control). Below it either the **search panel** (no profile selected) or the **detail panel** (a profile is loaded), using a `<Tabs>` bar.

### Search

Two entry modes:

1. **By email or phone** → `GET .../profiles?email=|phone=`. A single input with a mode toggle (Email / Phone). Client-side: disable submit if empty; a request with neither param must not be sent (the API returns `400`). On success, if exactly one profile is returned, navigate to `/t/:tenantId/profiles/:canonicalUserId`; if multiple, render a small results Data Grid (client-mode) to pick one; if none, `EmptyState` "No matching customer".
2. **By canonical_user_id** → paste/scan a `canonical_user_id`, navigate directly to `GET .../profiles/{canonicalUserID}`.

```tsx
// Guard: never fire the request without a filter (API returns 400 bad_request)
const q = mode === 'email' ? { email: value } : { phone: value };
const canSubmit = value.trim().length > 0;
// onSubmit -> GET .../profiles with exactly one of email|phone
```

### Detail header

Rendered above the tabs on every tab. Fields from `CustomerProfile`:

| Field                                           | Source                                                    |
| ----------------------------------------------- | --------------------------------------------------------- |
| `canonical_user_id` (copyable via `CopyButton`) | `canonical_user_id`                                       |
| `identity_cluster_id`                           | `identity_cluster_id`                                     |
| First / last seen                               | `first_seen_at`, `last_seen_at` (relative-time formatter) |
| Version                                         | `version`                                                 |
| Status                                          | `status?` via `StatusChip`                                |

### Tabs

#### Overview

Two cards.

- **Traits** from `traits_json`: `email`, `phone`, `name`, `country`. These are **PII-masked** (`u***@x.com`, `+8490****567`, `N***`) unless the token holds `pii:read`. Render exactly as received; if a value looks masked and the user lacks `pii:read`, show a lock icon with tooltip "unmask requires pii:read". Never attempt client-side unmasking.
- **Computed attributes** from `computed_attributes_json`: `total_events`, `total_orders`, `last_event_name`, `last_source_id`, `last_page_url`, `last_product_viewed`, `last_order_at`. Render as a key/value list; `last_order_at` via relative-time.

#### Identity

- **Identifier inventory** from `GET .../identifiers`: show `total`, a per-namespace breakdown (`by_namespace`), and the `values` list (masked unless `pii:read`). Each `IdentityNode` carries `namespace` + `value_hash` (and optional `value_encrypted`).
- **Identity cluster** (`IdentityCluster`: `canonical_user_id`, `status`, `nodes?`) and **merge history timeline** (`MergeHistoryEntry[]`): each entry shows `from_cluster_id` → `to_cluster_id`, `reason`, `event_id?`, `created_at`. Render as a vertical timeline.
- **The exact cluster and merge-history endpoints are TBD — backend gap.** Mark the section "TBD — confirm endpoint" and link [Backend gaps](../10-backend-gaps-and-caveats.md); render an `ErrorState`/placeholder if unavailable.

#### Events

Recent events for this customer. Preferred: a per-profile events route (**TBD — confirm endpoint**). Confirmed fallback: cross-reference the [Events explorer](04-events-explorer.md) via `GET .../events?identifier_key=<namespace>:<value>` using an identifier from the Identity tab. Render with the keyset Data Grid (server mode, cursor), a `JsonViewer` for `payload_json`, and a **replay** row action:

- Replay one: `POST .../events/{eventID}/replay` (`event:replay`).
- After replay, show the async "processing — data may take a few seconds; refresh to see updates" banner + manual refresh.

Replay actions require `event:replay` (held by `OPERATOR`, plus SUPER_ADMIN/TENANT_ADMIN); gate with `<RequirePerm perm="event:replay">`.

#### Segments

Memberships for this customer: which segments the profile is in, `entered_at` / `exited_at`, `last_evaluated_at`, and rule `version`. Data shape is `SegmentMembership`. **Per-profile segments endpoint is TBD — backend gap** (`GET .../profiles/{canonicalUserID}/segments` likely). Cross-link [Segments](06-segments-and-rule-builder.md) for the segment definitions. Render a client-mode Data Grid; `EmptyState` "Not a member of any segment yet" (remember async lag).

#### Consent

A grid of **channel × purpose → status**.

- Rows: channels `email`, `sms`, `push`, `ads`, `webhook`.
- Columns: purposes `marketing`, `analytics`, `personalization`, `transactional`.
- Cell value: `ConsentStatus` = `granted` | `denied` | `unknown`. **Absence of a record = `unknown`.**
- Read via `GET .../consent` (`profile:read`); each returned `ConsentRecord` has `channel`, `purpose`, `status`, `source?`, `updated_at?`. Show `source`/`updated_at` in a cell tooltip.
- Edit a cell via `PUT .../consent` (`consent:write`) with body `{channel, purpose, status, source?}`; set `source` to something identifying the console action (e.g. `"admin_console"`). On success (`{status:"ok"}`) invalidate the consent query.
- Gate editing behind `<RequirePerm perm="consent:write">`; render `unknown`/read-only cells as static chips when the user lacks it.
- **Note:** activation **skips `denied`** consent (the activation task is recorded as `skipped`, not delivered). Surface a hint near the grid so operators understand why a customer may not receive activations. See [Activation / Destinations](07-activation-destinations.md).

```tsx
// StatusChip color mapping for a consent cell
const consentColor: Record<ConsentStatus, 'success' | 'error' | 'default'> = {
  granted: 'success',
  denied: 'error',
  unknown: 'default',
};
```

## GDPR actions

Both live in a "Governance" action group in the detail header, gated by permission.

### Export

`GET .../profiles/{canonicalUserID}/export` (`profile:read`). Downloads a JSON bundle:

```jsonc
{
  "profile": {/* CustomerProfile */},
  "identity_nodes": [{ "namespace": "…", "value_hash": "…" }],
  "segment_memberships": [{ "segment_id": "…", "status": "…" }],
  "consent": [/* ConsentRecord[] */],
}
```

UI: a "Export data" button triggers the request and offers the response as a downloadable `.json` file (filename e.g. `customer-<canonical_user_id>.json`). No confirmation needed (read-only). Values inside the bundle honor server-side PII masking based on the token.

### Delete / anonymize

`DELETE .../profiles/{canonicalUserID}` (`profile:delete`). **Irreversible and audited.**

Flow:

1. Button gated by `<RequirePerm perm="profile:delete">` (SUPER_ADMIN / TENANT_ADMIN only).
2. Open `ConfirmDialog` with an **irreversible warning**; require the operator to **type the exact `canonical_user_id`** to enable the confirm button (typed value must match the profile's id).
3. On confirm, call `DELETE`; response `{deleted:{<table>:count}}`. Show a success toast summarizing the per-table counts, then navigate back to search (the profile no longer exists).
4. Invalidate all query keys for this `canonicalUserId`.

```tsx
// ConfirmDialog gate for GDPR delete
const confirmable = typed === profile.canonical_user_id;
// on confirm -> DELETE .../profiles/{canonicalUserID}
// result: { deleted: { customer_profiles: 1, identity_nodes: 3, ... } }
```

## Data & TS types

Reference the canonical hand-written types (do not redefine): `CustomerProfile`, `IdentityNode`, `IdentityCluster`, `MergeHistoryEntry`, `ConsentRecord`, `SegmentMembership`, `RawEvent`, `ApiError`. See [Data model and types](../07-data-model-and-types.md).

Key shapes for this screen (verbatim from the brief):

```ts
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
export interface ConsentRecord {
  channel: ConsentChannel;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  source?: string;
  updated_at?: string;
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

export type ConsentChannel = 'email' | 'sms' | 'push' | 'ads' | 'webhook';
export type ConsentPurpose = 'marketing' | 'analytics' | 'personalization' | 'transactional';
export type ConsentStatus = 'granted' | 'denied' | 'unknown';
```

Query-key factory (per [API integration](../04-api-integration.md)):

```ts
qk.profiles(tenantId).search({ email }); // ['t', tenantId, 'profiles', 'search', {email}]
qk.profiles(tenantId).detail(cuid); // ['t', tenantId, 'profiles', cuid]
qk.profiles(tenantId).identifiers(cuid);
qk.profiles(tenantId).consent(cuid);
```

## States (loading / empty / error)

| View                     | Loading                            | Empty                                                           | Error                                                                     |
| ------------------------ | ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Search results           | skeleton / spinner in results area | `EmptyState` "No matching customer"                             | `400` → inline "enter an email or phone"; other → `ErrorState` with retry |
| Profile detail           | skeleton header + tab placeholders | `404` → "Profile not found (may still be processing — refresh)" | `ErrorState` with retry                                                   |
| Identifiers              | skeleton list                      | "No identifiers"                                                | `ErrorState`                                                              |
| Identity cluster / merge | placeholder                        | "No merge history"                                              | TBD-endpoint → "TBD — backend gap" note                                   |
| Events tab               | keyset grid loading                | "No events yet (async — refresh)"                               | `ErrorState`                                                              |
| Segments tab             | grid loading                       | "Not a member of any segment yet"                               | TBD-endpoint → "TBD — backend gap" note                                   |
| Consent grid             | grid skeleton                      | all cells `unknown`                                             | `ErrorState`                                                              |

`401` anywhere → clear token + redirect to `/connect` (handled centrally by the Axios error interceptor). `403` → toast (missing permission or tenant-scope violation). `429` → respect `Retry-After`.

## Actions & confirmations

| Action             | Trigger                  | Confirmation                                                                                     | Perm             |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------ | ---------------- |
| Search             | submit box               | none                                                                                             | `profile:read`   |
| Edit consent cell  | click cell → status menu | none (immediate `PUT`)                                                                           | `consent:write`  |
| Replay event       | Events tab row action    | none; show async banner after                                                                    | `event:replay`   |
| Export bundle      | header button            | none (read-only)                                                                                 | `profile:read`   |
| Delete / anonymize | header button            | `ConfirmDialog` requiring the operator to **type the `canonical_user_id`**; irreversible warning | `profile:delete` |

## RBAC & PII notes

- Hide/disable any action the current role can't perform (compute from the role→permission table). Disabled write buttons carry a tooltip "requires `<perm>`" via `<RequirePerm>`.
- `consent:write` is held by `MARKETER`, `TENANT_ADMIN`, `SUPER_ADMIN`. `ANALYST`, `VIEWER`, `OPERATOR` see consent read-only.
- `profile:delete` and `pii:read` are ONLY `SUPER_ADMIN` / `TENANT_ADMIN`.
- **PII masking is server-side.** Render `traits_json` (email/phone/name), identifier `values`, and export contents exactly as received. When a value looks masked and the user lacks `pii:read`, show a lock icon tooltip "unmask requires `pii:read`". Never assume the client can unmask.
- The bundle and delete actions are **tenant-scoped by URL path**; a token pinned to another tenant gets `403 tenant scope violation`.

## Acceptance criteria (checklist)

- [ ] Search by email and by phone hits `GET .../profiles?email=|phone=` with exactly one filter; submitting with neither is prevented client-side (API would return `400`).
- [ ] Search by `canonical_user_id` navigates to `GET .../profiles/{canonicalUserID}`.
- [ ] Detail header shows `canonical_user_id` (copyable), `identity_cluster_id`, `first_seen_at`, `last_seen_at`, `version`, `status`.
- [ ] Overview renders `traits_json` (email/phone/name/country) and all listed `computed_attributes_json` keys.
- [ ] Masked PII renders as received; lock tooltip "unmask requires pii:read" shows when masked and no `pii:read`; no client-side unmasking is attempted.
- [ ] Identity tab shows identifier inventory (`total`, `by_namespace`, masked `values`), cluster, and merge-history timeline; cluster/merge endpoints are flagged **TBD — backend gap** and degrade gracefully.
- [ ] Events tab lists recent events (per-profile route or Events-explorer `identifier_key` fallback) with `JsonViewer` and replay; replay gated by `event:replay`; async banner shown after replay.
- [ ] Segments tab lists memberships (`entered_at`/`exited_at`/version); endpoint flagged **TBD — backend gap**.
- [ ] Consent grid renders channels (email/sms/push/ads/webhook) × purposes (marketing/analytics/personalization/transactional) with statuses granted/denied/unknown; absence = unknown.
- [ ] Consent read via `GET .../consent`; edit via `PUT .../consent` body `{channel,purpose,status,source}`; gated by `consent:write`; query invalidated on success; a note explains activation skips `denied`.
- [ ] Export button downloads the JSON bundle (`profile`, `identity_nodes`, `segment_memberships`, `consent`) from `GET .../export`.
- [ ] Delete uses `DELETE .../profiles/{canonicalUserID}`, gated by `profile:delete`, behind a `ConfirmDialog` that requires typing the exact `canonical_user_id`; success shows `{deleted:{table:count}}` and navigates back; irreversible warning present.
- [ ] Loading/empty/error states exist on every data view; `401`→`/connect`, `403`→toast, `429`→`Retry-After` handled centrally.
- [ ] All requests are tenant-scoped via `tenantPath` and carry the admin Bearer token.
