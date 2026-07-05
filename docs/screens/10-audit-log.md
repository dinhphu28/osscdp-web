# Audit Log

Read-only, keyset-paginated audit trail of privileged admin actions for the current tenant.

> **Live.** The backend now serves `GET /admin/v1/tenants/{tenantID}/audit` (keyset-paginated).
> The response is **metadata-only** — `created_at`, `actor_type`, `action`, `resource_type`,
> `resource_id`. The `before_json`/`after_json` snapshots are **intentionally omitted (PII)** and
> are deferred to a future `pii:read`-gated **detail** route; there is **no diff drawer** today.
> See [Backend gaps & caveats](../10-backend-gaps-and-caveats.md) (gaps #8 and #8b).

---

## Purpose

Provide operators/admins a **read-only audit trail** of privileged actions performed through the admin
console/API, so tenant activity is reviewable for compliance and incident response. Covers:
tenant/source/admin-token creation, segment create/edit/deactivate, destination + subscription changes,
consent changes, DLQ retry/discard, and profile export/delete/view.

The list surfaces **metadata only** (who-type/what/which-resource/when). A PII-bearing before/after
detail is a future capability (see [Deferred: before/after detail](#deferred-beforeafter-detail)).

## Route(s)

| Route                | Screen                                          |
| -------------------- | ----------------------------------------------- |
| `/t/:tenantId/audit` | Audit log — live keyset-paginated metadata table |

## Required permission(s)

| Permission   | Used for                                                                     |
| ------------ | ---------------------------------------------------------------------------- |
| `audit:read` | Reading/querying the audit trail (part of the Read set; held by all 6 roles) |

`audit:read` is in the canonical Read set, so **every role** (`SUPER_ADMIN`, `TENANT_ADMIN`,
`MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER`) holds it. Wrap the route/content in
`<RequirePerm perm="audit:read">` for consistency. See [RBAC & auth](../05-auth-rbac-tenancy.md).

## API calls used (exact paths)

| Method & path                            | Perm         | Notes                                                                         |
| ---------------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| `GET /admin/v1/tenants/{tenantID}/audit` | `audit:read` | List audit entries (metadata only), **keyset-paginated**. Filters + paging below. |

### Query parameters

| Param           | Type           | Meaning                                                                                                                                    |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `actor`         | string         | Filter by `actor_type` (see caveat: `actor_id` unpopulated → coarse attribution).                                                          |
| `action`        | string         | Filter by action verb (e.g. `create`, `update`, `delete`, `retry`, `export`).                                                              |
| `resource_type` | string         | Filter by resource (e.g. `tenant`, `source`, `admin_token`, `segment`, `destination`, `subscription`, `consent`, `dlq_event`, `profile`). |
| `from`          | RFC3339 string | Start of `created_at` range (inclusive).                                                                                                    |
| `to`            | RFC3339 string | End of `created_at` range (inclusive).                                                                                                      |
| `limit`         | int            | Page size.                                                                                                                                  |
| `cursor`        | string         | Opaque keyset cursor.                                                                                                                       |

Pagination is **keyset/cursor** (mirrors `GET .../events`): the response returns
`{ entries: [...], next_cursor }` and the Data Grid runs in **server mode**. See
[API integration](../04-api-integration.md).

## Layout & components

A standard data-dense list view:

- **PageHeader** — title "Audit Log", description, no primary action (read-only screen).
- **Filter bar** — actor input, action select, `resource_type` select, a date-range picker
  (MUI X Date Pickers) mapped to `from`/`to`.
- **MUI X Data Grid** — **server mode**, keyset pagination (mirror the events explorer).
- Shared components: `StatusChip` (for action/resource categorization), `CopyButton` (copy
  `resource_id`), relative-time formatter for `created_at`.

> **No row-detail / diff drawer today.** The list carries no `before_json`/`after_json`, so there is
> nothing to diff. See [Deferred: before/after detail](#deferred-beforeafter-detail).

### Table columns

| Column        | Source field    | Notes                                                                                  |
| ------------- | --------------- | -------------------------------------------------------------------------------------- |
| Time          | `created_at`    | Relative-time formatter + absolute on hover. Default sort `created_at DESC`.            |
| Actor         | `actor_type`    | Show `actor_type`; `actor_id` is unpopulated → attribution is coarse (see caveat).     |
| Action        | `action`        | e.g. `create`, `update`, `delete`, `retry`, `discard`, `export`, `view`.               |
| Resource type | `resource_type` | e.g. `segment`, `destination`, `consent`, `dlq_event`, `profile`.                      |
| Resource ID   | `resource_id`   | Copyable via `CopyButton`.                                                              |

## Data & TS types

Use the canonical `AuditLogEntry` from [Data model & types](../07-data-model-and-types.md). The **list
response populates only the metadata fields**; `before_json`/`after_json` (and typically `actor_id`,
`ip_address`, `user_agent`) are absent from `GET .../audit`:

```ts
export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor_id?: string; // unpopulated → coarse attribution (gap #8)
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  before_json?: unknown; // NOT returned by GET .../audit (PII) — see deferred detail route
  after_json?: unknown; // NOT returned by GET .../audit (PII) — see deferred detail route
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}
```

Keyset list-response wrapper (mirrors `GET .../events`):

```ts
interface AuditPage {
  entries: AuditLogEntry[];
  next_cursor: string;
}
```

## States (loading / empty / error)

- **Loading** — Data Grid skeleton rows.
- **Empty** — `EmptyState` "No audit entries match these filters."
- **Error** — `ErrorState` with retry; parse the standard `{ error: { code, message } }` envelope.

## Actions & confirmations

None. This is a **read-only** screen — no mutations, no confirmations, no one-time secrets. It only
displays and filters audit records.

## RBAC & PII notes

- **RBAC:** requires `audit:read`, held by all 6 roles. Effectively every connected role passes.
- **Tenancy:** tenant-scoped by the `{tenantID}` path segment like all admin calls; never send tenant
  in body/header. SUPER_ADMIN can view any tenant via the switcher.
- **PII:** the audit **list** carries no PII payloads — before/after JSON is omitted server-side by
  design. Any string that still looks masked is rendered **as received**; if it looks masked and the
  token lacks `pii:read`, show the lock-icon tooltip "unmask requires `pii:read`". Never attempt
  client-side unmasking.
- **Attribution caveat:** `actor_id` is **not populated** (admin tokens carry no identity), so
  "who did it" resolves only to `actor_type` — coarse attribution. Surface this in help text.
  See [Backend gaps](../10-backend-gaps-and-caveats.md) (gap #8).

## Deferred: before/after detail

The before/after JSON snapshots (`before_json`/`after_json`) are **intentionally omitted** from the
metadata list because they can contain PII. A dedicated **`pii:read`-gated detail route** is a future
backend follow-up; only then should the console add a row-detail / diff drawer (rendered with the shared
`JsonViewer` in diff mode). Do **not** build the diff drawer against the list endpoint — the fields are
not there. Tracked in [Backend gaps & caveats](../10-backend-gaps-and-caveats.md) (gap #8b).

## Acceptance criteria (checklist)

- [ ] `/t/:tenantId/audit` renders a live, server-mode Data Grid backed by `GET /admin/v1/tenants/{tenantID}/audit`.
- [ ] Columns: `created_at` (relative + absolute on hover), actor (`actor_type`), `action`, `resource_type`, `resource_id` (copyable).
- [ ] Filters wired: `actor`, `action`, `resource_type`, date range (`from`/`to`); pagination is **keyset** (`limit`/`cursor`, `next_cursor`).
- [ ] Uses the canonical `AuditLogEntry` type; the list is treated as **metadata-only** (no `before_json`/`after_json`).
- [ ] **No diff/detail drawer** is built against the list endpoint; the before/after detail is documented as deferred to a future `pii:read`-gated route.
- [ ] Loading / empty / error states implemented; error parses the standard `{ error: { code, message } }` envelope.
- [ ] Coarse-attribution note surfaced (`actor_id` unpopulated → `actor_type` only).
- [ ] Any masked-looking value is rendered as received; lock tooltip shown when masked without `pii:read`.
