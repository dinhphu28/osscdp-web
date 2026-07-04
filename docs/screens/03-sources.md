# Sources

Provision, rotate, and disable data sources (ingest API keys) for the current tenant, and hand off one-time `cdp_...` keys to the customer's engineers.

## Purpose

A **source** is a per-app credential holder that lets a customer's application send events to the CDP ingress API. This screen lets an operator:

- Provision a new source and receive its ingest **API key exactly once** (copy-once modal).
- **Rotate** a source's key (the old key stops working immediately) and receive the new key once.
- **Disable** a source (if the backend supports it — see [Backend gaps](../10-backend-gaps-and-caveats.md)).
- Read **instrumentation help**: how the customer's app authenticates to ingress.

> The admin console **never authenticates with `cdp_...` source keys**. They are provisioned here purely for hand-off. The console only uses admin Bearer tokens. See [API integration](../04-api-integration.md).

## Route(s)

| Route | Screen |
|---|---|
| `/t/:tenantId/sources` | Sources list + create/rotate/disable actions + instrumentation help panel |

## Required permission(s)

| Action | Permission |
|---|---|
| View sources list | `source:read` |
| Create source | `source:write` |
| Rotate key | `source:write` |
| Disable source | `source:write` |

Gate all mutating actions with `<RequirePerm perm="source:write">`; disabled buttons carry a tooltip "requires source:write". Enforcement is also server-side (`403`) — UI gating is UX, not security. See [RBAC](../05-auth-rbac-tenancy.md).

## API calls used (exact paths)

All admin routes require `Authorization: Bearer <adminToken>` and are tenant-scoped by the `{tenantID}` path segment.

| Purpose | Method & path | Permission | Notes |
|---|---|---|---|
| Create source | `POST /admin/v1/tenants/{tenantID}/sources` | `source:write` | **Returns ingest API key ONCE** (`{ api_key }`, prefix `cdp_`) |
| Rotate key | `POST /admin/v1/tenants/{tenantID}/sources/{sourceID}/rotate-key` | `source:write` | Returns new key once; **old key invalid immediately** |
| List sources | **TBD — backend gap** | `source:read` | A `GET /admin/v1/tenants/{tenantID}/sources` is NOT confirmed in the spec. UI needs it to render the table. See [Backend gaps](../10-backend-gaps-and-caveats.md) |
| Disable source | **TBD — backend gap** | `source:write` | Likely `PUT /admin/v1/tenants/{tenantID}/sources/{sourceID}` (set `status: "disabled"`) but not confirmed in the spec extract. See [Backend gaps](../10-backend-gaps-and-caveats.md) |

> The **list** and **disable** endpoints are unconfirmed. Wire the create/rotate flows against the confirmed endpoints now; stub the list/disable calls behind a thin data-hook so the screen degrades gracefully (empty state / disabled action) until the backend endpoints land.

### Ingress endpoints (shown as help text only — the console does NOT call these)

| Method & path | Notes |
|---|---|
| `POST /v1/events/track` | Single track event → `202` |
| `POST /v1/identify` | → `202` |
| `POST /v1/alias` | → `202` |
| `POST /v1/events/batch` | ≤ 500 events → `202` |
| `GET /v1/auth/whoami` | → `{tenant_id, source_id}` (source-key context) |

Ingress auth header: `X-CDP-Api-Key: <key>` OR `Authorization: Bearer <key>`; key format `cdp_...`.

## Layout & components

- **PageHeader**: title "Sources", one-line description, primary action **"Create source"** (gated by `source:write`).
- **MUI X Data Grid** (client-mode paging — the list is filter-only / small, not keyset-paginated):

  | Column | Source field | Rendering |
  |---|---|---|
  | Name | `name` | text |
  | Type | `type` | text (e.g. `"server"`) |
  | Status | `status` | **StatusChip** — `active` (green) / `disabled` (grey) |
  | Created | `created_at` | relative-time formatter |
  | Rate limit | `rate_limit` | number, or "—" when unset |
  | Actions | — | actions column: **Rotate key**, **Disable** (both gated `source:write`) |

