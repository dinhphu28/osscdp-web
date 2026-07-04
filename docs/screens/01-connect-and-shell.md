# Connect (Token Entry) & App Shell

The token-entry screen and the persistent app shell/navigation that hosts every tenant-scoped feature.

---

## Purpose

osscdp uses **token-only auth** — there is **NO user login, NO username/password, NO session, NO JWT, NO users table**. The operator pastes a pre-issued **admin Bearer token** on the Connect screen. Once validated and stored, the token authorizes every `/admin/v1/*` request. The App Shell then wraps all tenant-scoped routes with a nav rail, top bar (tenant switcher, connected-as chip, theme toggle, disconnect), breadcrumb, and content `<Outlet>`.

Two screens are documented here:
1. **Connect** (`/connect`) — paste token, optional base-URL override, optional role declaration, validate, store, route on.
2. **App Shell** — persistent layout for `/t/:tenantId/*`.

---

## Route(s)

| Route | Screen | Notes |
|---|---|---|
| `/` | Redirect | No token → `/connect`. Token present → tenant picker or last-used `/t/:tenantId/dashboard`. |
| `/connect` | Connect / token entry | Paste token, optional role + base-URL override, validate, store. |
| `/t/:tenantId` | App Shell (layout route) | Wraps all feature children with nav rail + top bar + breadcrumb + `<Outlet>`. |

The App Shell is a React Router **layout route** at `/t/:tenantId`; feature screens render into its `<Outlet>`. See [Data model & types](../07-data-model-and-types.md) and [API integration](../04-api-integration.md) for shared plumbing.

---

## Required permission(s)

- **Connect screen:** none (unauthenticated by nature — it is where the token is first entered). Validation performs a benign authenticated GET; the token's own permissions govern what succeeds.
- **App Shell:** requires a stored token (else redirect to `/connect`). Individual nav links are gated by the current role's permissions computed from the **role→permission table** (below). Gating is UX only — the server also enforces with `403`.

---

## API calls used (exact paths)

The console holds **no `whoami`/principal endpoint** — there is no admin route to ask the API for the current token's role/permissions (documented gap; see [Backend gaps & caveats](../10-backend-gaps-and-caveats.md)). Validation therefore attempts a **cheap, benign authenticated admin GET** and interprets the HTTP status.

| Purpose | Method & path | Interpretation |
|---|---|---|
| Token validation (super-admin path) | `GET /healthz` then a benign admin GET, e.g. `GET /admin/v1/tenants/{tenantID}/events?limit=1` | `200/202` → token accepted for that tenant; `401` → bad/missing token (reject); `403` → token valid but lacks permission or tenant scope (still a valid token — treat as connected, warn). |
| Liveness (base-URL reachability) | `GET /healthz` | Confirms the base URL is reachable before probing auth. Unauthenticated. |
| Readiness (optional) | `GET /readyz` | DB ping; optional secondary check. Unauthenticated. |

Notes:
- `GET /healthz`, `GET /readyz` are **unauthenticated** and only prove the base URL is reachable — they do NOT validate the token. Use them for the base-URL override check.
- The authenticated probe needs a tenant. For a **non-super** token the operator supplies the pinned tenant UUID; for a **super-admin** token any known tenant UUID works. If no tenant is available yet, the probe may return `403 tenant scope violation` — treat as "token appears valid, tenant unknown" and route to tenant selection.
- A dedicated "list all tenants" endpoint for super-admin is **TBD — backend gap** (see [Backend gaps & caveats](../10-backend-gaps-and-caveats.md)); until it exists, super-admin enters the tenant UUID manually.
- The ingress `GET /v1/auth/whoami` is for **source API keys**, NOT admin tokens — do NOT call it from the console.

All admin requests carry `Authorization: Bearer <adminToken>`. No refresh, no expiry: `401` = bad/missing token, `403` = missing permission or tenant-scope violation.

---

## Layout & components

