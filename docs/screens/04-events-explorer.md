# Events Explorer

> Search, inspect, and replay raw ingested events — an operability surface for finding events, viewing their raw payloads, and re-driving them through the async pipeline.

## Purpose

Operators use this screen to answer "did event X arrive, what did it contain, and why didn't it produce the expected profile/segment change?" It exposes:

- A **keyset-paginated** table of raw ingested events, filterable by identifier and event name.
- A **payload JSON viewer** plus event metadata (type, source, timestamps, processing status, error reason).
- **Replay** actions: replay a single event, or replay *all* events for one identifier, re-publishing them into the pipeline.

Because the pipeline is **asynchronous**, replay does not produce instant results. The UI must set expectations ("republished; refresh in a few seconds") and never promise immediate downstream effects. See [App conventions](../03-architecture.md) and [API integration](../04-api-integration.md).

## Route(s)

| Route | Screen |
|---|---|
| `/t/:tenantId/events` | Events explorer table + detail drawer/panel |

There is no separate detail route; selecting a row opens the payload/metadata inside a side panel or drawer on the same route. (A row selection may be reflected in a query param, e.g. `?eventId=...`, but this is optional.)

## Required permission(s)

| Action | Permission |
|---|---|
| View events list & detail | `event:read` |
| Replay one event | `event:replay` |
| Replay all events for an identifier | `event:replay` |

Roles holding `event:read`: all roles (it is in the read set). Roles holding `event:replay`: `SUPER_ADMIN`, `TENANT_ADMIN`, `OPERATOR`. `MARKETER`, `ANALYST`, and `VIEWER` can view but **cannot replay** — hide/disable replay actions for them. See [RBAC](../05-auth-rbac-tenancy.md).

## API calls used (exact paths)

All paths are tenant-scoped; build with `tenantPath(tenantId, suffix)` → `/admin/v1/tenants/${tenantId}${suffix}`.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/admin/v1/tenants/{tenantID}/events` | `event:read` | **Keyset pagination**. Query: `limit` (default 50, max 500), `cursor` (opaque), filters `identifier_key` (e.g. `user_id:u1`), `event_name`. Response `{ events: RawEvent[], next_cursor: string }`. |
| `GET` | `/admin/v1/tenants/{tenantID}/events/{eventID}` | `event:read` | Fetch a single event's full detail. |
| `POST` | `/admin/v1/tenants/{tenantID}/events/{eventID}/replay` | `event:replay` | Re-publish one event into the pipeline. |
| `POST` | `/admin/v1/tenants/{tenantID}/replay?identifier_key=...&max=1000` | `event:replay` | Replay **all** events for an identifier. `identifier_key` e.g. `user_id:u1`; `max` caps the batch (default `1000`). |

> Note: the replay-by-identifier route is `.../tenants/{tenantID}/replay` (not nested under `/events`).

## Layout & components

```
PageHeader ("Events", "Inspect and replay raw ingested events")
  ├─ Filters row: IdentifierKeyPicker (namespace:value) · EventNameFilter · [Apply]/[Clear]
  ├─ MUI X Data Grid (SERVER mode, cursor-driven)
  │     columns: event_name · type · source_id (copyable) · identifier_key ·
  │              processing_status (StatusChip) · received_at (relative) · [row actions]
  │     footer: "Load more" button (uses next_cursor) — NOT numbered pages
  └─ EventDetailPanel (drawer) on row select:
        ├─ Metadata list (type, source_id, event_id, timestamp, received_at,
        │                 processing_status, error_reason)
        ├─ JsonViewer(payload_json)
        └─ Actions: [Replay this event] (RequirePerm event:replay)
  RowActions ⋮: Replay this event · Replay all for this identifier
```

Shared components used: `PageHeader`, the Data Grid wrapper, `JsonViewer`, `StatusChip`, `CopyButton`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `<RequirePerm>`. See [Components](../06-design-system.md).

### Data Grid — SERVER mode with cursor (NOT page numbers)

Events are the **only** keyset-paginated resource. Do **not** use MUI's numbered pagination. Use `useInfiniteQuery` with `next_cursor` and a **"Load more"** affordance (or infinite scroll on the grid body).

```tsx
const eventsQuery = useInfiniteQuery({
  queryKey: qk.events(tenantId).list({ identifier_key, event_name }),
  queryFn: ({ pageParam }) =>
    api.get<KeysetPage<RawEvent>>(tenantPath(tenantId, '/events'), {
      params: { limit: 50, cursor: pageParam, identifier_key, event_name },
    }).then((r) => r.data),
  initialPageParam: undefined as string | undefined,
  // next_cursor === '' (empty) means no more pages
  getNextPageParam: (last) => last.next_cursor || undefined,
});

