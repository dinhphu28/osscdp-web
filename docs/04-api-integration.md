# API Integration

> How the frontend talks to the osscdp admin API: base URL, auth header, tenant injection, codegen, TanStack Query patterns, error handling, and pagination.

This is the single reference for the HTTP/data layer. Every screen doc (`docs/screens/*`) links here for the exact endpoints it calls. Related docs: [Data model & types](07-data-model-and-types.md), [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md), [Backend gaps & caveats](10-backend-gaps-and-caveats.md), [Design system](06-design-system.md).

---

## 1. Base URLs

There is **one server on one port**. Ingress and admin surfaces are split by URL **path prefix**, not by host:

- Ingress: `/v1/*` (source-key auth — the console does **not** call these except to render instrumentation help text).
- Admin: `/admin/v1/*` (admin Bearer token — everything the console does).
- Health/meta: `/healthz`, `/readyz`, `/metrics`, `/openapi.yaml`, `/docs` (unauthenticated).

Base URL comes from the Vite env var `VITE_API_BASE_URL`:

| Deployment                                    | `VITE_API_BASE_URL`      |
| --------------------------------------------- | ------------------------ |
| Local dev (backend run directly)              | `http://localhost:8080`  |
| Docker `stack-up` (OpenAPI spec's server URL) | `http://localhost:18080` |

The value is read once at startup and may be overridden per-session from the `/connect` screen (base URL override, useful when the operator points the console at a non-default deployment). No client secrets live in env — the admin token is entered at runtime.

> CORS: the backend must set `CORS_ALLOWED_ORIGINS` to the console origin, else all cross-origin requests are blocked. `AllowCredentials: false`, so the token always travels in the `Authorization` header, never a cookie. See [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md).

---

## 2. Auth header

Send `Authorization: Bearer <adminToken>` on **every** `/admin/v1/*` request. There is no login, session, cookie, JWT, or refresh flow — just a pasted admin token held in the auth store.

Add it via a single Axios **request interceptor**:

```ts
// lib/api/axios.ts
import axios from 'axios';
import { getToken, getBaseUrl } from '../auth/tokenStore';

export const api = axios.create();

api.interceptors.request.use((config) => {
  config.baseURL = getBaseUrl(); // VITE_API_BASE_URL or /connect override
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

- `401` = bad/missing token → clear token, redirect to `/connect`.
- `403` = missing permission **or** tenant-scope violation → toast (do not log out).
- `GET /admin/v1/whoami` returns the token's principal (`{role, tenant_id, is_super_admin}`), so the console auto-detects role after connect and gates the UI from the client-side role→permission table. The manual role picker at `/connect` is now only a **fallback** for older backends that `404` on `whoami`. See §4.2.

---

## 3. Tenant injection

Tenancy is expressed **only** as the `{tenantID}` UUID path segment. **Never** put the tenant in a request body or header. Build admin paths with a single helper:

```ts
// lib/api/tenantPath.ts
export function tenantPath(tenantId: string, suffix = ''): string {
  return `/admin/v1/tenants/${tenantId}${suffix}`;
}
// tenantPath(t, '/events')            -> /admin/v1/tenants/<t>/events
// tenantPath(t, `/profiles/${cuid}`)  -> /admin/v1/tenants/<t>/profiles/<cuid>
```

The current tenant comes from `TenantProvider`/`useTenant` (driven by the `/t/:tenantId` route). SUPER_ADMIN tokens (tenant = nil) can address any tenant via the tenant switcher; non-super tokens are pinned to one tenant and get `403 tenant scope violation` for others.

The non-tenant admin routes — `POST /admin/v1/tenants` and `POST /admin/v1/admin-tokens` — do **not** use `tenantPath`; they carry their scope in the body (`tenant_id`) per the tables below.

---

## 4. Endpoint reference

All paths below are relative to `VITE_API_BASE_URL`. All `/admin/v1/*` routes require `Authorization: Bearer <adminToken>` and are permission-gated. Types referenced (`RawEvent`, `CustomerProfile`, …) are defined in [Data model & types](07-data-model-and-types.md).

### 4.1 Health / meta (unauthenticated)

| Method | Path            | Purpose                                                                              |
| ------ | --------------- | ------------------------------------------------------------------------------------ |
| GET    | `/healthz`      | Liveness                                                                             |
| GET    | `/readyz`       | Readiness (DB ping)                                                                  |
| GET    | `/metrics`      | Prometheus **text** (not JSON) — dashboard links/embeds Grafana, does not parse this |
| GET    | `/openapi.yaml` | Raw spec (Orval codegen source)                                                      |
| GET    | `/docs`         | Redoc                                                                                |

### 4.2 Principal, Tenants & Sources

| Method | Path                                                         | Permission           | Purpose                                                                                         |
| ------ | ------------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/admin/v1/whoami`                                           | (any valid token)    | Principal for the current token → `{role, tenant_id, is_super_admin}`. Drives auto role-detect  |
| GET    | `/admin/v1/tenants`                                          | **SUPER_ADMIN only** | **List tenants** (full array) → `[{id,name,status,created_at,updated_at}]`; powers the switcher  |
| POST   | `/admin/v1/tenants`                                          | **SUPER_ADMIN only** | Create tenant; body `{name}` → `{id,name,status,created_at,updated_at}`                          |
| GET    | `/admin/v1/tenants/{tenantID}/sources`                       | `source:read`        | **List sources** for the tenant (full array)                                                    |
| POST   | `/admin/v1/tenants/{tenantID}/sources`                       | `source:write`       | Create source; **returns ingest API key ONCE** (`SourceKeyOnce`, prefix `cdp_`)                 |
| POST   | `/admin/v1/tenants/{tenantID}/sources/{sourceID}/rotate-key` | `source:write`       | Rotate key (old key invalid immediately); returns new key once                                  |

### 4.3 Admin tokens

| Method | Path                     | Permission    | Purpose                                                                                                                                                                                                                   |
| ------ | ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/admin/v1/admin-tokens` | `admin:write` | Mint token; body `{name, role, tenant_id}` → `{api_token, role}` (**plaintext `cdpadm_...` shown ONCE**, `AdminTokenOnce`). SUPER_ADMIN mints any role/tenant; TENANT_ADMIN mints only non-super roles for its own tenant |

### 4.4 Raw events

| Method | Path                                                              | Permission     | Purpose                                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/admin/v1/tenants/{tenantID}/events`                             | `event:read`   | **Keyset pagination**. Query: `limit` (default 50, max 500), `cursor` (opaque), filters `identifier_key` (e.g. `user_id:u1`), `event_name`. Response `{events:[...], next_cursor:string}` (`KeysetPage<RawEvent>`) |
| GET    | `/admin/v1/tenants/{tenantID}/events/{eventID}`                   | `event:read`   | Single raw event                                                                                                                                                                                                   |
| POST   | `/admin/v1/tenants/{tenantID}/events/{eventID}/replay`            | `event:replay` | Replay one event                                                                                                                                                                                                   |
| POST   | `/admin/v1/tenants/{tenantID}/replay?identifier_key=...&max=1000` | `event:replay` | Replay all events for an identifier                                                                                                                                                                                |

### 4.5 Profiles

| Method | Path                                                                  | Permission     | Purpose                                                                              |
| ------ | --------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| GET    | `/admin/v1/tenants/{tenantID}/profiles?email=...` or `?phone=...`     | `profile:read` | Search by email OR phone (`400 bad_request` if neither)                              |
| GET    | `/admin/v1/tenants/{tenantID}/profiles/{canonicalUserID}`             | `profile:read` | Profile detail (`CustomerProfile`; traits PII-masked unless `pii:read`)              |
| GET    | `/admin/v1/tenants/{tenantID}/profiles/{canonicalUserID}/identifiers` | `profile:read` | `{canonical_user_id, total, by_namespace, values}` (values masked unless `pii:read`) |

> Per-profile sub-resources (identity-cluster, events-by-profile, segment-memberships-by-profile) are addressed under the profile; where the exact endpoint is not in the spec, mark **TBD — backend gap**.

### 4.6 Consent (per canonicalUserID)

| Method | Path                                                              | Permission      | Purpose                                                                   |
| ------ | ----------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- |
| PUT    | `/admin/v1/tenants/{tenantID}/profiles/{canonicalUserID}/consent` | `consent:write` | Set consent; body `{channel, purpose, status, source?}` → `{status:"ok"}` |
| GET    | `/admin/v1/tenants/{tenantID}/profiles/{canonicalUserID}/consent` | `profile:read`  | `{consent:[{channel,purpose,status,source,updated_at}]}`                  |

Channels: `email, sms, push, ads, webhook`. Purposes: `marketing, analytics, personalization, transactional`. Statuses: `granted, denied, unknown` (absence = unknown). Activation skips `denied` (task status `skipped`).

### 4.7 Governance / GDPR (per canonicalUserID)

| Method | Path                                                             | Permission       | Purpose                                                                                                               |
| ------ | ---------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/v1/tenants/{tenantID}/profiles/{canonicalUserID}/export` | `profile:read`   | Bundle `{profile, identity_nodes:[{namespace,value_hash}], segment_memberships:[{segment_id,status}], consent:[...]}` |
| DELETE | `/admin/v1/tenants/{tenantID}/profiles/{canonicalUserID}`        | `profile:delete` | `{deleted:{<table>:count}}` (audited; requires confirm flow — type the `canonical_user_id`)                           |

### 4.8 Segments

| Method | Path                                                             | Permission         | Purpose                                                                                                       |
| ------ | ---------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| POST   | `/admin/v1/tenants/{tenantID}/segments`                          | `segment:write`    | Create; body `{name, description?, rule}` → `201 Segment`                                                     |
| PUT    | `/admin/v1/tenants/{tenantID}/segments/{segmentID}`              | `segment:write`    | Edit (creates a **new version**)                                                                              |
| DELETE | `/admin/v1/tenants/{tenantID}/segments/{segmentID}`              | `segment:write`    | Deactivate. **Code-only, NOT in openapi.yaml** — Orval won't generate it; hand-write. See gap #5              |
| GET    | `/admin/v1/tenants/{tenantID}/segments/{segmentID}`              | `segment:read`     | Segment detail                                                                                                |
| GET    | `/admin/v1/tenants/{tenantID}/segments/{segmentID}/members`      | `segment:read`     | Active members (no paging params — full array)                                                                |
| GET    | `/admin/v1/tenants/{tenantID}/segments/{segmentID}/destinations` | `destination:read` | Destinations wired to this segment                                                                            |
| GET    | `/admin/v1/tenants/{tenantID}/segments`                          | `segment:read`     | **List all segments** for the tenant (full array)                                                             |

### 4.9 Destinations / Activation

| Method | Path                                                                                       | Permission          | Purpose                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/v1/tenants/{tenantID}/destinations`                                                | `destination:read`  | **List destinations** for the tenant (full array)                                                                  |
| POST   | `/admin/v1/tenants/{tenantID}/destinations`                                                | `destination:write` | Create; body `{type:"webhook"\|"kafka", name, secret?, channel?, purpose?, config}` → `201` (secret never returned) |
| GET    | `/admin/v1/tenants/{tenantID}/destinations/{destinationID}`                                | `destination:read`  | Destination detail                                                                                                  |
| PUT    | `/admin/v1/tenants/{tenantID}/destinations/{destinationID}`                                | `destination:write` | Update (e.g. disable)                                                                                               |
| POST   | `/admin/v1/tenants/{tenantID}/destinations/{destinationID}/subscriptions`                  | `destination:write` | `{trigger_type:"segment_membership", segment_id}`                                                                   |
| DELETE | `/admin/v1/tenants/{tenantID}/destinations/{destinationID}/subscriptions/{subscriptionID}` | `destination:write` | Soft-disable subscription (idempotent)                                                                              |
| GET    | `/admin/v1/tenants/{tenantID}/destinations/{destinationID}/deliveries`                     | `activation:read`   | Delivery attempts (full array)                                                                                      |

Webhook `config`: `{url, method?, headers?{}, timeout_ms?, max_retries?}` + top-level `secret` (HMAC). Kafka `config`: `{topic}`. Implemented types: **webhook, kafka**. Declared-but-deferred (render disabled / "coming soon"): `push, email, crm, ads, warehouse`. Task statuses: `pending, sending, succeeded, failed_retryable, failed_permanent, dlq, skipped` (`skipped` = consent denied).

### 4.10 DLQ

| Method | Path                                                               | Permission  | Purpose                                                                                   |
| ------ | ------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------- |
| GET    | `/admin/v1/tenants/{tenantID}/dlq?status=open\|retried\|discarded` | `dlq:read`  | `{events:[...]}`, default limit 100 (max 500), `failed_at DESC`. Item = `DlqEvent`        |
| POST   | `/admin/v1/tenants/{tenantID}/dlq/{id}/retry`                      | `dlq:retry` | Republish → `{id,status:"retried"}`                                                       |
| POST   | `/admin/v1/tenants/{tenantID}/dlq/{id}/discard`                    | `dlq:retry` | Discard → `{id,status:"discarded"}` (**note: discard shares the `dlq:retry` permission**) |

> No DLQ export / mark-resolved endpoint — only list/retry/discard (gap #4).

### 4.11 Audit log

| Method | Path                                      | Permission   | Purpose                                                                                                                                                                                       |
| ------ | ----------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/v1/tenants/{tenantID}/audit`      | `audit:read` | **Keyset pagination** (same `limit`/`cursor` → `next_cursor` shape as events, §6.2/§8). **Metadata only**: each entry = `{created_at, actor_type, action, resource_type, resource_id}`        |

> The audit read endpoint deliberately returns **metadata only** — there is **no `before`/`after` JSON diff** (omitted for PII reasons). Do not render a before/after diff column. See [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

### 4.12 Stats

| Method | Path                                      | Permission        | Purpose                                                                                                                    |
| ------ | ----------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/v1/tenants/{tenantID}/stats`      | (read set)        | **JSON counts** for the dashboard → `{dlq_open, sources, segments, destinations, profiles}` (real numbers, no Prometheus) |

---

## 5. Orval codegen workflow

Generate TS types + TanStack Query hooks from the backend OpenAPI spec:

1. Fetch the spec: `curl $VITE_API_BASE_URL/openapi.yaml > openapi.yaml` (or point Orval at the URL).
2. Configure `orval.config.ts` with `client: 'react-query'`, mode `tags-split` under `lib/api/generated/`, and the shared Axios `mutator` (`lib/api/axios.ts`) so every generated call inherits the auth + base-URL interceptors.
3. Run codegen: `pnpm orval` (wire as a `pretest`/`predev` script or CI step).
4. Import generated hooks/types in features; do **not** hand-edit generated files.

**Hand-written hooks fill spec gaps** — Orval only generates what's in `openapi.yaml`. Write hooks by hand (in each feature's `hooks/`, using the shared `api` instance) for:

| Gap                           | Reason                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `DELETE .../segments/{id}`    | In code, not in `openapi.yaml` (gap #5)                                                                            |
| Any endpoint the spec omits   | Cross-check against §4 tables; hand-write and keep the shape from [Data model & types](07-data-model-and-types.md) |

Hand-written types that supplement Orval output live in `src/types/` (§4 of the brief / [Data model & types](07-data-model-and-types.md)).

---

## 6. TanStack Query conventions

TanStack Query v5 owns all reads and writes. Use Orval-generated hooks where available; hand-write the rest against the shared Axios instance.

### 6.1 Query-key factory

Keys are always prefixed by tenant so a tenant switch cleanly isolates cache:

```ts
// lib/query/keys.ts
export const qk = {
  events: (t: string) => ({
    list: (filters: { identifier_key?: string; event_name?: string }) =>
      ['t', t, 'events', 'list', filters] as const,
    detail: (id: string) => ['t', t, 'events', 'detail', id] as const,
  }),
  profiles: (t: string) => ({
    search: (q: { email?: string; phone?: string }) => ['t', t, 'profiles', 'search', q] as const,
    detail: (cuid: string) => ['t', t, 'profiles', cuid] as const,
    identifiers: (cuid: string) => ['t', t, 'profiles', cuid, 'identifiers'] as const,
    consent: (cuid: string) => ['t', t, 'profiles', cuid, 'consent'] as const,
  }),
  segments: (t: string) => ({
    all: () => ['t', t, 'segments'] as const,
    detail: (id: string) => ['t', t, 'segments', id] as const,
    members: (id: string) => ['t', t, 'segments', id, 'members'] as const,
    destinations: (id: string) => ['t', t, 'segments', id, 'destinations'] as const,
  }),
  destinations: (t: string) => ({
    all: () => ['t', t, 'destinations'] as const,
    detail: (id: string) => ['t', t, 'destinations', id] as const,
    deliveries: (id: string) => ['t', t, 'destinations', id, 'deliveries'] as const,
  }),
  dlq: (t: string) => ({
    list: (status?: string) => ['t', t, 'dlq', status ?? 'open'] as const,
  }),
  sources: (t: string) => ({ all: () => ['t', t, 'sources'] as const }),
} as const;
```

### 6.2 Events use `useInfiniteQuery`

Events and the audit log are the cursor-paginated resources (both use the same `limit`/`cursor` → `next_cursor` keyset shape); everything else returns full arrays. The `useInfiniteQuery` pattern below applies to audit too.

```ts
// features/events/hooks/useEvents.ts
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api/axios';
import { tenantPath } from '../../../lib/api/tenantPath';
import { qk } from '../../../lib/query/keys';
import type { KeysetPage, RawEvent } from '../../../types';

export function useEvents(
  tenantId: string,
  filters: { identifier_key?: string; event_name?: string },
) {
  return useInfiniteQuery({
    queryKey: qk.events(tenantId).list(filters),
    initialPageParam: '' as string,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<KeysetPage<RawEvent>>(tenantPath(tenantId, '/events'), {
        params: { limit: 50, cursor: pageParam || undefined, ...filters },
      });
      return data;
    },
    // empty next_cursor => no more pages
    getNextPageParam: (last) => last.next_cursor || undefined,
  });
}
```

Feed `data.pages.flatMap(p => p.events)` into the MUI X Data Grid in **server mode**, driving `fetchNextPage()` from paging/scroll. Do not use page numbers for events.

### 6.3 Mutation → invalidation map

Every mutation invalidates the keys its write affects. One-time-secret responses are surfaced via the dialog (§8) **before** invalidation.

| Mutation (endpoint)                                   | Invalidates                                                         | Notes                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| Create source (`POST .../sources`)                    | `qk.sources(t).all()`                                               | Show `SourceKeyOnce` in OneTimeSecretDialog |
| Rotate key (`POST .../sources/{id}/rotate-key`)       | `qk.sources(t).all()`                                               | Show new key once; old key dead immediately |
| Mint admin token (`POST /admin/v1/admin-tokens`)      | admin-tokens list key                                               | Show `AdminTokenOnce` in dialog             |
| Create tenant (`POST /admin/v1/tenants`)              | tenants list key                                                    | SUPER_ADMIN only                            |
| Replay event (`POST .../events/{id}/replay`)          | `qk.events(t).list(*)`                                              | Async — show processing-lag hint            |
| Replay by identifier (`POST .../replay`)              | `qk.events(t).list(*)`                                              | Async                                       |
| Set consent (`PUT .../consent`)                       | `qk.profiles(t).consent(cuid)`                                      | —                                           |
| GDPR delete (`DELETE .../profiles/{cuid}`)            | `qk.profiles(t).detail(cuid)`, search keys                          | Confirm flow; profile now gone              |
| Create segment (`POST .../segments`)                  | `qk.segments(t).all()`                                              | —                                           |
| Edit segment (`PUT .../segments/{id}`)                | `qk.segments(t).detail(id)`, `.all()`, `.members(id)`               | Creates new version                         |
| Deactivate segment (`DELETE .../segments/{id}`)       | `qk.segments(t).all()`, `.detail(id)`                               | Hand-written (gap #5)                       |
| Create destination (`POST .../destinations`)          | `qk.destinations(t).all()`                                          | Secret never returned                       |
| Update destination (`PUT .../destinations/{id}`)      | `qk.destinations(t).detail(id)`, `.all()`                           | e.g. disable                                |
| Add subscription (`POST .../subscriptions`)           | `qk.destinations(t).detail(id)`, `qk.segments(t).destinations(seg)` | —                                           |
| Delete subscription (`DELETE .../subscriptions/{id}`) | `qk.destinations(t).detail(id)`                                     | Idempotent                                  |
| DLQ retry (`POST .../dlq/{id}/retry`)                 | `qk.dlq(t).list(*)`                                                 | Async                                       |
| DLQ discard (`POST .../dlq/{id}/discard`)             | `qk.dlq(t).list(*)`                                                 | Confirm flow; `dlq:retry` perm              |

> Because identity → profile → segmentation → activation is **asynchronous**, invalidations often won't show fresh results immediately. Pair replay/ingest-affecting mutations with the "processing — data may take a few seconds; refresh to see updates" affordance rather than optimistic UI.

---

## 7. Error handling

All errors use one envelope (`pkg/apierror`):

```json
{ "error": { "code": "string", "message": "string" } }
```

Code → HTTP status:

| `error.code`        | HTTP | Notes                                                                                |
| ------------------- | ---- | ------------------------------------------------------------------------------------ |
| `bad_request`       | 400  | Map to form fields where possible (e.g. profile search with neither email nor phone) |
| `unauthorized`      | 401  | Bad/missing token                                                                    |
| `forbidden`         | 403  | Missing permission OR tenant-scope violation                                         |
| `not_found`         | 404  | —                                                                                    |
| `conflict`          | 409  | —                                                                                    |
| `payload_too_large` | 413  | —                                                                                    |
| `rate_limited`      | 429  | `Retry-After` header, integer seconds                                                |
| `internal_error`    | 500  | —                                                                                    |
| `not_ready`         | 503  | Readiness failure                                                                    |

Central **response interceptor** behavior:

```ts
// lib/api/axios.ts (continued)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const env = err.response?.data as { error?: { code: string; message: string } } | undefined;
    const message = env?.error?.message ?? 'Request failed';

    if (status === 401) {
      clearToken();
      redirectTo('/connect'); // bad/missing token
    } else if (status === 403) {
      toast.error(message); // permission or tenant scope — do NOT log out
    } else if (status === 429) {
      const retry = Number(err.response?.headers['retry-after'] ?? 0);
      toast.warning(`Rate limited — retry in ${retry}s`);
    } else {
      toast.error(message); // 400/404/409/413/500/503 — surface to user
    }
    return Promise.reject(err);
  },
);
```

- `bad_request` (400) surfaced from a form should also be mapped to field-level errors by the form layer (React Hook Form + Zod), not just a toast. See [Design system](06-design-system.md) form conventions.

---

## 8. Pagination

Two distinct patterns — do not mix them:

| Pattern                     | Applies to                                                                                 | Mechanism                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Keyset / cursor**         | `GET .../events` and `GET .../audit`                                                       | `limit` (default 50, max 500) + opaque `cursor` → `next_cursor`. Data Grid in **server mode** with cursor state; `useInfiniteQuery` (§6.2). Empty `next_cursor` = last page. Never page numbers. |
| **Filter-only, full array** | profiles (email/phone), dlq (status), segment members, deliveries, consent, replay results | API returns the whole array. Render with the Data Grid in **client mode** (client-side paging/sorting/filtering).                                                                                |

---

## 9. One-time secrets

Three responses return a plaintext secret **exactly once** and it can never be retrieved again:

| Trigger                          | Response type                                           | Prefix    |
| -------------------------------- | ------------------------------------------------------- | --------- |
| Create source / rotate key       | `SourceKeyOnce` (`{api_key}`)                           | `cdp_`    |
| Mint admin token                 | `AdminTokenOnce` (`{api_token, role}`)                  | `cdpadm_` |
| Create destination with `secret` | (echoed input only — the server never returns it after) | —         |

The client must surface these through the shared **`OneTimeSecretDialog`** ([Design system](06-design-system.md)): show the value once, a large copy button, an explicit "you cannot see this value again" warning, and require an explicit confirm to close. Do this in the mutation's `onSuccess` **before** cache invalidation. Never persist these values in the query cache or logs.

---

## 10. Appendix — Ingress endpoints (help-text only)

The console **never authenticates with source keys** and never calls ingress. These paths appear only in the Sources "instrument your source" help text for hand-off to the customer's engineers.

| Method | Path               | Notes                                           |
| ------ | ------------------ | ----------------------------------------------- |
| GET    | `/v1/auth/whoami`  | → `{tenant_id, source_id}` (source-key context) |
| POST   | `/v1/events/track` | `202 Accepted`                                  |
| POST   | `/v1/identify`     | `202`                                           |
| POST   | `/v1/alias`        | `202`                                           |
| POST   | `/v1/events/batch` | ≤ 500 events, `202`                             |

Ingress auth: `X-CDP-Api-Key: <key>` **or** `Authorization: Bearer <key>`; key format `cdp_...`.

> **Header mismatch (gap #6):** backend code checks **`X-CDP-Api-Key`**, but CORS advertises **`X-Api-Key`**. The instrumentation help text must show `X-CDP-Api-Key` (what the code actually validates) and note the discrepancy. See [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

> Ingest returns `202` and the pipeline is asynchronous — instrumentation help must set the "send, then wait a few seconds, then refresh" expectation.