### Connect screen (`/connect`)

```
┌────────────────────────────────────────────────┐
│  osscdp admin console                          │
│                                                │
│  Connect with an admin token                   │
│  ┌──────────────────────────────────────────┐  │
│  │ Admin token  (password field)  [cdpadm_…] │  │
│  └──────────────────────────────────────────┘  │
│  ▸ Advanced                                     │
│    Base URL override  [http://localhost:8080]   │
│    I am a …  (role select — see note)           │
│    Tenant UUID (for validation)  [optional]     │
│                                                │
│  [ Connect ]        (error alert on 401)        │
│                                                │
│  Why no username/password?  (helper text)       │
└────────────────────────────────────────────────┘
```

Components:
- **Token field** — masked (`type=password`) with a show/hide toggle; placeholder hints the `cdpadm_` prefix. The static bootstrap token (backend env `ADMIN_API_TOKEN`) authenticates as `SUPER_ADMIN`; minted tokens use prefix `cdpadm_` and carry a role + tenant.
- **Base-URL override** (collapsible "Advanced") — defaults to `VITE_API_BASE_URL` (dev `http://localhost:8080`; docker `stack-up` maps `http://localhost:18080`). Persisted alongside the token so all subsequent requests use it.
- **Role declaration** (select) — because there is **no admin `whoami`**, the operator declares their role so the UI can gate features correctly. Options are the six `AdminRole` values. Include explanatory helper text (below). Default to least-privilege (`VIEWER`) if left unset.
- **Tenant UUID** (optional) — used only to run the validation probe; also seeds the first tenant for non-super tokens.
- **Connect button** — disabled while validating; shows inline error alert on `401`.
- **"Why no login?" helper** — one paragraph explaining token-only auth.

**Why no username/password (helper copy):**
> osscdp has no user accounts or login. Access is granted by pre-issued **admin Bearer tokens** minted by an administrator (`POST /admin/v1/admin-tokens`). Paste the token you were given; it is stored only in your browser and sent as `Authorization: Bearer …` on every request. There is no session and no password.

**Role-declaration helper copy:**
> The API has no way to tell the console which role your token holds, so pick the role your token was minted with. This only controls which buttons/menus the console shows you — the server still enforces the real permissions and will return `403` if you attempt something your token can't do.

### App Shell (`/t/:tenantId`)

```
┌───────────┬────────────────────────────────────────────────┐
│ NAV RAIL  │ TOP BAR: [tenant switcher ▾] … [connected as    │
│           │           MARKETER] [🌓 theme] [Disconnect]      │
│ Dashboard ├────────────────────────────────────────────────┤
│ Sources   │ Breadcrumb: Tenant / Segments / New             │
│ Events    ├────────────────────────────────────────────────┤
│ Profiles  │                                                 │
│ Segments  │   <Outlet />  (active feature screen)           │
│ Activation│                                                 │
│ DLQ       │                                                 │
│ Admin     │                                                 │
│ Audit*    │                                                 │
└───────────┴────────────────────────────────────────────────┘
```

- **Nav rail** — feature links, each gated by the current role's permissions (hide or disable + tooltip). See mapping below.
- **Top bar**:
  - **Tenant switcher** — super-admin can change tenant; non-super shows the single pinned tenant (or is hidden). See behavior below.
  - **Connected-as chip** — displays the declared role, e.g. `connected as MARKETER`.
  - **Theme toggle** — light/dark via MUI theme; persist to `localStorage`.
  - **Disconnect** — clears the stored token and routes to `/connect`.
- **Breadcrumb** — derived from the route (tenant → feature → sub-page).
- **Content `<Outlet>`** — the active feature screen.

### Nav rail → route → gating permission

