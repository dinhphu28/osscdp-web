# DLQ Admin

Inspect and remediate dead-lettered pipeline events — operability triage for events the async pipeline failed to process.

## Purpose

The pipeline is **asynchronous**: ingest returns `202`, then identity → profile → segmentation →
activation happen seconds later. When a stage fails permanently, the offending event is written to a
**dead-letter queue (DLQ)**. This screen lets an operator triage those failures: inspect the original
payload and error, **retry** (republish) an event, or **discard** it. This is a pure operability
surface — no analytics, no customer data mutation.

See the [async pipeline](../03-architecture.md) and [backend gaps](../10-backend-gaps-and-caveats.md) notes for the caveats that shape this screen.

## Route(s)

| Route              | Screen                                                               |
| ------------------ | -------------------------------------------------------------------- |
| `/t/:tenantId/dlq` | DLQ list + detail (single screen; row selection opens payload panel) |

Nested under the `/t/:tenantId` layout route (tenant-scoped). No sub-routes.

## Required permission(s)

| Capability               | Permission  | Roles that hold it                                                                              |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------- |
| View DLQ list + payloads | `dlq:read`  | all read-set roles (`SUPER_ADMIN`, `TENANT_ADMIN`, `MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER`) |
| Retry a DLQ event        | `dlq:retry` | `SUPER_ADMIN`, `TENANT_ADMIN`, `OPERATOR`                                                       |
| Discard a DLQ event      | `dlq:retry` | `SUPER_ADMIN`, `TENANT_ADMIN`, `OPERATOR`                                                       |

Notes:

- **Discard shares the `dlq:retry` permission** — there is no separate `dlq:discard` permission.
- `VIEWER` and `ANALYST` are **read-only**: they can view the queue and payloads but see no
  Retry/Discard actions.
- Gate write actions with `<RequirePerm perm="dlq:retry">`; disabled buttons carry a tooltip
  "requires dlq:retry". UI gating is UX only — the backend also enforces `403`. See [RBAC](../05-auth-rbac-tenancy.md).

## API calls used (exact paths)

All paths are under `/admin/v1/tenants/{tenantID}`; build with `tenantPath(tenantId, suffix)`. See
[API integration](../04-api-integration.md).

| Method | Path                                                               | Permission  | Notes                                                                                   |
| ------ | ------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------- |
| `GET`  | `/admin/v1/tenants/{tenantID}/dlq?status=open\|retried\|discarded` | `dlq:read`  | List. Default `limit` 100, max 500. Ordered `failed_at DESC`. Returns `{events:[...]}`. |
| `POST` | `/admin/v1/tenants/{tenantID}/dlq/{id}/retry`                      | `dlq:retry` | Republishes the event into the pipeline → `{id, status:"retried"}`.                     |
| `POST` | `/admin/v1/tenants/{tenantID}/dlq/{id}/discard`                    | `dlq:retry` | Marks event discarded → `{id, status:"discarded"}`.                                     |

**No pagination cursor** — DLQ is filter-only (by `status`), returns a full array up to the limit.
Use MUI X Data Grid in **client mode** (client-side paging/sorting), not server/keyset mode. Contrast
with the events explorer which is keyset-paginated.

**Not available (backend gaps):** there is **no DLQ export** and **no mark-resolved** endpoint — only
list / retry / discard. Do NOT build export or bulk-resolve UI. See
[backend gaps §4](../10-backend-gaps-and-caveats.md).

## Layout & components

```
PageHeader  "DLQ" · "Dead-lettered pipeline events awaiting triage"
├─ SegmentedControl (status filter):  [ Open ] [ Retried ] [ Discarded ]   (default: Open)
├─ DataGrid (client mode)
│    columns: failed_at · component · error_code · error_message ·
│             event_id · source_id · retry_count · status · [actions]
│    row click → opens detail panel
└─ DetailPanel / Drawer (selected row)
     ├─ metadata (ids, component, error_code, error_message, retry_count, failed_at)
     ├─ JsonViewer(original_payload)
     └─ actions: [Retry]  [Discard]   (RequirePerm dlq:retry)
```