const rows = eventsQuery.data?.pages.flatMap((p) => p.events) ?? [];
```

```tsx
<DataGrid
  rows={rows}
  columns={columns}
  getRowId={(e) => e.id}
  paginationMode="server"
  hideFooterPagination            // we drive paging via "Load more", not page numbers
  loading={eventsQuery.isFetching}
/>
<Button
  disabled={!eventsQuery.hasNextPage || eventsQuery.isFetchingNextPage}
  onClick={() => eventsQuery.fetchNextPage()}
>
  {eventsQuery.hasNextPage ? 'Load more' : 'No more events'}
</Button>
```

Load-more UX: the button shows a spinner while `isFetchingNextPage`; when `next_cursor` is empty the button is disabled and reads "No more events". Changing a filter resets the infinite query (new query key) back to the first page.

### Filters

| Filter | Query param | Input | Notes |
|---|---|---|---|
| Identifier | `identifier_key` | **namespace:value picker** | Format `<namespace>:<value>`, e.g. `user_id:u1`. UI offers a namespace select (e.g. `user_id`, `email`, `anonymous_id`, `device_id`) + a value text field, then joins them with `:`. Free-text entry also allowed. Exact known namespaces: **TBD — backend gap** (see [backend gaps](../10-backend-gaps-and-caveats.md)); accept arbitrary `namespace:value`. |
| Event name | `event_name` | text field | Exact match, e.g. `product_viewed`. |

Both filters are optional; applying either re-runs the query from the first page. Empty filters list all events (most recent first, per keyset order).

## Data & TS types

Types are defined in [Data model](../07-data-model-and-types.md). Reproduced here for reference:

```ts
export type EventType = 'track' | 'identify' | 'alias';

export interface RawEvent {
  id: string; tenant_id: string; event_id: string; source_id: string;
  type: EventType | 'batch'; event_name?: string; identifier_key?: string;
  payload_json: Record<string, unknown>; payload_hash?: string;
  timestamp: string; received_at: string; processing_status: string; error_reason?: string;
}

export interface KeysetPage<T> { events: T[]; next_cursor: string; } // events list shape
```

Field usage in this screen:

| Field | Displayed as |
|---|---|
| `event_name` | Primary column; falls back to `type` when absent |
| `type` | Column + metadata (`track` / `identify` / `alias` / `batch`) |
| `source_id` | Column (copyable) + metadata |
| `identifier_key` | Column; also the seed for replay-by-identifier |
| `processing_status` | `StatusChip` column + metadata (raw string from backend; render defensively) |
| `error_reason` | Metadata (shown only when present; highlight as error text) |
| `timestamp` / `received_at` | Metadata + relative-time column |
| `payload_json` | `JsonViewer` in detail panel |
| `payload_hash` | Optional metadata (monospace, copyable) |

> `processing_status` is a free-form backend string (not a fixed enum in §4). Render whatever arrives; map known values to chip colors and default unknown values to a neutral chip.

## States (loading / empty / error)

| State | Behavior |
|---|---|
| Loading (first page) | Data Grid skeleton / grid `loading` overlay. |
| Loading (next page) | "Load more" button shows spinner (`isFetchingNextPage`); existing rows stay. |
| Empty (no events) | `EmptyState`: "No events found." If filters are set, offer "Clear filters". Hint that ingest is async — recently sent events may take a few seconds to appear; provide a **Refresh** button. |
| Detail loading | Skeleton in the detail panel while `GET .../events/{eventID}` resolves (if the row's full payload isn't already in the list response). |
| Error | `ErrorState` with retry; parse the `{ error: { code, message } }` envelope. `401` → clear token + redirect `/connect`; `403` → toast ("requires event:read" or tenant-scope); `429` → respect `Retry-After`; others → toast. See [API integration](../04-api-integration.md). |

## Actions & confirmations

### Replay one event
- Button in the row actions menu and in the detail panel, gated by `<RequirePerm perm="event:replay">` (hidden/disabled with tooltip "requires event:replay" for roles without it).
- On click → `ConfirmDialog`: "Replay this event? It will be re-published into the pipeline." → `POST .../events/{eventID}/replay`.
- On success → close dialog, show **async-pipeline banner/snackbar**: *"Event republished; refresh in a few seconds to see downstream changes."* Provide a manual **Refresh** button.

### Replay all events for an identifier
- Available from a row's actions menu ("Replay all for `identifier_key`") and/or a toolbar action when an `identifier_key` filter is active.
- `ConfirmDialog` states the identifier and the cap: "Replay up to `max` events for `user_id:u1`? This re-publishes every matching event into the pipeline." Default `max=1000` (surface/allow editing the cap).
- Calls `POST .../replay?identifier_key=...&max=1000`.
- On success → async-pipeline banner: *"Republished; refresh in a few seconds."*

```tsx
const replayOne = useMutation({
  mutationFn: (eventId: string) =>
    api.post(tenantPath(tenantId, `/events/${eventId}/replay`)),
  onSuccess: () => enqueueSnackbar(
    'Event republished; refresh in a few seconds to see downstream changes.',
    { variant: 'info' },
  ),
});