| Nav item | Route | Gating perm(s) |
|---|---|---|
| Dashboard | `/t/:tenantId/dashboard` | none (always visible when connected) |
| Sources | `/t/:tenantId/sources` | `source:read` |
| Events | `/t/:tenantId/events` | `event:read` |
| Profiles | `/t/:tenantId/profiles` | `profile:read` |
| Segments | `/t/:tenantId/segments` | `segment:read` |
| Activation | `/t/:tenantId/destinations` | `destination:read` / `activation:read` |
| DLQ | `/t/:tenantId/dlq` | `dlq:read` |
| Administration | `/t/:tenantId/administration` | `admin:write` (super-admin also sees Tenants) |
| Audit* | `/t/:tenantId/audit` | `audit:read` — **Phase 2 / backend gap** (no read endpoint yet; show "requires backend endpoint" banner) |

---

## Data & TS types

Copy these names verbatim from [Data model & types](../07-data-model-and-types.md). The connect/shell layer introduces a small client-only auth/tenant state on top of them.

```ts
export type AdminRole =
  | 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'MARKETER'
  | 'ANALYST' | 'OPERATOR' | 'VIEWER';

export type Permission =
  | 'source:read' | 'source:write' | 'event:read' | 'event:replay'
  | 'profile:read' | 'profile:delete' | 'segment:read' | 'segment:write'
  | 'destination:read' | 'destination:write' | 'activation:read'
  | 'dlq:read' | 'dlq:retry' | 'audit:read' | 'consent:write'
  | 'pii:read' | 'admin:write';

export interface ApiError { error: { code: string; message: string }; }

// Client-only auth session (persisted to localStorage; never from the API)
export interface AdminSession {
  token: string;            // pasted admin Bearer token (cdpadm_… or bootstrap)
  baseUrl: string;          // resolved base URL (override or VITE_API_BASE_URL)
  declaredRole: AdminRole;  // operator-declared, since there is no whoami
  tenantId?: string;        // pinned tenant for non-super tokens; undefined for super-admin until picked
}
```

### Role → permission table (canonical — hold client-side; copy exactly)

Read set = `source:read, event:read, profile:read, segment:read, destination:read, activation:read, audit:read, dlq:read`.

| Role | Permissions |
|---|---|
| `SUPER_ADMIN` | ALL permissions; cross-tenant (tenant = nil, can switch tenants) |
| `TENANT_ADMIN` | ALL permissions, scoped to its own tenant |
| `MARKETER` | read set + `segment:write`, `destination:write`, `consent:write` |
| `ANALYST` | read set only |
| `OPERATOR` | read set + `dlq:retry`, `event:replay` |
| `VIEWER` | read set only |

`pii:read`, `admin:write`, `profile:delete` are ONLY in `SUPER_ADMIN` / `TENANT_ADMIN`. Compute the current role's permission set from this table to gate the nav rail and every action (`<RequirePerm perm="…">`). Gating is **UX, not security** — the server also enforces with `403`.

```ts
// role→perm derivation used by <RequirePerm> and the nav rail
const READ_SET: Permission[] = [
  'source:read', 'event:read', 'profile:read', 'segment:read',
  'destination:read', 'activation:read', 'audit:read', 'dlq:read',
];
export function permsForRole(role: AdminRole): Set<Permission> {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'TENANT_ADMIN':
      return new Set(/* ALL Permission values */);
    case 'MARKETER':
      return new Set([...READ_SET, 'segment:write', 'destination:write', 'consent:write']);
    case 'OPERATOR':
      return new Set([...READ_SET, 'dlq:retry', 'event:replay']);
    case 'ANALYST':
    case 'VIEWER':
    default:
      return new Set(READ_SET);
  }
}
```

### Token & base-URL storage

- Persist `AdminSession` in `localStorage` (no cookies — backend runs `AllowCredentials: false`, so the token must travel in the `Authorization` header, never a cookie).
- The Axios request interceptor reads `token` + `baseUrl` from the store and injects `Authorization: Bearer <token>`; a `tenantPath(tenantId, suffix)` helper builds `/admin/v1/tenants/${tenantId}${suffix}`. See [API integration](../04-api-integration.md).