- **PageHeader** — title "DLQ", short description. No primary create action (nothing is created here).
- **Status filter** — an MUI segmented control (`ToggleButtonGroup`, exclusive) with the three
  `DlqStatus` values `open | retried | discarded`. Drives the `status` query param and the query key.
  Default selection: `open`.
- **Data Grid** columns:

  | Column        | Field           | Rendering                                                                     |
  | ------------- | --------------- | ----------------------------------------------------------------------------- |
  | Failed at     | `failed_at`     | relative-time formatter (e.g. "3m ago"), full ISO on hover; default sort DESC |
  | Component     | `component`     | plain text (pipeline stage that failed)                                       |
  | Error code    | `error_code`    | `StatusChip` (error tone)                                                     |
  | Error message | `error_message` | truncated with ellipsis; full text in tooltip / detail panel                  |
  | Event ID      | `event_id`      | copyable (`CopyButton`)                                                       |
  | Source ID     | `source_id`     | copyable; may be absent (`source_id?`) → render "—"                           |
  | Retries       | `retry_count`   | numeric                                                                       |
  | Status        | `status`        | `StatusChip` mapped from `DlqStatus`                                          |
  | Actions       | —               | Retry / Discard buttons, gated by `dlq:retry`                                 |

- **Row → detail:** selecting a row opens a drawer/panel showing full metadata and the
  **`original_payload`** rendered with the shared **`JsonViewer`** component.
- **Actions** live in the actions column and/or the detail panel (see below).

## Data & TS types

From [Data model](../07-data-model-and-types.md) — copy verbatim, do not redefine:

```ts
export type DlqStatus = 'open' | 'retried' | 'discarded';

export interface DlqEvent {
  id: string;
  tenant_id: string;
  event_id: string;
  source_id?: string; // may be absent
  component: string; // pipeline stage that failed
  error_code: string;
  error_message: string;
  original_payload: Record<string, unknown>;
  retry_count: number;
  status: DlqStatus;
  failed_at: string; // ISO; list sorted DESC
}
```

List response envelope:

```ts
// GET .../dlq?status=... → 200
interface DlqListResponse {
  events: DlqEvent[];
}

// POST .../dlq/{id}/retry   → { id: string; status: 'retried' }
// POST .../dlq/{id}/discard → { id: string; status: 'discarded' }
```

Query-key factory (keyed by tenant + status filter):

```ts
qk.dlq(tenantId).list(status); // ['t', tenantId, 'dlq', 'list', status]
```

Example read hook (hand-written; verify Orval coverage against `openapi.yaml`):

```ts
function useDlqEvents(tenantId: string, status: DlqStatus) {
  return useQuery({
    queryKey: qk.dlq(tenantId).list(status),
    queryFn: () =>
      api
        .get<DlqListResponse>(tenantPath(tenantId, `/dlq?status=${status}`))
        .then((r) => r.data.events),
  });
}
```

Mutations invalidate the DLQ list for the affected tenant so the row moves out of `open`:

```ts
function useRetryDlq(tenantId: string) {
  return useMutation({
    mutationFn: (id: string) =>
      api.post(tenantPath(tenantId, `/dlq/${id}/retry`)).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['t', tenantId, 'dlq'] }),
  });
}
```

## States (loading / empty / error)

- **Loading** — Data Grid skeleton rows while the list query is pending.
- **Empty** — when `events` is `[]`, render `EmptyState`:
  - For `open`: **"No dead-lettered events — pipeline healthy."**
  - For `retried` / `discarded`: neutral "No events with this status." variant.
- **Error** — `ErrorState` with a Retry button; parse the `{error:{code,message}}` envelope. `401`
  clears token + redirects `/connect`; `403` (missing `dlq:read` or tenant-scope) shows a toast; `429`
  respects `Retry-After`. Handled centrally by the Axios error interceptor — see
  [API integration](../04-api-integration.md).

