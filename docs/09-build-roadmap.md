# Build Roadmap (Phased Execution Order)

> Purpose: the step-by-step, phase-by-phase order for the AI agent to build `osscdp-web`, with deliverables, dependencies, and an acceptance checklist to pass before advancing.

This roadmap sequences the work so each phase produces something runnable and validated against a live backend. Do not skip ahead: later phases assume the shared infrastructure (auth store, tenant path helper, Data Grid wrapper, one-time-secret dialog) built earlier. Copy exact enum values, paths, and permissions from the [Data model & types](07-data-model-and-types.md); never invent endpoints, fields, or roles. Known blockers live in [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

Related docs: [API integration](04-api-integration.md) · [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md) · [Architecture & conventions](03-architecture.md) · screen specs under [`screens/`](screens/).

---

## Start here

1. Read the canonical brief and [Data model & types](07-data-model-and-types.md) in full before writing any code.
2. Get the backend running so you can validate every phase against real responses (see next section).
3. Execute **Phase 0 → Phase 4 in order.** Do not begin a phase until the previous phase's acceptance checklist passes.
4. Within a phase, build the shared/infra pieces first, then features, then tests.

---

## Validate against a running backend

The backend repo is `/home/dinhphu28/ghq/github.com/dinhphu28/osscdp`. From that repo:

| Command           | Purpose                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `make up`         | Bring up the docker stack (Postgres, Kafka, API, worker, Grafana on `:3000`). API is mapped to `http://localhost:18080`.                    |
| `make run-api`    | Run the admin + ingress HTTP API locally (default `http://localhost:8080`).                                                                 |
| `make run-worker` | Run the async pipeline worker (identity → profile → segmentation → activation). Required for events to become profiles/segments/deliveries. |

Notes:

- Set `VITE_API_BASE_URL` to match: `http://localhost:8080` for `make run-api`, or `http://localhost:18080` for the docker stack.
- The backend MUST set `CORS_ALLOWED_ORIGINS` to the console's dev origin (e.g. `http://localhost:5173`) or the browser blocks every request. `AllowCredentials: false`; token goes in the `Authorization` header.
- Get an initial `SUPER_ADMIN` token from the backend env `ADMIN_API_TOKEN` (static bootstrap token). Use it in `/connect`.
- The pipeline is **asynchronous**: ingest returns `202`; profiles/segments/deliveries appear seconds later. Run the worker, then wait + refresh — never expect instant results.
- Regenerate the Orval client from the live spec at `GET /openapi.yaml` whenever the backend changes.

---

## Dependency graph

```
Phase 0  Scaffold (Vite+TS+MUI, theme, providers, router shell,
         Orval codegen, axios+interceptors, TanStack Query, shared components)
   │
   ▼
Phase 1  Auth & shell
         /connect ─► AuthProvider ─► RBAC table + <RequirePerm>
                          │
                          ▼
                    TenantProvider + switcher ─► AppLayout nav
   │
   ▼
Phase 2  Core loop (CDP happy path)
         Sources ─► Events explorer ─► Customer 360 ─► Segments (Rule Builder) ─► Activation/Destinations
            │            │                  │                 │                          │
         one-time     keyset +           consent          rule tree              subscribe + deliveries
          key         replay             tabs             (Zod validate)
   │
   ▼
Phase 3  Operability & governance
         DLQ admin      Administration (tokens/roles/tenants)    GDPR export/delete    Dashboard
              (reuses Data Grid,           (reuses one-time-secret,   (reuses ConfirmDialog,   (reuses health
               ConfirmDialog)               role→perm table)          Customer 360)            + Grafana link)
   │
   ▼
Phase 4  Blocked / deferred
         Audit log (needs backend GET .../audit)
         Stateful "behavior" segment leaves (feature-flagged)
         Deferred destination types push/email/crm/ads/warehouse (shown disabled)
```

Edges are hard dependencies. Segments depend on nothing but the shell to _create_, but the happy-path demo needs Sources → Events → Profiles first so there is data to segment and activate.

---

## Phase 0 — Scaffold

**Goal:** an empty-but-wired app that boots, has the theme/providers/router shell, a generated typed API client, and the reusable UI primitives every later screen consumes.

### Deliverables

- Vite v6+ + TypeScript **strict** project; pnpm; Node 22.13+.
- ESLint (typescript-eslint) + Prettier configured and passing.
- Folder structure exactly per [Architecture & conventions](03-architecture.md):
  `src/app`, `src/lib/{api,auth,tenant,query,format}`, `src/features/*`, `src/components`, `src/types`.
- MUI Material v6+, MUI X Data Grid v7+, MUI X Date Pickers, `@mui/icons-material` installed.
- `theme.ts` — MUI light/dark theme; dark-mode toggle persisted to `localStorage`.
- `providers.tsx` — nests `QueryClientProvider`, `ThemeProvider`, `SnackbarProvider` (notistack), `AuthProvider`, `TenantProvider` (auth/tenant may be stubs this phase).
- `router.tsx` — React Router v6.4+ data-API route tree (routes may render placeholders): `/`, `/connect`, and the `/t/:tenantId/*` children (`dashboard`, `sources`, `events`, `profiles`, `profiles/:canonicalUserId`, `segments`, `segments/new`, `segments/:segmentId`, `destinations`, `destinations/:destinationId`, `dlq`, `audit`, `administration`).
- **Orval codegen** from the backend `openapi.yaml` → TS types + TanStack Query v5 hooks into `src/lib/api`. Add an npm script (e.g. `pnpm gen:api`).
- Hand-written types in `src/types` from [Data model & types](07-data-model-and-types.md) to fill spec gaps.
- **Axios instance + interceptors** in `src/lib/api`:
  - request interceptor injects `Authorization: Bearer <token>` from the auth store;
  - `tenantPath(tenantId, suffix)` helper → `/admin/v1/tenants/${tenantId}${suffix}`;
  - response error interceptor parses `{ error: { code, message } }`; `401` → clear token + redirect `/connect`; `403` → toast; `429` → respect `Retry-After` (int seconds); others → toast + surface.
- **TanStack Query** v5: `queryClient`, query-key factory keyed by tenant (e.g. `qk.profiles(tenantId).detail(cuid)` → `['t', tenantId, 'profiles', cuid]`), centralized error handling.
- **Shared components** (`src/components`): `PageHeader`, `DataGrid` wrapper (server + client mode), `OneTimeSecretDialog`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `JsonViewer`, `CopyButton`, `StatusChip`.
- Vitest + React Testing Library + MSW harness scaffolded; Playwright configured.

### Dependencies

None (greenfield). The repo is currently empty.

### Acceptance checklist

- [ ] `pnpm dev` boots; `pnpm build`, `pnpm lint`, `pnpm typecheck` all pass with TS strict.
- [ ] `pnpm gen:api` regenerates the Orval client from `openapi.yaml` with no errors.
- [ ] All routes resolve to placeholder pages without crashing.
- [ ] Axios interceptors demonstrably attach the token and map the error envelope (unit test with MSW).
- [ ] Dark/light toggle works and persists across reload.
- [ ] Shared components render in isolation (a smoke test or story).

---

## Phase 1 — Auth & shell

**Goal:** the operator can paste an admin token, land in a tenant-scoped shell, and the UI gates actions by role. There is **no login** — this is a paste-token flow.

### Deliverables

- **`/connect`** screen ([screens/01-connect](screens/01-connect-and-shell.md)): paste admin Bearer token, optional **role declaration** (there is no admin whoami — see [Backend gaps](10-backend-gaps-and-caveats.md)), optional base-URL override. Validate the token with a cheap authenticated call; on success store the token; on `401` show an error and stay.
- **AuthProvider / `useAuth`** (`src/lib/auth`): holds token + declared role in memory + `localStorage` (Zustand only if needed); `disconnect()` clears and returns to `/connect`.
- **RBAC role→permission table** (client-side, canonical — copy exactly):

  | Role           | Permissions                                                      |
  | -------------- | ---------------------------------------------------------------- |
  | `SUPER_ADMIN`  | ALL permissions; cross-tenant (tenant = nil, can switch tenants) |
  | `TENANT_ADMIN` | ALL permissions, scoped to its own tenant                        |
  | `MARKETER`     | read set + `segment:write`, `destination:write`, `consent:write` |
  | `ANALYST`      | read set only                                                    |
  | `OPERATOR`     | read set + `dlq:retry`, `event:replay`                           |
  | `VIEWER`       | read set only                                                    |

  Read set = `source:read, event:read, profile:read, segment:read, destination:read, activation:read, audit:read, dlq:read`. `pii:read`, `admin:write`, `profile:delete` are ONLY in `SUPER_ADMIN`/`TENANT_ADMIN`.

- **`<RequirePerm perm="...">`** wrapper: hides or disables actions the declared role lacks; disabled controls carry a tooltip `requires <perm>`. UI gating is UX only — the server also enforces `403`.
- **TenantProvider / `useTenant`** (`src/lib/tenant`): current tenant from `:tenantId` path segment; the Axios layer injects `{tenantID}` into admin paths. Never send tenant in body/header.
- **Tenant switcher**: `SUPER_ADMIN` (tenant nil) sees all tenants; non-super tokens are pinned to one tenant (switcher shows only that or is hidden).
- **AppLayout** ([screens/02-app-shell](screens/01-connect-and-shell.md)): nav rail + top bar + tenant switcher + theme toggle + "connected as `<role>`" indicator + disconnect + `<Outlet/>`.

### Dependencies

Phase 0 (axios interceptors, providers, router, theme).

### Acceptance checklist

- [ ] Pasting the backend `ADMIN_API_TOKEN` connects and lands in the shell; a bad token yields a clear error and no navigation.
- [ ] `401` from any call clears the token and redirects to `/connect`.
- [ ] Declaring `VIEWER` hides/disables all write actions; declaring `SUPER_ADMIN` reveals them (verified by an RBAC gating test).
- [ ] Super-admin token shows a working tenant switcher; a tenant-pinned token does not.
- [ ] Navigating to `/t/:tenantId/...` sets the tenant and the Axios layer builds correct `/admin/v1/tenants/{tenantID}/...` paths.
- [ ] Disconnect clears state and returns to `/connect`.

---

## Phase 2 — Core loop (the CDP happy path)

**Goal:** end-to-end demonstrate the CDP: provision a source → send/inspect events → resolve a customer profile → build a segment → activate to a destination and see deliveries. Build in this order; each feature feeds the next.

### 2a. Sources — [screens/04-sources](screens/03-sources.md)

- List sources; create source (`POST /admin/v1/tenants/{tenantID}/sources`, perm `source:write`) → **returns ingest API key ONCE** → show `OneTimeSecretDialog` (prefix `cdp_`, "cannot be retrieved again").
- Rotate key (`POST .../sources/{sourceID}/rotate-key`, `source:write`) behind `ConfirmDialog` (old key invalid immediately) → one-time modal.
- Disable source (`PUT` where applicable); instrumentation help panel showing ingress endpoints and header `X-CDP-Api-Key` (note the `X-Api-Key` CORS mismatch — see [Backend gaps](10-backend-gaps-and-caveats.md)). The console never authenticates with source keys.

### 2b. Events explorer — [screens/05-events](screens/04-events-explorer.md)

- `GET /admin/v1/tenants/{tenantID}/events` (`event:read`) — **keyset pagination**: `limit` (default 50, max 500), opaque `cursor` → `next_cursor`; use `useInfiniteQuery` and Data Grid **server mode** with cursor state (not page numbers). Filters `identifier_key` (e.g. `user_id:u1`), `event_name`.
- Event detail (`GET .../events/{eventID}`) with `JsonViewer` for `payload_json`.
- Replay one (`POST .../events/{eventID}/replay`, `event:replay`); replay-by-identifier (`POST .../replay?identifier_key=...&max=1000`, `event:replay`). After replay show the async "processing — refresh in a few seconds" affordance.

### 2c. Customer 360 — [screens/06-customer-360](screens/05-customer-360.md)

- Search: `GET .../profiles?email=...` OR `?phone=...` (`profile:read`, `400` if neither); detail by `GET .../profiles/{canonicalUserID}`.
- Tabs: Overview (`traits_json` + `computed_attributes_json`), Identity (cluster + identifiers `GET .../profiles/{cuid}/identifiers`; merge history TBD — see gaps), Events, Segments (memberships), **Consent**.
- **Consent editor** (channel × purpose): `GET .../profiles/{cuid}/consent` (`profile:read`), `PUT .../consent` (`consent:write`, body `{channel, purpose, status, source?}`). Channels `email, sms, push, ads, webhook`; purposes `marketing, analytics, personalization, transactional`; statuses `granted, denied, unknown`.
- **PII masking throughout**: render values as received; if a value looks masked and the role lacks `pii:read`, show a lock tooltip "unmask requires pii:read". Never attempt client-side unmasking.

### 2d. Segments + Rule Builder — [screens/07-segments](screens/06-segments-and-rule-builder.md)

- List segments (**TBD — list endpoint not confirmed**, likely `GET .../segments`; see [Backend gaps](10-backend-gaps-and-caveats.md)); create (`POST .../segments`, `segment:write`, body `{name, description?, rule}` → `201`); edit (`PUT .../segments/{segmentID}` — creates a NEW version); members (`GET .../segments/{segmentID}/members`); wired destinations (`GET .../segments/{segmentID}/destinations`).
- Delete/deactivate (`DELETE .../segments/{segmentID}`) — **code-only, NOT in openapi.yaml**; Orval won't generate it, add the hook by hand.
- **Rule Builder**: nested `and`/`or`/`not` (`RuleNode`) over `RuleLeaf` (`field`, `op`, `value`). Ops: `eq, neq, gt, gte, lt, lte, contains, not_contains, in, not_in, exists, not_exists` (`in/not_in` take arrays; `exists/not_exists` take no value). Field picker namespaces: `profile.traits.*`, `profile.computed_attributes.*`, `profile.canonical_user_id`, `profile.first_seen_at`, `profile.last_seen_at`, `event.event_name`, `event.type`, `event.properties.*`, `event.context.*`. Validate the tree client-side with **Zod**; the server also validates on create/edit → surface `bad_request` errors.

```tsx
// Recursive rule node render (illustrative)
function RuleEditor({ node, onChange }: { node: Rule; onChange: (r: Rule) => void }) {
  if ('operator' in node) {
    return (
      <LogicalGroup op={node.operator}>
        {node.conditions.map((c, i) => (
          <RuleEditor key={i} node={c} onChange={(u) => replaceAt(node, i, u, onChange)} />
        ))}
      </LogicalGroup>
    );
  }
  return <LeafRow field={node.field} op={node.op} value={node.value} onChange={onChange} />;
}
```

### 2e. Activation / Destinations — [screens/08-activation](screens/07-activation-destinations.md)

- Create destination (`POST .../destinations`, `destination:write`, body `{type:"webhook"|"kafka", name, secret?, channel?, purpose?, config}` → `201`). Webhook `config`: `{url, method?, headers?, timeout_ms?, max_retries?}` + top-level `secret` (HMAC). Kafka `config`: `{topic}`. If a `secret` is supplied it is returned to the operator via `OneTimeSecretDialog` (server never returns it again).
- Detail/edit (`GET`/`PUT .../destinations/{destinationID}`, e.g. disable via `ConfirmDialog`).
- Subscribe to segment (`POST .../destinations/{destinationID}/subscriptions`, `{trigger_type:"segment_membership", segment_id}`); unsubscribe (`DELETE .../subscriptions/{subscriptionID}`, idempotent soft-disable).
- Delivery log (`GET .../destinations/{destinationID}/deliveries`, `activation:read`) with task statuses via `StatusChip`: `pending, sending, succeeded, failed_retryable, failed_permanent, dlq, skipped` (`skipped` = consent denied).
- Only `webhook` and `kafka` are enabled; `push, email, crm, ads, warehouse` are shown disabled ("coming soon") — see Phase 4.

### Dependencies

Phase 1 (shell, RBAC, tenant path). 2b→2c→2d→2e are sequential for the demo (need data flowing); requires `make run-worker`.

### Acceptance checklist

- [ ] Create a source, copy the one-time `cdp_` key, and the key cannot be viewed again.
- [ ] Events table paginates via cursor (`next_cursor`) in server mode; filters by `identifier_key`/`event_name` work.
- [ ] Replaying an event shows the async processing notice; after the worker runs + refresh, a profile is found by email/phone.
- [ ] Consent edits persist and re-read; `denied` is representable.
- [ ] Rule Builder produces a valid `Rule` tree; invalid rules surface Zod + server `bad_request` errors; a created segment lists members after the worker evaluates.
- [ ] A webhook destination can be created, subscribed to a segment, and its delivery log renders statuses.
- [ ] All write actions are hidden/disabled for roles lacking the permission; masked PII renders with the lock affordance for non-`pii:read` roles.

---

## Phase 3 — Operability & governance

**Goal:** the operator surfaces for running the platform: failure recovery, token/role/tenant administration, GDPR flows, and a dashboard.

### Deliverables

- **DLQ admin** — [screens/09-dlq](screens/08-dlq-admin.md): `GET .../dlq?status=open|retried|discarded` (`dlq:read`, default limit 100, max 500, `failed_at DESC`); retry (`POST .../dlq/{id}/retry`, `dlq:retry`); discard (`POST .../dlq/{id}/discard`, **also `dlq:retry`**) behind `ConfirmDialog`; `JsonViewer` for `original_payload`. Filter-only list → client-mode Data Grid. No export / mark-resolved exists (gap).
- **Administration** — [screens/10-administration](screens/09-administration.md):
  - Admin tokens: mint (`POST /admin/v1/admin-tokens`, `admin:write`, body `{name, role, tenant_id}` → `{api_token, role}`, plaintext `cdpadm_` shown ONCE via `OneTimeSecretDialog`). `SUPER_ADMIN` mints any role/tenant; `TENANT_ADMIN` mints only non-super roles for its own tenant.
  - Role → permission matrix reference (render the canonical table read-only).
  - **Tenants (super-admin only)**: list + create (`POST /admin/v1/tenants`, body `{name}`) + mint the first `TENANT_ADMIN` token for onboarding.
- **GDPR flows** (in Customer 360): export bundle (`GET .../profiles/{cuid}/export`, `profile:read` → `{profile, identity_nodes, segment_memberships, consent}`); delete/anonymize (`DELETE .../profiles/{cuid}`, `profile:delete` → `{deleted:{<table>:count}}`) behind a `ConfirmDialog` that **requires typing the `canonical_user_id`** to confirm.
- **Dashboard** — [screens/03-dashboard](screens/02-dashboard.md): health (`GET /healthz`, `/readyz`), DLQ open count, activation success rate, processing-lag indicator, quick actions. `/metrics` is **Prometheus text, not JSON** → embed/link Grafana (`:3000` via the docker stack) rather than parsing.

### Dependencies

Phase 2 (Data Grid wrapper, `ConfirmDialog`, `OneTimeSecretDialog`, Customer 360 for GDPR, role→perm table).

### Acceptance checklist

- [ ] DLQ lists by status; retry moves an item to `retried`; discard requires confirm and moves to `discarded`.
- [ ] Minting an admin token shows the `cdpadm_` value once and never again; `TENANT_ADMIN` cannot mint super roles or other tenants.
- [ ] Super-admin can create a tenant and mint its first `TENANT_ADMIN` token; non-super roles cannot see the Tenants surface.
- [ ] GDPR export returns the full bundle; delete requires typing the `canonical_user_id` and reports `deleted` counts.
- [ ] Dashboard shows health + DLQ open count and links to Grafana; it does not attempt to parse `/metrics` as JSON.

---

## Phase 4 — Blocked / deferred

**Goal:** ship the specs and disabled scaffolding for work that cannot complete today, clearly labeled so nothing looks broken.

### Deliverables

- **Audit log** — [screens/11-audit](screens/10-audit-log.md): **blocked** on a new backend `GET .../audit` endpoint (the `audit:read` permission exists but there is no read route; `actor_id` is not populated). Build the screen spec + a visible "requires backend endpoint" banner and the intended table columns (actor, action, resource, before/after diff, ip, time). Do not fabricate an endpoint. See [Backend gaps](10-backend-gaps-and-caveats.md).
- **Stateful segmentation "behavior" leaves** (Level 3): implement the `BehaviorLeaf` variant (`kind: count|frequency|recency|absence|sequence`, `window`, etc.) **behind a feature flag**, labeled "advanced/beta". Stateless (Level 1/2) rules remain the default/shipped path; the backend has no time-window rules yet — keep gated.
- **Deferred destination types**: render `push, email, crm, ads, warehouse` as **disabled/"coming soon"** in the destination create form. Only `webhook` and `kafka` are functional.

### Dependencies

Phase 2 (Rule Builder for the behavior leaf; destination form) and Phase 3 (audit sits in the operability surface). Audit is unblocked only by backend work.

### Acceptance checklist

- [ ] Audit screen renders the intended table shape with a clear "requires backend `GET .../audit`" banner and makes no call to a non-existent endpoint.
- [ ] Behavior leaves are only reachable with the feature flag on and are labeled advanced/beta; with the flag off the Rule Builder offers only stateless leaves.
- [ ] Deferred destination types appear disabled with a "coming soon" affordance and cannot be submitted.

---

## Cross-cutting definition of done (every phase)

- [ ] Every data view has loading (skeleton), empty (`EmptyState`), and error (`ErrorState` + retry) states.
- [ ] Errors are parsed from `{ error: { code, message } }`; `429` respects `Retry-After`.
- [ ] Actions are permission-gated via `<RequirePerm>` per the role→perm table; disabled controls explain why.
- [ ] PII is rendered as received; masked values show the "unmask requires pii:read" affordance.
- [ ] Async pipeline actions show the "processing — refresh in a few seconds" notice.
- [ ] Vitest + RTL + MSW tests cover the error envelope, one-time-secret, keyset pagination, RBAC gating, and PII rendering; the Playwright golden path passes: connect token → pick tenant → create source (copy key) → look up profile → create segment (rule builder) → create webhook destination → subscribe → view deliveries.