```tsx
// Connect submit (React Hook Form + Zod): validate then store then route
async function onConnect(values: ConnectForm) {
  const base = values.baseUrl || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
  await axios.get(`${base}/healthz`);                    // base URL reachable?
  try {
    await axios.get(`${base}/admin/v1/tenants/${values.tenantId}/events`, {
      params: { limit: 1 },
      headers: { Authorization: `Bearer ${values.token}` },
    });
  } catch (e) {
    if (isStatus(e, 401)) throw new Error('Invalid admin token (401).');
    if (!isStatus(e, 403)) throw e; // 403 = valid token, no perm/scope → still connected
  }
  setSession({ token: values.token, baseUrl: base, declaredRole: values.role, tenantId: values.tenantId });
  navigate(values.tenantId ? `/t/${values.tenantId}/dashboard` : '/'); // '/' → tenant picker
}
```

---

## States (loading / empty / error)

### Connect screen
- **Idle** — form ready; Connect enabled once a token is present.
- **Validating** — Connect disabled + spinner while `GET /healthz` and the benign admin probe run.
- **Error — base URL unreachable** — network error / no `2xx` from `/healthz`: inline alert "Cannot reach API at `<baseUrl>` — check the base URL and that CORS allows this origin." (Backend must set `CORS_ALLOWED_ORIGINS` to the console origin; allowed headers include `Authorization, Content-Type, Accept, X-Api-Key`.)
- **Error — 401** — inline alert "Invalid or missing admin token (401)." Do NOT store the token.
- **Warn — 403** — token accepted but the probe lacked permission/scope: proceed to connected state, but surface a non-blocking toast "Token valid, but this action was forbidden (403) — some features may be hidden."
- **Success** — token stored; route to tenant selection or `/t/:tenantId/dashboard`.

### App Shell
- **No token** — any `/t/:tenantId/*` load without a stored token redirects to `/connect`.
- **Loading** — feature `<Outlet>` shows its own skeletons; the shell chrome renders immediately.
- **401 during use** — the Axios response interceptor clears the token and redirects to `/connect` (see auto-redirect below).
- **403 during use** — toast (permission or tenant-scope); the shell stays put.
- **Empty tenant** — super-admin with no tenant selected lands on the tenant picker rather than a feature screen.

---

## Actions & confirmations

| Action | Trigger | Behavior |
|---|---|---|
| **Connect** | Submit on `/connect` | Validate (base URL + benign admin probe), store `AdminSession`, route to tenant selection or dashboard. `401` blocks; `403` warns but proceeds. |
| **Switch tenant** | Tenant switcher (super-admin) | Update `session.tenantId`, navigate to `/t/:newTenantId/dashboard`, invalidate tenant-scoped queries. Non-super: switcher pinned/hidden. |
| **Toggle theme** | Theme button | Flip light/dark; persist to `localStorage`. No confirmation. |
| **Disconnect** | Disconnect button | Clear the stored token/session from `localStorage` and route to `/connect`. Recommend a lightweight `ConfirmDialog` ("Disconnect and clear your token from this browser?") since the token cannot be recovered from the API. |
| **401 auto-redirect** | Any admin request returns `401` | Response interceptor clears token + redirects to `/connect` with a toast "Session ended — please reconnect." |

```ts
// Axios response interceptor: 401 → clear token + redirect to /connect
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const code = err.response?.status;
    if (code === 401) { authStore.clear(); router.navigate('/connect'); }
    else if (code === 403) { toast.warning('Forbidden (permission or tenant scope).'); }
    else if (code === 429) { /* respect Retry-After header (int seconds) */ }
    return Promise.reject(err);
  }
);
```

### Tenant switcher behavior