const replayByIdentifier = useMutation({
  mutationFn: ({ identifier_key, max = 1000 }: { identifier_key: string; max?: number }) =>
    api.post(tenantPath(tenantId, '/replay'), null, { params: { identifier_key, max } }),
  onSuccess: () => enqueueSnackbar('Republished; refresh in a few seconds.', { variant: 'info' }),
});
```

Replay does **not** optimistically mutate the grid. Downstream effects (identity/profile/segment/activation) are async; there is nothing to invalidate synchronously beyond re-fetching the events list on manual refresh.

## RBAC & PII notes

- **Replay gating:** only `SUPER_ADMIN`, `TENANT_ADMIN`, `OPERATOR` hold `event:replay`. Compute from the role→permission table and hide/disable both replay actions otherwise. Enforcement is also server-side (`403`), so treat UI gating as UX, not security.
- **Payload sensitivity (important):** raw event payload masking is **NOT done server-side yet**. Unlike profile traits, `payload_json` is returned **unmasked** and may contain raw PII (emails, phones, names, order data). Treat the payload viewer as a **sensitive surface**:
  - Consider collapsing the payload behind a "Reveal payload" click and not rendering it by default in shared/screenshared contexts.
  - Do not log payloads to the console.
  - This is a documented backend gap — see [backend gaps & caveats](../10-backend-gaps-and-caveats.md) (raw payload masking not implemented). The frontend cannot unmask or re-mask; it renders what it receives, but should minimize incidental exposure.
- Because `pii:read`-style masking does not apply to raw payloads, do not show the "unmask requires pii:read" affordance here — it would be misleading.

## Acceptance criteria (checklist)

- [ ] `/t/:tenantId/events` renders a Data Grid in **server mode** backed by `useInfiniteQuery` with cursor state (no numbered pages).
- [ ] "Load more" fetches the next page using `next_cursor`; button disables and reads "No more events" when `next_cursor` is empty.
- [ ] `identifier_key` filter uses a `namespace:value` picker and produces values like `user_id:u1`; `event_name` filter does exact match; changing a filter resets to the first page.
- [ ] Selecting a row opens a detail panel showing metadata (`type`, `source_id`, timestamps, `processing_status`, `error_reason`) and a `JsonViewer` of `payload_json`.
- [ ] `processing_status` renders via `StatusChip`, defaulting unknown values to a neutral chip; `error_reason` shown only when present.
- [ ] "Replay this event" is gated by `event:replay`, confirmed via `ConfirmDialog`, calls `POST .../events/{eventID}/replay`, and shows the async-pipeline banner on success.
- [ ] "Replay all for identifier" is gated by `event:replay`, confirmed with the identifier + `max`, calls `POST .../replay?identifier_key=...&max=1000`, and shows the async-pipeline banner.
- [ ] Roles without `event:replay` (`MARKETER`, `ANALYST`, `VIEWER`) see the events but no enabled replay actions (tooltip "requires event:replay").
- [ ] Loading, empty (with async-ingest hint + Refresh), and error states are implemented; error envelope handled per the central interceptor.
- [ ] Payload viewer treated as sensitive (not auto-revealed / not logged); the raw-payload masking gap is linked to [backend gaps](../10-backend-gaps-and-caveats.md).