- **Create source dialog** — React Hook Form + Zod (see below).
- **OneTimeSecretDialog** — reused for the `api_key` returned on create/rotate.
- **ConfirmDialog** — for rotate (and disable) confirmation.
- **Instrumentation help panel** — collapsible section / drawer explaining how the customer instruments their app (see below).
- **Empty / Loading / Error states** — `EmptyState`, skeleton rows, `ErrorState` with retry.

## Data & TS types

From [Data model](../07-data-model-and-types.md) — do not redefine, import:

```ts
export interface Source {
  id: string; tenant_id: string; name: string; type: string; // e.g. "server"
  status: 'active' | 'disabled'; config_json?: Record<string, unknown>;
  rate_limit?: number; allowed_event_types?: string[]; created_at: string; updated_at: string;
}
export interface SourceKeyOnce { api_key: string; } // shown once on create/rotate (prefix cdp_)
```

## Create form (React Hook Form + Zod)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | text | yes | human label for the source |
| `type` | text/select | yes | e.g. `"server"` (free-form string per `Source.type`) |
| `allowed_event_types` | string[] | no | optional list; restrict which event types this source may send |
| `rate_limit` | number | no | optional per-source rate hint |

```ts
const createSourceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'), // e.g. "server"
  allowed_event_types: z.array(z.string()).optional(),
  rate_limit: z.coerce.number().int().positive().optional(),
});
type CreateSourceForm = z.infer<typeof createSourceSchema>;
```

On submit → `POST .../sources`. On success the response contains `SourceKeyOnce`; open **OneTimeSecretDialog** with `api_key` (prefix `cdp_`), a big copy button, and the explicit warning **"This key cannot be retrieved again."** Requires confirm to close. Then invalidate the sources list query.

```tsx
const onSubmit = handleSubmit(async (values) => {
  const { api_key } = await createSource(tenantId, values); // POST .../sources
  showOneTimeSecret({
    title: 'Source API key',
    value: api_key, // cdp_...
    warning: 'Copy this key now. It cannot be retrieved again.',
  });
  queryClient.invalidateQueries({ queryKey: qk.sources(tenantId).all });
});
```

Map server `bad_request` (validation) errors to fields or a form-level alert (see [API integration](../04-api-integration.md)).

## Actions & confirmations

### Create
Primary action → create dialog → on success → **OneTimeSecretDialog** (copy-once). Covered above.

### Rotate key
1. Row action **"Rotate key"** → **ConfirmDialog**: warn that **the old key stops working immediately** and any app still using it will start failing (`401` at ingress).
2. On confirm → `POST .../sources/{sourceID}/rotate-key` → returns `SourceKeyOnce`.
3. Open **OneTimeSecretDialog** with the new `api_key` (same copy-once warning).
4. Invalidate the sources list query.

```tsx
const rotate = async (sourceId: string) => {
  const ok = await confirm({
    title: 'Rotate source key?',
    body: 'The current key stops working immediately. Apps using it will fail until updated.',
    confirmLabel: 'Rotate key',
    destructive: true,
  });
  if (!ok) return;
  const { api_key } = await rotateKey(tenantId, sourceId); // POST .../rotate-key
  showOneTimeSecret({ title: 'New source API key', value: api_key,
    warning: 'Copy this key now. It cannot be retrieved again.' });
  queryClient.invalidateQueries({ queryKey: qk.sources(tenantId).all });
};
```

### Disable
Row action **"Disable"** → **ConfirmDialog** → `PUT .../sources/{sourceID}` with `status: "disabled"` **if the endpoint is available**; otherwise render the action disabled with a tooltip and link to [Backend gaps](../10-backend-gaps-and-caveats.md). Mark this path **TBD — backend gap**.

## Instrumentation help panel

A read-only reference the operator can copy and hand to the customer's engineers. **The console itself never sends these requests.** Content:

