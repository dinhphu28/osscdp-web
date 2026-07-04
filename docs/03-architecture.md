# Application Architecture

> Folder structure, routing tree, layering, and state-management strategy for the `osscdp-web` admin console.

This document is the structural blueprint the coding agent follows before writing any feature code. It fixes the folder layout, the request-flow layering, the route tree, and the state ownership rules. It is consistent with [API integration](04-api-integration.md), the [Data model & types](07-data-model-and-types.md), and the [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## 1. Feature-based folder structure

The app is organized by **feature**, not by technical type. Cross-cutting infrastructure lives under `app/` and `lib/`; each user-facing surface is a self-contained folder under `features/`.

```
src/
  app/                 # App shell: composition root, routing, theme, layout chrome
    router.tsx         # React Router route tree (see §3)
    providers.tsx      # Provider composition (see §6): QueryClient, Theme, Tenant, Auth, Snackbar
    theme.ts           # MUI theme (light/dark), persisted preference
    AppLayout.tsx      # Nav rail + top bar + tenant switcher + <Outlet/>
  lib/
    api/               # Axios instance + auth/tenant interceptors + generated Orval client & hooks
    auth/              # Token store, AuthProvider, useAuth, role→perm table, <RequirePerm>
    tenant/            # TenantProvider, useTenant, tenant switcher logic
    query/             # queryClient config, query-key factory (qk), central error handling
    format/            # Date/relative-time helpers, masking-aware display helpers
  features/            # One folder per surface; each: routes, components, hooks, schemas, __tests__
    dashboard/         # Health, DLQ open count, activation success rate, processing lag
    sources/           # Source list, create (one-time key), rotate, disable, instrumentation help
    events/            # Keyset-paginated events explorer, payload viewer, replay
    profiles/          # Customer 360: overview, identity, events, segments, GDPR
    segments/          # Segment list, rule builder, versions, members, wired destinations
    activation/        # Destinations, subscriptions, delivery logs
    consent/           # Consent channel×purpose editor (rendered inside profiles)
    dlq/               # DLQ list/filter, retry, discard
    administration/    # Admin tokens, role→perm matrix, tenants (super-admin)
    audit/             # Audit log screen — Phase 2, blocked on backend (see §Gaps)
  components/          # Shared UI: DataGrid wrapper, OneTimeSecretDialog, ConfirmDialog,
                       # PageHeader, EmptyState, ErrorState, JsonViewer, CopyButton, StatusChip
  types/               # Hand-written TS types (supplement Orval output) — see 07-data-model-and-types.md
```

Directory responsibilities:

| Dir           | Responsibility                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`        | Composition root. Wires providers, router, theme, and the persistent layout chrome. No feature logic.                                                                                                    |
| `lib/api/`    | The single Axios instance, request/response interceptors, and the Orval-generated client + React Query hooks. All network I/O originates here.                                                           |
| `lib/auth/`   | Holds the pasted admin token, the declared role, the canonical **role→permission table**, `useAuth`, and the `<RequirePerm>` gate component. There is **no login** — token entry only (token-only auth). |
| `lib/tenant/` | Holds the current `{tenantID}` UUID; exposes `useTenant`; drives the tenant switcher (all tenants for `SUPER_ADMIN`, pinned for others).                                                                 |
| `lib/query/`  | Configures the shared `QueryClient`, exposes the `qk` query-key factory (§5), and centralizes error handling.                                                                                            |
| `lib/format/` | Pure display helpers: relative timestamps, and masking-aware rendering (never unmasks — see [Backend gaps & caveats](10-backend-gaps-and-caveats.md)).                                                   |
| `features/*`  | Self-contained surfaces. Each owns its routes, components, TanStack Query hooks, Zod schemas, and `__tests__`. Features import from `lib/` and `components/`, never from each other's internals.         |
| `components/` | Reusable, feature-agnostic UI primitives shared across surfaces.                                                                                                                                         |
| `types/`      | Hand-written entity types from [Data model & types](07-data-model-and-types.md) that fill gaps in the Orval-generated output.                                                                            |

---

## 2. Layering (request flow)

Four strict layers. Data flows down as calls, up as typed results. A feature component **never** touches Axios directly — it always goes through a data hook.

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION                                                │
│  features/*  +  components/*   (MUI, Data Grid, RHF forms)   │
│  - Renders state; dispatches user intents                    │
│  - Gated by <RequirePerm> from lib/auth                      │
└───────────────┬─────────────────────────────────────────────┘
                │ calls hooks (useQuery / useMutation / useInfiniteQuery)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  DATA HOOKS                                                  │
│  TanStack Query v5 + Orval-generated hooks (lib/api)         │
│  - qk query-key factory (keyed by tenant)                    │
│  - cache, invalidation, cursor state for events              │
└───────────────┬─────────────────────────────────────────────┘
                │ invokes generated client functions
                ▼
┌─────────────────────────────────────────────────────────────┐
│  HTTP CLIENT                                                 │
│  Single Axios instance (lib/api)                             │
│  - request interceptor: Authorization: Bearer <adminToken>  │
│  - tenantPath() injects {tenantID} into /admin/v1/... paths │
│  - response interceptor: parse {error:{code,message}};      │
│    401→clear token+redirect /connect; 403→toast;            │
│    429→respect Retry-After                                   │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTPS (Authorization header, never a cookie — AllowCredentials:false)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND — osscdp admin API                                 │
│  {VITE_API_BASE_URL}/admin/v1/*  (permission-gated, 403)    │
│  Pipeline is ASYNCHRONOUS: ingest→identity→profile→         │
│  segmentation→activation happen seconds later                │
└─────────────────────────────────────────────────────────────┘
```

Rules:

- **Presentation** owns layout, MUI components, forms (React Hook Form + Zod), and RBAC/PII rendering. It reads from and writes to the backend **only** through data hooks.
- **Data hooks** are the only place `useQuery`/`useMutation`/`useInfiniteQuery` appear. Mutations invalidate the relevant query keys from the `qk` factory.
- **HTTP client** is a single shared Axios instance. Interceptors handle auth, tenant path building, and the error envelope. See [API integration](04-api-integration.md) for the full interceptor spec.
- **Backend** enforces RBAC (`403`) and tenant scope (`403 tenant scope violation`) server-side. UI gating is UX only, not security.

---

## 3. Routing tree

React Router v6.4+ data APIs (or v7), nested under `/t/:tenantId`.

```
/                         → if no token → redirect /connect
                            else → redirect to tenant picker or last tenant
/connect                  → token entry (+ optional role declaration + base URL override)
/t/:tenantId              → layout route (loads tenant context, renders AppLayout + <Outlet/>)
  ├─ dashboard            → health, DLQ open count, activation success rate, processing lag
  ├─ sources              → source list / create / rotate / disable / instrumentation help
  ├─ events               → keyset-paginated explorer; filter identifier_key, event_name
  ├─ profiles             → search by email/phone or canonical_user_id
  │   └─ :canonicalUserId → Customer 360 detail tabs
  ├─ segments             → segment list
  │   ├─ new              → create (rule builder)
  │   └─ :segmentId       → view/edit, versions, members, wired destinations
  ├─ destinations         → destination list / create webhook|kafka
  │   └─ :destinationId   → detail, subscriptions, delivery log
  ├─ dlq                  → list/filter by status; retry; discard
  ├─ audit                → Phase 2 / backend gap (see below)
  └─ administration       → admin tokens (list/mint); role→perm matrix; tenants (super-admin)
```

### Why tenant-in-path (`/t/:tenantId/*`)

- **Tenancy is server-side by URL path.** Every admin route is `/admin/v1/tenants/{tenantID}/...`; tenant is **never** sent in a body or header. Mirroring the tenant in the frontend URL keeps the UI's notion of "current tenant" in lockstep with the API path the interceptor builds.
- **Super-admin needs to switch tenants.** A `SUPER_ADMIN` token (tenant = nil) can access any tenant, so `:tenantId` in the URL makes the active tenant explicit, bookmarkable, and switch-friendly. Non-super tokens are pinned to one tenant; the switcher shows only that tenant (or is hidden).
- **A tenant-scope violation is a `403`.** Keeping tenant in the path means a wrong tenant surfaces as a clean, catchable error from the interceptor rather than ambiguous UI state.

### How the layout route loads tenant context

The `/t/:tenantId` layout route is the single place tenant context is established:

1. It reads `:tenantId` from route params.
2. `TenantProvider` sets the current tenant from that param; `useTenant()` exposes it to all children and to the `qk` query-key factory.
3. The Axios `tenantPath(tenantId, suffix)` helper composes `/admin/v1/tenants/${tenantId}${suffix}` for every child feature's calls.
4. If there is no token, the app never reaches here — `/` redirects to `/connect`.
5. `SUPER_ADMIN` may change `:tenantId` via the tenant switcher (navigation), which remounts child queries under the new tenant key. Non-super tokens render the switcher pinned/hidden.

```tsx
// app/router.tsx (illustrative)
{
  path: '/t/:tenantId',
  element: <TenantLayoutRoute />, // wraps AppLayout in TenantProvider from useParams().tenantId
  children: [
    { path: 'dashboard', element: <DashboardScreen /> },
    { path: 'sources', element: <SourcesScreen /> },
    { path: 'events', element: <EventsScreen /> },
    { path: 'profiles', element: <ProfilesScreen /> },
    { path: 'profiles/:canonicalUserId', element: <Customer360Screen /> },
    { path: 'segments', element: <SegmentsScreen /> },
    { path: 'segments/new', element: <SegmentEditorScreen /> },
    { path: 'segments/:segmentId', element: <SegmentDetailScreen /> },
    { path: 'destinations', element: <DestinationsScreen /> },
    { path: 'destinations/:destinationId', element: <DestinationDetailScreen /> },
    { path: 'dlq', element: <DlqScreen /> },
    { path: 'audit', element: <AuditScreen /> },              // Phase 2 — backend gap
    { path: 'administration', element: <AdministrationScreen /> },
  ],
}
```

> **Audit route caveat:** `GET .../audit` does not exist (audit log is write-only). The `audit` screen renders as a Phase 2 spec with a "requires backend endpoint" banner. See [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## 4. State-management strategy

State is split by **who owns the source of truth**. No Redux.

| State kind                                      | Owner                                                        | Notes                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Server state** (all API reads/writes)         | **TanStack Query v5**                                        | The cache is the source of truth for anything from the backend. Query-key factory keyed by tenant (§5). Mutations invalidate keys. Events list uses `useInfiniteQuery` with `next_cursor`. |
| **Auth token + declared role**                  | **React context** (`AuthProvider` in `lib/auth`)             | Pasted admin Bearer token, persisted; no session/JWT/refresh. Read by the Axios request interceptor.                                                                                       |
| **Current tenant**                              | **React context** (`TenantProvider` in `lib/tenant`)         | Set from the `:tenantId` route param at the layout route.                                                                                                                                  |
| **Theme (light/dark)**                          | **React context** + `localStorage`                           | MUI theme toggle; preference persisted.                                                                                                                                                    |
| **Form state**                                  | **React Hook Form v7** + **Zod** (via `@hookform/resolvers`) | Local to each form; inline field errors; server `bad_request` mapped to fields or a form-level alert.                                                                                      |
| **Ephemeral UI state** (dialog open, tab index) | Local `useState`                                             | Component-local only.                                                                                                                                                                      |

- **Zustand is optional** — reach for it **only if** the token/tenant/theme contexts prove insufficient. Default to React context + hooks.
- **No Redux**, no global client store for server data — TanStack Query already owns that.

---

## 5. Query-key factory (keyed by tenant)

Every server-state cache entry is namespaced by tenant so switching tenants never leaks or collides. A single `qk` factory produces stable keys; mutations invalidate by prefix.

```ts
// lib/query/keys.ts (illustrative)
export const qk = {
  events: (tenantId: string) => ({
    all: ['t', tenantId, 'events'] as const,
    list: (filters: { identifier_key?: string; event_name?: string }) =>
      ['t', tenantId, 'events', 'list', filters] as const,
    detail: (eventId: string) => ['t', tenantId, 'events', eventId] as const,
  }),
  profiles: (tenantId: string) => ({
    all: ['t', tenantId, 'profiles'] as const,
    detail: (cuid: string) => ['t', tenantId, 'profiles', cuid] as const,
    consent: (cuid: string) => ['t', tenantId, 'profiles', cuid, 'consent'] as const,
  }),
  segments: (tenantId: string) => ({
    all: ['t', tenantId, 'segments'] as const,
    detail: (segmentId: string) => ['t', tenantId, 'segments', segmentId] as const,
    members: (segmentId: string) => ['t', tenantId, 'segments', segmentId, 'members'] as const,
  }),
  dlq: (tenantId: string) => ({
    list: (status: 'open' | 'retried' | 'discarded') => ['t', tenantId, 'dlq', status] as const,
  }),
} as const;

// Usage
// qk.profiles(tenantId).detail(cuid) → ['t', tenantId, 'profiles', cuid]
```

- Prefix shape is always `['t', tenantId, <feature>, ...]`.
- A mutation invalidates the narrowest correct prefix, e.g. after `PUT .../consent`, invalidate `qk.profiles(tenantId).consent(cuid)`.
- After ingest-affecting or replay actions, remember the **pipeline is asynchronous** — do not expect fresh data instantly; surface "processing — refresh in a few seconds" plus a manual refresh. See [API integration](04-api-integration.md).

---

## 6. Providers composition order

`app/providers.tsx` wraps the tree outside-in. Order matters: outer providers must not depend on inner ones.

```tsx
// app/providers.tsx (illustrative)
<QueryClientProvider client={queryClient}>
  {' '}
  {/* server-state cache */}
  <ThemeProvider theme={theme}>
    {' '}
    {/* MUI theme + CssBaseline (light/dark) */}
    <SnackbarProvider>
      {' '}
      {/* notistack toasts */}
      <AuthProvider>
        {' '}
        {/* token + declared role; feeds Axios interceptor */}
        <TenantProvider>
          {' '}
          {/* current tenant; set at /t/:tenantId layout route */}
          <RouterProvider router={router} /> {/* React Router data router */}
        </TenantProvider>
      </AuthProvider>
    </SnackbarProvider>
  </ThemeProvider>
