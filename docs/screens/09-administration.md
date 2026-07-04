# Administration (Tokens, Roles, Tenants)

> Manage admin tokens and roles; super-admin tenant management. This screen is the access-control and tenant-onboarding surface of the console.

## Purpose

Administration is where operators handle **access control** (minting admin tokens, understanding role scopes) and **tenant onboarding** (super-admin creates tenants and hands off a first `TENANT_ADMIN` token). It is the most privileged surface in the console and is gated behind `admin:write`; the Tenants sub-section is further restricted to `SUPER_ADMIN`.

Two distinct capabilities live here:

1. **Admin Tokens** — mint new admin Bearer tokens (`cdpadm_...`) with a chosen role and tenant. Plaintext shown **exactly once**.
2. **Tenants** (`SUPER_ADMIN` only) — create new tenants and drive the onboarding flow: create tenant → mint `TENANT_ADMIN` token → hand off → they create sources.

A read-only **Role → Permission matrix** is rendered as reference so operators understand what each role can do before minting.

## Route(s)

| Route | Description |
|---|---|
| `/t/:tenantId/administration` | Admin tokens + role→permission matrix; Tenants sub-section (super-admin only) |

The Tenants sub-section is a panel/tab within the Administration route, not a separate route.

## Required permission(s)

| Sub-section | Required permission | Notes |
|---|---|---|
| Administration section (entire) | `admin:write` | Only `SUPER_ADMIN` and `TENANT_ADMIN` hold this |
| Mint admin token | `admin:write` | Role/tenant options constrained by minter's role (see below) |
| Role → Permission matrix | `admin:write` | Read-only reference; visible to anyone who can see the section |
| Tenants sub-section | `SUPER_ADMIN` | Cross-tenant capability; `TENANT_ADMIN` must NOT see it |

`pii:read`, `admin:write`, and `profile:delete` are ONLY held by `SUPER_ADMIN` / `TENANT_ADMIN` (see [Auth & RBAC](../05-auth-rbac-tenancy.md) and the matrix below). Compute the current role's permissions from the client-side role→permission table — there is no admin `whoami` endpoint, so the operator's declared role is the source of truth for gating (see [Backend gaps & caveats](../10-backend-gaps-and-caveats.md)).

## API calls used (exact paths)

| Action | Method & path | Permission | Request body | Response |
|---|---|---|---|---|
| Mint admin token | `POST /admin/v1/admin-tokens` | `admin:write` | `{ name, role, tenant_id }` | `{ api_token, role }` — plaintext `cdpadm_...` shown **ONCE** |
| Create tenant | `POST /admin/v1/tenants` | `SUPER_ADMIN` only | `{ name }` | `{ id, name, status, created_at, updated_at }` |
| List admin tokens | TBD — no endpoint confirmed | `admin:write` | — | **TBD — backend gap** |
| Revoke admin token | TBD — no endpoint confirmed | `admin:write` | — | **TBD — backend gap** |
| List tenants | TBD — no endpoint confirmed | `SUPER_ADMIN` | — | **TBD — backend gap** |

All admin requests send `Authorization: Bearer <adminToken>`. See [API integration](../04-api-integration.md) for the Axios interceptor and `tenantPath()` helper.

### Minting rules (enforce in the form)

- **`SUPER_ADMIN`** mints **any role** for **any tenant** (`tenant_id` may be any tenant UUID; for a `SUPER_ADMIN` token, tenant is nil/cross-tenant).
- **`TENANT_ADMIN`** mints **only non-super roles** (`TENANT_ADMIN`, `MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER` — never `SUPER_ADMIN`) and **only for its own tenant** (the `tenant_id` field is disabled and pinned to the current tenant).
- Enforcement is also server-side (`403`), so treat the form constraints as UX, not security.

## Layout & components

```
PageHeader "Administration"  (description: manage access control + tenant onboarding)
├── Section: Admin Tokens
│     ├── [Mint token] primary action  → wrapped in <RequirePerm perm="admin:write">
│     ├── Tokens table (Data Grid)  ── TBD: no list endpoint → render "Token list requires a
│     │      backend GET .../admin-tokens endpoint" empty/blocked state (link docs/10)
│     └── MintTokenDialog (RHF + Zod) → on success → OneTimeSecretDialog
├── Section: Role → Permission matrix  (read-only reference component)
└── Section: Tenants   ── ONLY rendered when role === 'SUPER_ADMIN'
      ├── [Create tenant] primary action
      ├── Tenants table (Data Grid)  ── TBD: no list endpoint → blocked state (link docs/10)
      └── CreateTenantDialog → on success, offer "Mint TENANT_ADMIN token" hand-off step
```

Shared components: `PageHeader`, `OneTimeSecretDialog`, `ConfirmDialog`, `DataGrid` wrapper, `StatusChip`, `CopyButton`, `RequirePerm`, `EmptyState`, `ErrorState` (see [Architecture & conventions](../03-architecture.md)).