- Ingest base URL: `VITE_API_BASE_URL` (dev `http://localhost:8080`; docker stack `http://localhost:18080`).
- Endpoints: `POST /v1/events/track`, `POST /v1/identify`, `POST /v1/alias`, `POST /v1/events/batch` (all return `202`; batch ≤ 500 events).
- Auth header: **`X-CDP-Api-Key: <key>`** (or `Authorization: Bearer <key>`), key format `cdp_...`.
- Async note: the pipeline is **asynchronous** — ingest returns `202`; identity → profile → segmentation → activation happen seconds later. Set expectations accordingly.

> **Header mismatch caveat (surface in the help text):** the ingress code checks **`X-CDP-Api-Key`**, but backend CORS advertises **`X-Api-Key`**. A browser-based sender may hit a CORS preflight mismatch. The console doesn't call ingress, but note this so instrumented apps use the correct header. See [Backend gaps](../10-backend-gaps-and-caveats.md).

Example snippet to display:

```bash
curl -X POST "$CDP_BASE_URL/v1/events/track" \
  -H "X-CDP-Api-Key: cdp_xxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "event_name": "product_viewed", "user_id": "u1", "properties": { } }'
# → 202 Accepted (processed asynchronously)
```

## States (loading / empty / error)

| State | Rendering |
|---|---|
| Loading | Data Grid skeleton rows |
| Empty | `EmptyState` — "No sources yet. Create one to start ingesting events." + primary "Create source" (gated) |
| Error | `ErrorState` with retry; parse `{error:{code,message}}` envelope |
| List endpoint missing | If `GET .../sources` is unavailable (TBD backend gap), render an informational `EmptyState` explaining the list endpoint is pending backend support; still allow **Create source** |
| One-time key shown | OneTimeSecretDialog blocks until the operator confirms they copied the value |

## RBAC & PII notes

- **RBAC:** `source:read` to view; `source:write` for create/rotate/disable. Roles with `source:write`: `SUPER_ADMIN`, `TENANT_ADMIN` (all), plus any role holding the perm per the role→permission table. `MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER` have `source:read` only (read set) and must see mutating actions hidden/disabled. See [RBAC](../05-auth-rbac-tenancy.md).
- **Tenancy:** all calls are scoped by `{tenantID}` path. A token pinned to another tenant → `403 tenant scope violation`.
- **PII:** none of the `Source` fields are PII. The `api_key` is a **one-time secret**, not PII — never log it, never persist it in app state beyond the OneTimeSecretDialog, and never send it back to any endpoint.

## Acceptance criteria (checklist)

- [ ] Route `/t/:tenantId/sources` renders a PageHeader with a "Create source" primary action gated by `source:write`.
- [ ] Sources table shows columns: name, type, status (StatusChip `active`/`disabled`), created_at (relative), rate_limit, actions.
- [ ] Create form (RHF + Zod) validates `name` and `type` required; `allowed_event_types` and `rate_limit` optional; submit disabled while pending.
- [ ] `POST .../sources` success opens OneTimeSecretDialog showing the `cdp_...` api_key with a copy button and a "cannot be retrieved again" warning; requires confirm to close.
- [ ] Rotate action shows a ConfirmDialog warning the old key stops working immediately, then calls `POST .../sources/{sourceID}/rotate-key` and shows the new key in OneTimeSecretDialog.
- [ ] After create/rotate the sources list query is invalidated/refetched.
- [ ] Disable action calls `PUT .../sources/{sourceID}` when available; otherwise renders disabled with a tooltip and is marked TBD — backend gap.
- [ ] List endpoint is treated as TBD — backend gap; the screen degrades gracefully (create still works) when `GET .../sources` is unavailable.
- [ ] Mutating actions are hidden/disabled for roles lacking `source:write` (verified with a VIEWER token).
- [ ] Instrumentation help panel documents ingress endpoints, the `X-CDP-Api-Key` header, the async `202` behavior, and the `X-Api-Key` CORS-mismatch caveat with a link to backend gaps.
- [ ] Server `bad_request` validation errors are surfaced on the form.
- [ ] The `api_key` value is never logged, persisted, or re-sent to the API.
```