- **Super-admin** (`SUPER_ADMIN`, token tenant = nil): can access any tenant. Switcher allows **manual tenant UUID entry**. A picklist of tenants is **TBD — backend gap** (no confirmed "list all tenants" endpoint; see [Backend gaps & caveats](../10-backend-gaps-and-caveats.md)) — render manual UUID entry now, upgrade to a list when the endpoint exists.
- **Non-super** (`TENANT_ADMIN`, `MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER`): pinned to a single tenant. The switcher shows only that tenant (read-only) or is hidden entirely. Attempting another tenant would yield `403 tenant scope violation`.
- The tenant is always the `{tenantID}` **URL path segment** — never sent in body or header. A `TenantProvider` holds the current tenant; the Axios layer injects it into admin paths.

---

## RBAC & PII notes

- **RBAC:** the shell computes the current role's permission set from the role→permission table (declared role, since there is no `whoami`) and gates nav items and actions via `<RequirePerm>`. Disabled actions carry a tooltip "requires `<perm>`". Server-side `403` remains the real enforcement — UI gating is UX only.
- **Declared-role caveat:** the declared role may not match the token's true role. If the operator over-declares (e.g. picks `TENANT_ADMIN` for a `VIEWER` token), extra buttons will appear but their requests will return `403`; the interceptor surfaces this as a toast. Default unknown/unset to least-privilege (`VIEWER`).
- **PII:** the shell renders no customer PII itself. PII masking is entirely server-side — traits (email/phone/name) come back masked (`u***@x.com`, `+8490****567`, `N***`) unless the token holds `pii:read`. The console never attempts client-side unmasking. (Relevant to feature screens, not the shell chrome.)
- **Token handling:** the admin token is a secret — store in `localStorage` only, never log it, never place it in a cookie (`AllowCredentials: false`), and mask it in the input field.

---

## Acceptance criteria (checklist)

- [ ] `/connect` renders a **paste-token** flow (masked field, show/hide) — **no username/password fields** anywhere.
- [ ] A "why no login?" helper explains token-only auth.
- [ ] "Advanced" reveals a **base-URL override** defaulting to `VITE_API_BASE_URL` (dev `http://localhost:8080`; docker `http://localhost:18080`), persisted with the session.
- [ ] A **role-declaration** select (six `AdminRole` values) with helper text explaining it exists because there is no admin `whoami`; unset defaults to least-privilege `VIEWER`.
- [ ] Connect **validates** the token via `GET /healthz` (base reachable) then a benign authenticated admin GET; `401` blocks and shows an inline error without storing the token.
- [ ] `403` during validation is treated as a **valid token** (stored) with a non-blocking warning.
- [ ] On success the token is stored in `localStorage` (never a cookie) and the user is routed to **tenant selection** or `/t/:tenantId/dashboard`.
- [ ] `/` redirects to `/connect` when no token is stored; otherwise to tenant picker / last tenant.
- [ ] App Shell renders **nav rail** (perm-gated links), **top bar** (tenant switcher, connected-as-`<role>` chip, theme toggle, disconnect), **breadcrumb**, and content **`<Outlet>`**.
- [ ] Nav links are hidden/disabled per the **role→permission table** computed from the declared role; disabled actions show a "requires `<perm>`" tooltip.
- [ ] **Tenant switcher**: super-admin can enter a tenant UUID manually (list endpoint marked TBD — backend gap); non-super is pinned to one tenant (switcher read-only or hidden).
- [ ] **Theme toggle** switches light/dark and persists to `localStorage`.
- [ ] **Disconnect** clears the stored token/session and routes to `/connect` (with a confirm dialog).
- [ ] Any admin request returning **`401` auto-redirects** to `/connect` and clears the token; `403` shows a toast; `429` respects `Retry-After`.
- [ ] The admin token travels only in the `Authorization: Bearer` header; the app never calls ingress `GET /v1/auth/whoami` from the console.
- [ ] The **Audit** nav item is present but marked Phase 2 / backend gap (see [Backend gaps & caveats](../10-backend-gaps-and-caveats.md)).