### Mint token dialog (illustrative)

```tsx
// features/administration/MintTokenDialog.tsx
const schema = z.object({
  name: z.string().min(1),
  role: z.enum(['SUPER_ADMIN','TENANT_ADMIN','MARKETER','ANALYST','OPERATOR','VIEWER']),
  tenant_id: z.string().uuid(),
});

function MintTokenDialog() {
  const { role: myRole } = useAuth();
  const { tenantId } = useTenant();
  const isSuper = myRole === 'SUPER_ADMIN';

  // TENANT_ADMIN: non-super roles only, tenant pinned to own tenant
  const roleOptions: AdminRole[] = isSuper
    ? ['SUPER_ADMIN','TENANT_ADMIN','MARKETER','ANALYST','OPERATOR','VIEWER']
    : ['TENANT_ADMIN','MARKETER','ANALYST','OPERATOR','VIEWER'];

  const mint = useMutation({
    mutationFn: (body: { name: string; role: AdminRole; tenant_id: string }) =>
      api.post<AdminTokenOnce>('/admin/v1/admin-tokens', body).then(r => r.data),
    onSuccess: (once) => openOneTimeSecret(once.api_token), // prefix cdpadm_
  });

  // tenant_id field: disabled & defaulted to tenantId when !isSuper
}
```

### Onboarding flow (super-admin)

```
1. Create tenant       POST /admin/v1/tenants { name }            → Tenant { id, ... }
2. Mint first token    POST /admin/v1/admin-tokens                → AdminTokenOnce
                       { name, role: 'TENANT_ADMIN', tenant_id: <new tenant id> }
3. Hand off            OneTimeSecretDialog shows cdpadm_... once   → copy & deliver securely
4. Tenant admin        (out of console) creates sources for their apps
```

After step 1, prompt "Mint a TENANT_ADMIN token for this tenant?" to chain step 2 with `tenant_id` prefilled to the new tenant's `id`.

## Data & TS types

Use the canonical types from [Data model & types](../07-data-model-and-types.md) verbatim:

```ts
export interface AdminToken {
  id: string; name: string; role: AdminRole;
  tenant_id: string | null; status: 'active'; created_at?: string;
}
export interface AdminTokenOnce { api_token: string; role: AdminRole; } // plaintext once (prefix cdpadm_)

export interface Tenant {
  id: string; name: string; status: 'active';
  created_at: string; updated_at: string;
}

export type AdminRole =
  | 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'MARKETER' | 'ANALYST' | 'OPERATOR' | 'VIEWER';
```

`AdminToken.status` is `'active'` server-side (a status column exists), but there is **no confirmed list/revoke endpoint** to surface or change it — see TBD notes below.

## Role → Permission matrix (read-only reference)

Render this exactly as a reference table so operators understand scopes before minting. This is the canonical role→permission table the console also uses for UI gating.

**Roles:** `SUPER_ADMIN`, `TENANT_ADMIN`, `MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER`.

**Read set** = `source:read, event:read, profile:read, segment:read, destination:read, activation:read, audit:read, dlq:read`.

| Role | Permissions |
|---|---|
| `SUPER_ADMIN` | ALL permissions; cross-tenant (tenant = nil, can switch tenants) |
| `TENANT_ADMIN` | ALL permissions, scoped to its own tenant |
| `MARKETER` | read set + `segment:write`, `destination:write`, `consent:write` |
| `ANALYST` | read set only |
| `OPERATOR` | read set + `dlq:retry`, `event:replay` |
| `VIEWER` | read set only |

Notes: `pii:read`, `admin:write`, `profile:delete` are ONLY in `SUPER_ADMIN` / `TENANT_ADMIN`.

Full permission vocabulary (for the matrix legend): `source:read`, `source:write`, `event:read`, `event:replay`, `profile:read`, `profile:delete`, `segment:read`, `segment:write`, `destination:read`, `destination:write`, `activation:read`, `dlq:read`, `dlq:retry`, `audit:read`, `consent:write`, `pii:read`, `admin:write`.

Implement as a read-only component (e.g. a Data Grid or static table) driven by the same client-side role→perm map used by `<RequirePerm>` so the reference cannot drift from enforcement.

## States (loading / empty / error)

| State | Admin Tokens | Tenants |
|---|---|---|
| Loading | Skeleton rows in the Data Grid (once a list endpoint exists) | Skeleton rows |
| Empty | **Blocked/TBD**: no list endpoint → show `EmptyState` "Listing tokens requires a backend `GET .../admin-tokens` endpoint" with a link to [Backend gaps & caveats](../10-backend-gaps-and-caveats.md). Minting still works. | **Blocked/TBD**: no list endpoint → same treatment for tenants |
| Error | `ErrorState` with retry; map `{error:{code,message}}` — `403` toast (permission/tenant scope), `401` → clear token + redirect `/connect` | Same |
| Mint success | `OneTimeSecretDialog` opens with `api_token` (copy-once, "you cannot see this again") | After create, show tenant summary + optional "mint TENANT_ADMIN token" |
| Mint in-flight | Disable submit, show spinner | Disable submit, show spinner |
| Validation error | Server `bad_request` mapped to fields or a form-level alert | Same |