## Actions & confirmations

### Retry

- Button/menu item, gated by `<RequirePerm perm="dlq:retry">`.
- On click → `POST .../dlq/{id}/retry`.
- On success → **notistack** success toast and an **async-pipeline banner**:
  > "Event republished; it may reappear here if it fails again."
- Rationale: retry re-enters the async pipeline (returns `202`-style semantics downstream), so success
  means "resubmitted", not "fixed". Do not promise the event is resolved. See the async-pipeline UX
  convention in [cross-cutting concerns](../03-architecture.md).
- Invalidate the DLQ list; the row's `status` becomes `retried`.

### Discard

- Button/menu item, gated by `<RequirePerm perm="dlq:retry">` (same permission as retry).
- Requires a **`ConfirmDialog`** (irreversible — no un-discard endpoint):
  > "Discard this dead-lettered event? This cannot be undone. The event will not be reprocessed."
- On confirm → `POST .../dlq/{id}/discard`.
- On success → success toast; invalidate the DLQ list; the row's `status` becomes `discarded`.

Both actions are **audited server-side** (the backend writes an audit entry). The console cannot
display those entries yet — the audit log is write-only with no read endpoint. See
[backend gaps §2](../10-backend-gaps-and-caveats.md).

```tsx
<RequirePerm perm="dlq:retry">
  <Button size="small" onClick={() => retry.mutate(row.id)}>
    Retry
  </Button>
  <Button size="small" color="warning" onClick={() => setConfirmDiscard(row)}>
    Discard
  </Button>
</RequirePerm>
```

## RBAC & PII notes

- Read requires `dlq:read`; both write actions require `dlq:retry`. `VIEWER` and `ANALYST` see the
  queue but no action buttons.
- **PII:** `original_payload` is the raw ingress event body and **may contain PII** (email, phone,
  name, etc.). Masking is server-side — the frontend renders exactly what the API returns and never
  attempts client-side unmasking. If values look masked and the token lacks `pii:read`, show the
  standard lock-icon tooltip "unmask requires pii:read". See [PII masking](../05-auth-rbac-tenancy.md).
- All actions are tenant-scoped by the `{tenantID}` path segment; never send tenant in body/header.

## Acceptance criteria (checklist)

- [ ] Route `/t/:tenantId/dlq` renders the DLQ list scoped to the current tenant.
- [ ] Status segmented control offers exactly `open`, `retried`, `discarded`; default is `open`; changing it re-queries with the `status` param.
- [ ] `GET .../dlq?status=...` is called with `dlq:read`; results shown newest-first (`failed_at DESC`), client-paged in the Data Grid.
- [ ] Columns present: `failed_at`, `component`, `error_code`, `error_message`, `event_id`, `source_id`, `retry_count`, `status`.
- [ ] `source_id` absence renders gracefully ("—"); `event_id`/`source_id` are copyable.
- [ ] Selecting a row shows `original_payload` in the shared `JsonViewer`.
- [ ] Retry calls `POST .../dlq/{id}/retry`, requires `dlq:retry`, and shows the async banner "republished; may reappear if it fails again".
- [ ] Discard calls `POST .../dlq/{id}/discard`, requires `dlq:retry` (same perm), and is gated behind a `ConfirmDialog`.
- [ ] Successful retry/discard invalidates the DLQ list so the row's status updates.
- [ ] Empty `open` list shows "No dead-lettered events — pipeline healthy."
- [ ] Loading, empty, and error states are all implemented; error envelope parsed via the shared interceptor.
- [ ] `VIEWER`/`ANALYST` tokens see no Retry/Discard actions; `OPERATOR`/`TENANT_ADMIN`/`SUPER_ADMIN` do.
- [ ] No export or mark-resolved UI is present (unsupported by backend).
- [ ] `original_payload` is rendered as received (no client-side unmasking); masked values show the `pii:read` affordance.
