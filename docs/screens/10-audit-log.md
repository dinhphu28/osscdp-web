# Audit Log (Blocked — Spec Only)

Intended filterable audit trail of admin actions; **currently blocked** on a missing backend read endpoint.

> # 🚫 BLOCKED
> **The backend audit log is WRITE-ONLY; there is no `GET .../audit` endpoint yet.**
> This screen **cannot be built** until the backend adds one. The `audit:read` permission string
> already exists, but no route serves it. The spec below is **forward-looking** — implement the
> placeholder page (banner only) now, and the full screen once the endpoint lands.
> See [Backend gaps & caveats](../10-backend-gaps-and-caveats.md) (gaps #2 and #8).

---

## Purpose

Provide operators/admins a **filterable, read-only audit trail** of privileged actions performed
through the admin console/API, so tenant activity is reviewable for compliance and incident response.
Intended to cover: tenant/source/admin-token creation, segment create/edit/deactivate,
destination + subscription changes, consent changes, DLQ retry/discard, and profile
export/delete/view.

**Status: Phase 2 / needs backend endpoint.** Until the backend ships a read route, ship only the
placeholder page described in [Placeholder page (build now)](#placeholder-page-build-now).

## Route(s)

| Route | Screen |
|---|---|
| `/t/:tenantId/audit` | Audit log (placeholder today; full viewer once endpoint exists) |

The route is already reserved in the router tree (see `src/app/router.tsx`). Render it now with the
blocked banner so the nav item exists and expectations are set.

## Required permission(s)

| Permission | Used for |
|---|---|
| `audit:read` | Reading/querying the audit trail (part of the Read set; held by all 6 roles) |

`audit:read` is in the canonical Read set, so **every role** (`SUPER_ADMIN`, `TENANT_ADMIN`,
`MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER`) holds it. Gating is therefore trivial once the endpoint
exists; the real blocker is the missing route, not RBAC. See [RBAC & auth](../05-auth-rbac-tenancy.md).

## API calls used (exact paths)

> **None of these exist today.** Do not call them; there is no route to hit. Listed as the
> **proposed** contract for the backend team.

| Method & path (PROPOSED — does NOT exist) | Perm | Notes |
|---|---|---|
| `GET /admin/v1/tenants/{tenantID}/audit` | `audit:read` | List/query audit entries. Filters + pagination below. TBD — backend gap. |

### Proposed query parameters

| Param | Type | Meaning |
|---|---|---|
| `actor` | string | Filter by `actor_id` / `actor_type` (see caveat: `actor_id` unpopulated → coarse). |
| `action` | string | Filter by action verb (e.g. `create`, `update`, `delete`, `retry`, `export`). |
| `resource_type` | string | Filter by resource (e.g. `tenant`, `source`, `admin_token`, `segment`, `destination`, `subscription`, `consent`, `dlq_event`, `profile`). |
| `from` | RFC3339 string | Start of `created_at` range (inclusive). |
| `to` | RFC3339 string | End of `created_at` range (inclusive). |
| `limit` | int | Page size. Pagination style TBD — likely **keyset/cursor** to match `GET .../events`. |
| `cursor` | string | Opaque cursor if keyset. TBD — backend gap; confirm shape. |

Pagination shape is **unconfirmed**. If the backend follows the events convention it returns
`{ entries: [...], next_cursor: string }` and the Data Grid runs in server mode. Confirm on
implementation. See [API integration](../04-api-integration.md) and [Backend gaps](../10-backend-gaps-and-caveats.md).

## Layout & components

Once the endpoint exists, build a standard data-dense list view:

- **PageHeader** — title "Audit Log", description, no primary action (read-only screen).
- **Filter bar** — actor input, action select, `resource_type` select, a date-range picker
  (MUI X Date Pickers) mapped to `from`/`to`.
- **MUI X Data Grid** — server mode if the endpoint paginates by cursor (mirror the events explorer).
- **Row detail / diff drawer** — clicking a row opens a **before/after JSON diff** rendered with the
  shared `JsonViewer` in diff mode (`before_json` vs `after_json`).
- Shared components: `StatusChip` (for action/resource categorization), `CopyButton` (copy
  `resource_id`), relative-time formatter for `created_at`.

### Intended table columns

| Column | Source field | Notes |
|---|---|---|
| Time | `created_at` | Relative-time formatter + absolute on hover. Default sort `created_at DESC` (assumed). |
| Actor | `actor_type` / `actor_id` | Show `actor_type`; `actor_id` often empty → attribution is coarse (see caveat). |
| Action | `action` | e.g. `create`, `update`, `delete`, `retry`, `discard`, `export`, `view`. |
| Resource type | `resource_type` | e.g. `segment`, `destination`, `consent`, `dlq_event`, `profile`. |
| Resource ID | `resource_id` | Copyable via `CopyButton`. |
| IP | `ip_address` | Optional; may be empty. |
| User agent | `user_agent` | Optional; truncate with tooltip. |
| Diff | `before_json` / `after_json` | Actions column → opens `JsonViewer` diff drawer. |

## Data & TS types

Use the canonical `AuditLogEntry` from [Data model & types](../07-data-model-and-types.md) verbatim:

```ts
export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor_id?: string;      // often unpopulated → coarse attribution
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string;
  before_json?: unknown;  // diff "before"
  after_json?: unknown;   // diff "after"
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}
```

Proposed list-response wrapper (TBD — confirm with backend once the endpoint exists):

```ts
// SHAPE UNCONFIRMED — backend gap. Likely keyset to match GET .../events.
interface AuditPage {
  entries: AuditLogEntry[];
  next_cursor: string;
}
```

`JsonViewer` diff usage sketch (illustrative):

```tsx
<JsonViewer
  mode="diff"
  before={entry.before_json}
  after={entry.after_json}
/>
```

## States (loading / empty / error)

Full screen (post-endpoint):

- **Loading** — Data Grid skeleton rows.
- **Empty** — `EmptyState` "No audit entries match these filters."
- **Error** — `ErrorState` with retry; parse the standard `{ error: { code, message } }` envelope.

**Today (endpoint missing):** render the placeholder page — the blocked banner is the entire content;
there is no data fetch, no loading spinner, no grid.

## Actions & confirmations

None. This is a **read-only** screen — no mutations, no confirmations, no one-time secrets. It only
displays and filters audit records.

## RBAC & PII notes

- **RBAC:** requires `audit:read`, held by all 6 roles. Wrap the route/content in
  `<RequirePerm perm="audit:read">` for consistency, though effectively every connected role passes.
- **Tenancy:** tenant-scoped by the `{tenantID}` path segment like all admin calls; never send tenant
  in body/header. SUPER_ADMIN can view any tenant via the switcher.
- **PII:** audit entries may contain identifiers or `before_json`/`after_json` snapshots of
  PII-bearing records. Server-side masking rules still apply — **render values as received**; if a
  value looks masked and the token lacks `pii:read`, show the lock-icon tooltip
  "unmask requires `pii:read`". Never attempt client-side unmasking.
- **Attribution caveat:** `actor_id` is currently **not populated** (admin tokens carry no identity),
  so "who did it" resolves only to `actor_type` — coarse attribution. Surface this in help text.
  See [Backend gaps](../10-backend-gaps-and-caveats.md) (gap #8).

## Placeholder page (build now)

Ship this immediately so the nav entry works and expectations are clear:

```tsx
export function AuditLogPage() {
  return (
    <>
      <PageHeader title="Audit Log" description="Review of privileged admin actions." />
      <Alert severity="warning">
        <AlertTitle>Blocked — backend endpoint missing</AlertTitle>
        The audit log is currently <strong>write-only</strong>. There is no
        <code> GET /admin/v1/tenants/{'{tenantID}'}/audit </code> endpoint yet, so this screen
        cannot be built. This is a Phase 2 feature pending a backend read route.
        See docs/10-backend-gaps-and-caveats.md.
      </Alert>
    </>
  );
}
```

**Backend follow-up recommendation:** add `GET /admin/v1/tenants/{tenantID}/audit` (gated on
`audit:read`) supporting the filters + pagination above, and **populate `actor_id`** so attribution
is precise. Track under [Backend gaps & caveats](../10-backend-gaps-and-caveats.md) (gaps #2, #8).

## Acceptance criteria (checklist)

**Now (placeholder — must pass today):**
- [ ] `/t/:tenantId/audit` route renders the placeholder page with the prominent blocked/warning banner.
- [ ] Banner states the log is write-only, that `GET .../audit` does not exist, and links to `docs/10-backend-gaps-and-caveats.md`.
- [ ] No API call is made (no request to a non-existent audit endpoint).
- [ ] Nav item for Audit Log is visible (optionally marked "Phase 2").

**Later (gated on backend endpoint — do NOT attempt until `GET .../audit` ships):**
- [ ] Backend `GET /admin/v1/tenants/{tenantID}/audit` (perm `audit:read`) exists and is confirmed in `openapi.yaml`.
- [ ] Filters wired: `actor`, `action`, `resource_type`, date range (`from`/`to`), pagination (`limit`/`cursor` per confirmed shape).
- [ ] Data Grid renders columns: `created_at`, actor (`actor_type`/`actor_id`), `action`, `resource_type`, `resource_id`, `ip_address`, `user_agent`.
- [ ] Row opens `JsonViewer` diff of `before_json` vs `after_json`.
- [ ] Uses canonical `AuditLogEntry` type; response wrapper shape confirmed with backend.
- [ ] Loading / empty / error states implemented; error parses the standard `{ error: { code, message } }` envelope.
- [ ] PII masking respected (values rendered as received; lock tooltip when masked without `pii:read`).
- [ ] Coarse-attribution note surfaced where `actor_id` is empty.