## Actions & confirmations

| Action | Trigger | Confirmation | Result |
|---|---|---|---|
| Mint admin token | "Mint token" → dialog | None to submit; success opens `OneTimeSecretDialog` (must confirm to close) | New `cdpadm_...` token shown once |
| Create tenant (super-admin) | "Create tenant" → dialog | None to submit | New `Tenant`; offer to chain token mint |
| Hand-off token | Post-mint | `OneTimeSecretDialog` requires explicit confirm before closing | Operator copies token; value is unrecoverable afterward |
| Revoke / disable token | **TBD — backend gap** | Would need `ConfirmDialog` | Document intended UI; blocked on endpoint (link docs/10) |

**One-time secret handling:** the minted `api_token` is returned plaintext exactly once. Always route it through `OneTimeSecretDialog` (big copy button, explicit "this value cannot be retrieved again" warning, confirm-to-close). Never log it, never persist it, never place it in a query cache that could be re-read.

## RBAC & PII notes

- Wrap the whole Administration route in a permission guard: require `admin:write`. Operators without it must not reach this screen (hide the nav item and redirect).
- Wrap the **Mint token** action in `<RequirePerm perm="admin:write">`.
- Render the **Tenants** section only when `role === 'SUPER_ADMIN'`. A `TENANT_ADMIN` must not see tenant creation.
- Enforce minting constraints in the form (role options + tenant field), but rely on the server `403` as the real boundary — UI gating is UX, not security.
- **No PII** is displayed on this screen. The only sensitive values are the one-time token secrets, which follow the one-time-secret handling above (never stored/re-read).
- There is no admin `whoami` endpoint, so the current operator's role is declared at connect time; gate everything from the client-side role→permission table (link [Backend gaps & caveats](../10-backend-gaps-and-caveats.md)).

## TBD — backend gaps

Flag these explicitly in the UI and cross-link [Backend gaps & caveats](../10-backend-gaps-and-caveats.md):

- **List admin tokens** — no `GET .../admin-tokens` endpoint confirmed. A `status` column exists server-side (`AdminToken.status: 'active'`), but the console cannot enumerate tokens today. Document the intended list UI (columns: name, role, tenant, status, created_at) as **TBD — backend gap**.
- **Revoke admin token** — no revoke/disable endpoint confirmed. Document the intended revoke UI (row action + `ConfirmDialog`) as **TBD — backend gap**.
- **List tenants** — no `GET /admin/v1/tenants` endpoint confirmed. This blocks both the Tenants table here and the tenant switcher in the app shell (cross-ref [Connect & app shell](01-connect-and-shell.md)). Document as **TBD — backend gap**.

## Acceptance criteria (checklist)

- [ ] Administration route is reachable only with `admin:write`; nav item hidden and route redirected otherwise.
- [ ] "Mint token" action is wrapped in `<RequirePerm perm="admin:write">`.
- [ ] Mint form posts `POST /admin/v1/admin-tokens` with `{ name, role, tenant_id }`.
- [ ] For `SUPER_ADMIN`: role dropdown offers all six roles and `tenant_id` accepts any tenant UUID.
- [ ] For `TENANT_ADMIN`: role dropdown offers only non-super roles (no `SUPER_ADMIN`) and `tenant_id` is disabled/pinned to the current tenant.
- [ ] On mint success, the plaintext `api_token` (prefix `cdpadm_`) is shown exactly once via `OneTimeSecretDialog` with a copy button and an unrecoverable-value warning; dialog requires confirm to close.
- [ ] The role→permission matrix renders as a read-only reference driven by the same client-side role→perm map used for gating.
- [ ] Tenants section is rendered only when `role === 'SUPER_ADMIN'`.
- [ ] "Create tenant" posts `POST /admin/v1/tenants` with `{ name }` and, on success, offers to mint a `TENANT_ADMIN` token with `tenant_id` prefilled to the new tenant's `id`.
- [ ] Loading, empty (blocked/TBD), and error states are implemented for both tables; error handling maps the `{error:{code,message}}` envelope (`401` → `/connect`, `403` → toast).
- [ ] Missing list/revoke token and list-tenants endpoints are surfaced as TBD blocked states linking [Backend gaps & caveats](../10-backend-gaps-and-caveats.md).
- [ ] No token secret is logged, persisted, or re-readable from cache after the one-time dialog closes.