</QueryClientProvider>
```

Ordering rationale:

1. **QueryClientProvider** outermost — every layer below may issue queries.
2. **ThemeProvider** (+ `CssBaseline`) — establishes MUI styling for all UI, including error/snackbar surfaces.
3. **SnackbarProvider** (notistack) — so the error interceptor and any provider below can raise toasts (e.g. `403`/`429`).
4. **AuthProvider** — holds the token/role; the Axios interceptor reads from it, and it can trigger redirect-to-`/connect` on `401`.
5. **TenantProvider** — depends on auth (a token must exist) and is finalized by the `:tenantId` route param.
6. **RouterProvider** innermost — routing consumes all of the above.

---

## 7. Error boundary & Suspense strategy

- **Route-level error boundaries.** Use React Router `errorElement` on the layout route and on data-heavy child routes so a thrown render/loader error renders a shared `ErrorState` (with retry) instead of a blank screen. A top-level React error boundary in `app/` catches anything that escapes.
- **Query errors are data, not throws (by default).** TanStack Query surfaces `isError`/`error`; each data view renders the shared **ErrorState** with a retry that calls `refetch()`. The Axios response interceptor still centrally handles `401` (clear token + redirect `/connect`), `403` (toast), and `429` (respect `Retry-After`) — see [API integration](04-api-integration.md).
- **Per-view states are mandatory.** Every data view implements **loading** (skeletons), **empty** (`EmptyState`), and **error** (`ErrorState` with retry). This is a hard requirement across all feature screens.
- **Suspense is scoped, not global.** If Suspense-mode queries or lazy route chunks are used, wrap them in a local `<Suspense fallback={<Skeleton/>}>` at the route/section boundary — never a single app-wide Suspense that blanks the whole shell. The persistent `AppLayout` chrome (nav rail, top bar) must stay mounted while a child section loads.
- **Async-pipeline awareness.** Because the pipeline is asynchronous, an empty result immediately after a write is a valid "still processing" state, not an error — render the processing hint + manual refresh rather than `ErrorState`.

---

## Related docs

- [API integration](04-api-integration.md) — Axios instance, interceptors, Orval, error envelope, pagination.
- [Data model & types](07-data-model-and-types.md) — canonical TypeScript entities referenced above.
- [Backend gaps & caveats](10-backend-gaps-and-caveats.md) — no `whoami`, write-only audit, missing segment list, etc.
