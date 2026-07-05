# Auth, RBAC & Multi-Tenancy

> The token-only auth model, client-side permission gating, tenant context/switcher, and PII masking behavior for the osscdp admin console.

This document is prescriptive. Copy the role→permission table, permission strings, and enum values verbatim into code. Related docs: [API integration](04-api-integration.md) · [Data model & types](07-data-model-and-types.md) · [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## 1. Token-only authentication

There is **NO user login, NO username/password, NO session, NO JWT, NO users table**. The console authenticates with a single pasted **admin Bearer token**. Build a "paste your admin token" flow (`/connect`), NOT a login form.

### Auth rules (exact)

- Every `/admin/v1/*` request sends `Authorization: Bearer <adminToken>`.
- **No refresh, no expiry.** A token is valid until revoked backend-side.
- `401` = bad/missing token → clear the stored token and redirect to `/connect`.
- `403` = missing permission **OR** tenant-scope violation → toast; do not clear the token.

### Two kinds of admin token

| Token                      | Origin                                              | Role                | Scope                                    |
| -------------------------- | --------------------------------------------------- | ------------------- | ---------------------------------------- |
| **Static bootstrap token** | Backend env `ADMIN_API_TOKEN`                       | `SUPER_ADMIN`       | Cross-tenant (tenant = nil)              |
| **Minted token**           | `POST /admin/v1/admin-tokens` (prefix `cdpadm_...`) | Any role (per mint) | Pinned to one `tenant_id` (except super) |

> Do not confuse admin tokens with **source API keys** (prefix `cdp_...`). Source keys authenticate the ingress API only; the admin console never authenticates with them — it only provisions them for hand-off. See [API integration](04-api-integration.md).

### AuthProvider / useAuth

`lib/auth/` holds the token store and provider.

- **Storage:** in-memory by default; **optionally** mirrored to `sessionStorage` so a page refresh survives (see [Security notes](#7-security-notes)). Never `localStorage` for the token.
- `AuthProvider` exposes `useAuth()` → `{ token, role, connect(token, baseUrlOverride?), disconnect() }`.
- On connect the provider calls `GET /admin/v1/whoami` to resolve the role + pinned tenant (see §2). An optional `role` override is accepted only as the `whoami`-404 fallback.
- The Axios request interceptor reads the token from this store and sets the `Authorization` header (see [API integration](04-api-integration.md)).
- The Axios response interceptor calls `disconnect()` on `401` and redirects to `/connect`.

```tsx
// lib/auth/AuthProvider.tsx (illustrative)
interface AuthState {
  token: string | null;
  role: AdminRole; // resolved from GET /admin/v1/whoami (see §2); manual pick only on 404 fallback
  connect: (token: string, baseUrl?: string, roleFallback?: AdminRole) => void;
  disconnect: () => void; // clears token (memory + sessionStorage) → navigate('/connect')
}
```

---

## 2. Role & tenant from `whoami` (fallback to a manual picker)

**The console resolves the role from `GET /admin/v1/whoami`** at connect. The response is
`{ role, tenant_id, is_super_admin }`: `role` seeds RBAC gating, `tenant_id` pins the tenant for
non-super tokens, and `is_super_admin` drives cross-tenant behavior (the tenant switcher / SelectTenant).

Required approach:

- On connect, call `whoami` and store the returned `role` + `tenant_id`. The console holds the **canonical role→permission table** (below) client-side and computes the current permission set from that role.
- **Fallback (404 only):** if the backend lacks the endpoint and returns `404` (older build), fall back to a **manual role picker** on `/connect`. Default an unknown/unselected role to least-privilege (`VIEWER` read-set) and let the server reveal capability via `403`s.
- Do **not** confuse this with the ingress `GET /v1/auth/whoami`, which is for source keys — never call it from the console.

**Trade-off (fallback path only):** a manually-declared role is unverified — a user could pick `SUPER_ADMIN` while holding a `VIEWER` token. This only affects **UI affordances**; the server still enforces every permission and returns `403` on real attempts. Client-side gating is UX, not security.

---

## 3. RBAC — roles & permissions (canonical, copy exactly)

**6 roles:** `SUPER_ADMIN`, `TENANT_ADMIN`, `MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER`.

**17 permissions:** `source:read`, `source:write`, `event:read`, `event:replay`, `profile:read`, `profile:delete`, `segment:read`, `segment:write`, `destination:read`, `destination:write`, `activation:read`, `dlq:read`, `dlq:retry`, `audit:read`, `consent:write`, `pii:read`, `admin:write`.

**Read set** = `source:read, event:read, profile:read, segment:read, destination:read, activation:read, audit:read, dlq:read`.

### Role → permission table

| Role           | Permissions                                                      |
| -------------- | ---------------------------------------------------------------- |
| `SUPER_ADMIN`  | ALL permissions; cross-tenant (tenant = nil, can switch tenants) |
| `TENANT_ADMIN` | ALL permissions, scoped to its own tenant                        |
| `MARKETER`     | read set + `segment:write`, `destination:write`, `consent:write` |
| `ANALYST`      | read set only                                                    |
| `OPERATOR`     | read set + `dlq:retry`, `event:replay`                           |
| `VIEWER`       | read set only                                                    |

Notes: `pii:read`, `admin:write`, `profile:delete` are ONLY in `SUPER_ADMIN` / `TENANT_ADMIN`. Note also that **`dlq:retry` covers discard** (both DLQ retry and discard actions are gated on `dlq:retry`).

### ROLE_PERMISSIONS map (build this in `lib/auth/`)

```ts
// lib/auth/permissions.ts
const READ_SET: Permission[] = [
  'source:read',
  'event:read',
  'profile:read',
  'segment:read',
  'destination:read',
  'activation:read',
  'audit:read',
  'dlq:read',
];

const ALL: Permission[] = [
  ...READ_SET,
  'source:write',
  'event:replay',
  'profile:delete',
  'segment:write',
  'destination:write',
  'dlq:retry',
  'consent:write',
  'pii:read',
  'admin:write',
];

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  SUPER_ADMIN: ALL,
  TENANT_ADMIN: ALL,
  MARKETER: [...READ_SET, 'segment:write', 'destination:write', 'consent:write'],
  ANALYST: READ_SET,
  OPERATOR: [...READ_SET, 'dlq:retry', 'event:replay'],
  VIEWER: READ_SET,
};
```

---

## 4. Client-side permission gating

Gating is **UX only** — the server also enforces every permission and returns `403`. Never rely on gating for security; its purpose is to hide/disable actions the current role can't perform so operators aren't led into guaranteed `403`s.

### usePermissions()

```ts
// lib/auth/usePermissions.ts
export function usePermissions() {
  const { role } = useAuth();
  const perms = new Set(ROLE_PERMISSIONS[role] ?? []); // unknown role → least privilege
  return {
    has: (p: Permission) => perms.has(p),
    hasAny: (ps: Permission[]) => ps.some((p) => perms.has(p)),
  };
}
```

### <RequirePerm>

Wrap actions (buttons, menu items) in `<RequirePerm perm="...">`. Default behavior: render the child **disabled with a tooltip** `requires <perm>` when the permission is missing (so the affordance is discoverable). Use `hide` to omit entirely instead.

```tsx
// lib/auth/RequirePerm.tsx (illustrative)
export function RequirePerm({
  perm,
  hide = false,
  children,
}: {
  perm: Permission;
  hide?: boolean;
  children: React.ReactElement;
}) {
  const { has } = usePermissions();
  if (has(perm)) return children;
  if (hide) return null;
  return (
    <Tooltip title={`requires ${perm}`}>
      {/* span wrapper so the tooltip works on a disabled control */}
      <span>{React.cloneElement(children, { disabled: true })}</span>
    </Tooltip>
  );
}
```

Usage:

```tsx
<RequirePerm perm="segment:write">
  <Button onClick={openCreateSegment}>New segment</Button>
</RequirePerm>
```

**Rule:** every write/destructive action must be wrapped. Read-only screens gate on the corresponding `:read` permission at the route/nav level (hide nav items the role can't read).

---

## 5. Multi-tenancy

- **Tenant = the `{tenantID}` UUID path segment.** Never send tenant in body or header — it is always in the URL path (`/admin/v1/tenants/{tenantID}/...`).
- Frontend route shape: `/t/:tenantId/<feature>`. A `TenantProvider` (`lib/tenant/`) holds the current tenant; the Axios layer injects `{tenantID}` into admin paths via a `tenantPath(tenantId, suffix)` helper. See [API integration](04-api-integration.md).
- Onboarding is admin-driven (no self-serve signup): `SUPER_ADMIN` creates a tenant → mints a `TENANT_ADMIN` token → creates sources.

### TenantProvider / useTenant

```ts
// lib/tenant/useTenant.ts
export function useTenant() {
  // reads :tenantId from the route; exposes current tenant + setter used by the switcher
  return { tenantId: string, setTenant: (id: string) => void /* navigates /t/:id/... */ };
}
```

### Tenant switcher

| Declared role              | Switcher behavior                                                    |
| -------------------------- | -------------------------------------------------------------------- |
| `SUPER_ADMIN` (tenant nil) | Cross-tenant → show a switcher listing all tenants                   |
| All other roles            | Pinned to one tenant → switcher shows only that tenant, or is hidden |

**Super-admin tenant list:** `GET /admin/v1/tenants` (super-admin) now returns a real tenant list, so SelectTenant and the switcher render an actual picker. Manual tenant-ID entry (paste a UUID) is kept as a **secondary/fallback** path.

### 403 tenant-scope violation

A `403` may mean either a missing permission **or** a tenant-scope violation (a non-super token accessing a tenant it isn't pinned to). The response envelope is `{ "error": { "code": "forbidden", "message": "..." } }` — the `message` distinguishes the cases. Handle centrally in the Axios error interceptor: show a toast surfacing the message (e.g. "tenant scope violation" vs "permission denied"); do **not** clear the token. See [API integration](04-api-integration.md).

---

## 6. PII masking

**PII masking is server-side.** Traits like email/phone/name come back **masked** (`u***@x.com`, `+8490****567`, `N***`) unless the token holds `pii:read`.

- The frontend **renders exactly what it receives**. It must **never** attempt client-side unmasking — there is no unmask endpoint and no client key.
- Where a value looks masked and the current role lacks `pii:read`, show a **lock-icon affordance** with tooltip **`unmask requires pii:read`**.
- `pii:read` is held only by `SUPER_ADMIN` / `TENANT_ADMIN`.
- Applies throughout Customer 360 (traits, identifiers) and anywhere profile PII is shown. Identifier values from `.../identifiers` are masked unless `pii:read`.

```tsx
// format/PiiValue.tsx (illustrative)
function PiiValue({ value }: { value: string }) {
  const { has } = usePermissions();
  const looksMasked = /\*/.test(value);
  return (
    <span>
      {value}
      {looksMasked && !has('pii:read') && (
        <Tooltip title="unmask requires pii:read">
          <LockIcon fontSize="inherit" />
        </Tooltip>
      )}
    </span>
  );
}
```

---

## 7. Security notes

- **Token transport:** the admin token goes in the `Authorization: Bearer <token>` header — **never a cookie**. Backend CORS sets `AllowCredentials: false`, so cookie-based auth is impossible; allowed headers include `Authorization, Content-Type, Accept, X-Api-Key`. See the CORS note in [API integration](04-api-integration.md).
- **Storage trade-off:**
  - _In-memory only_ — safest (no persistence surface), but the token is lost on refresh/new tab (user must re-paste).
  - _`sessionStorage`_ — survives refresh within the tab, cleared when the tab closes; readable by any script on the origin (XSS risk).
  - _`localStorage`_ — **do not use**; persists indefinitely and maximizes XSS exposure.
  - **Recommendation:** in-memory primary store, optionally mirrored to **`sessionStorage`** for refresh survival. Document the XSS trade-off to the operator.
- **XSS warning:** because the token grants full admin capability and is reachable from JS when stored, keep dependencies audited, avoid `dangerouslySetInnerHTML`, and sanitize any rendered JSON payloads (use the `JsonViewer` component, not raw HTML).
- **One-time secrets:** admin tokens (`cdpadm_...`), source keys (`cdp_...`), and destination secrets are shown in plaintext **exactly once** at creation/rotation via `OneTimeSecretDialog`. They cannot be retrieved again — warn explicitly. (Detailed in the relevant screen docs.)
- **Gating is not security:** all UI gating (§4), role declaration (§2), and tenant scoping (§5) are UX conveniences. The backend is the source of truth and enforces via `401`/`403`.
