# osscdp-web — Admin Console for osscdp CDP

> Repo entry point: what this is, how the docs are organized, and how an AI coding agent should use them to build the app.

`osscdp-web` is a **React + TypeScript admin/operator console** for **osscdp**, an open-source Customer Data Platform (CDP) whose backend is written in Go and is currently **API-only (no UI)**. This is the first console for that backend. Everything in `docs/` is a **build specification** — a concrete, prescriptive plan for an AI coding agent that will implement the app later. The app is **not built yet**; the code in this repo is generated from the specification.

---

> **For the AI agent building this — read [docs/00-index.md](docs/00-index.md) first, then follow [docs/09-build-roadmap.md](docs/09-build-roadmap.md) phase by phase. The pinned stack in [docs/02-tech-stack.md](docs/02-tech-stack.md) is authoritative.**

---

## Six critical cross-cutting facts

These shape nearly every screen — internalize them before writing any code:

1. **The pipeline is ASYNCHRONOUS.** Ingest returns `202`; identity → profile → segmentation → activation happen seconds later. The UI must set expectations ("wait, then refresh"), never promise instant results, and show processing-lag / loading states.
2. **Token-only auth.** There is **NO** user login, username/password, session, JWT, or users table. The console uses a pasted **admin Bearer token**. Build a "paste your admin token" flow, **not** a login form.
3. **Tenant-path scoping.** Everything admin is tenant-scoped by the URL path segment `{tenantID}` (a UUID). Super-admin tokens are cross-tenant; every other token is pinned to one tenant (`403 tenant scope violation` otherwise). Tenant is **never** sent in body or header.
4. **Server-side PII masking.** Traits like email/phone/name come back masked (`u***@x.com`, `+8490****567`, `N***`) unless the token holds `pii:read`. The frontend renders what it receives and **never** attempts client-side unmasking.
5. **One-time secrets.** Source API keys (`cdp_...`), admin tokens (`cdpadm_...`), and destination secrets are returned in plaintext **exactly once** at creation/rotation. The UI shows a copy-once modal and warns the value cannot be retrieved again.
6. **Two separate auth systems.** The admin console **only** uses admin tokens. Source API keys (`cdp_...`) are provisioned by the console for hand-off to the customer's engineers; the console never authenticates with them.

---

## Chosen stack (summary)

**MUI Material v6+ / MUI X Data Grid v7+ / MUI X Date Pickers · Vite v6+ (TypeScript strict) · React Router v6.4+ data APIs · TanStack Query v5 · Axios · React Hook Form v7 + Zod v3 · Orval (types + hooks from `openapi.yaml`) · Recharts · Vitest + React Testing Library + MSW · Playwright · ESLint + Prettier · pnpm · Node 22.13+.**

Full rationale and version floors live in [docs/02-tech-stack.md](docs/02-tech-stack.md).

---

## Quickstart (intended commands — app not built yet)

The commands below are the **planned** developer workflow once the agent has scaffolded the project. None of this exists yet.

```bash
pnpm install          # install dependencies
pnpm dev              # start Vite dev server
pnpm codegen          # run Orval to generate TS types + React Query hooks from openapi.yaml
pnpm test             # Vitest unit/component tests
pnpm test:e2e         # Playwright end-to-end tests
pnpm build            # production build
```

Orval codegen reads the backend spec (`GET /openapi.yaml`, OpenAPI 3.0.3). Where the spec is incomplete, hand-written types from [docs/07-data-model-and-types.md](docs/07-data-model-and-types.md) fill the gap.

## Environment variables

Vite exposes these via `import.meta.env`. **No client secrets** — the admin token is entered at runtime, never baked into env.

| Var                 | Purpose                    | Value                                                                                                                      |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | Base URL of the osscdp API | Dev default `http://localhost:8080`; docker `stack-up` maps it to `http://localhost:18080` (the OpenAPI spec's server URL) |
| `VITE_APP_NAME`     | Optional display name      | e.g. `osscdp console`                                                                                                      |

Example `.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_APP_NAME=osscdp console
```

## Backend & CORS

- **Backend repo:** `/home/dinhphu28/ghq/github.com/dinhphu28/osscdp` (Go, API-only). This console consumes its **admin API** (`/admin/v1/*`); the ingress API (`/v1/*`) is only referenced as instrumentation help text.
- **CORS is mandatory.** Backend CORS is driven by env `CORS_ALLOWED_ORIGINS` (empty = blocks all cross-origin). The backend deployment **MUST** set `CORS_ALLOWED_ORIGINS` to include the console's origin, or every request fails. `AllowCredentials: false`, so the token travels in the `Authorization` header (never a cookie). Allowed headers include `Authorization, Content-Type, Accept, X-Api-Key`.

---

## Documentation map

Read in order; the index and roadmap are the entry points. Screen specs under `docs/screens/` link up to sibling docs with `../`.

| Doc                                                                         | Purpose                                                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [docs/00-index.md](docs/00-index.md)                                        | **Start here.** Doc map + reading order for the agent.                             |
| [docs/01-overview-and-domain.md](docs/01-product-overview.md)               | The CDP domain, pipeline, and product scope.                                       |
| [docs/02-tech-stack.md](docs/02-tech-stack.md)                              | **Authoritative** pinned stack, versions, tooling config.                          |
| [docs/03-auth-rbac-tenancy.md](docs/05-auth-rbac-tenancy.md)                | Token auth, 6 roles, role→permission table, tenancy, PII masking.                  |
| [docs/04-api-integration.md](docs/04-api-integration.md)                    | Axios/interceptors, TanStack Query, query-key factory, error envelope, pagination. |
| [docs/05-app-architecture.md](docs/03-architecture.md)                      | Folder structure, routing, shared components, UI conventions.                      |
| [docs/06-api-reference.md](docs/04-api-integration.md)                      | Exact admin endpoints, params, permissions, request/response shapes.               |
| [docs/07-data-model-and-types.md](docs/07-data-model-and-types.md)          | Canonical TypeScript types and enums.                                              |
| [docs/08-testing.md](docs/08-testing-and-quality.md)                        | Vitest/RTL/MSW + Playwright conventions and golden path.                           |
| [docs/09-build-roadmap.md](docs/09-build-roadmap.md)                        | **Phase-by-phase build plan.** Follow in order.                                    |
| [docs/10-backend-gaps-and-caveats.md](docs/10-backend-gaps-and-caveats.md)  | Known backend gaps, TBDs, and workarounds.                                         |
| [docs/screens/01-connect.md](docs/screens/01-connect-and-shell.md)          | Connect / token entry (`/connect`).                                                |
| [docs/screens/02-app-shell.md](docs/screens/01-connect-and-shell.md)        | Nav rail, top bar, tenant switcher, theme toggle.                                  |
| [docs/screens/03-dashboard.md](docs/screens/02-dashboard.md)                | Health, key metrics, DLQ count, activation rate.                                   |
| [docs/screens/04-sources.md](docs/screens/03-sources.md)                    | Sources list, create, rotate key, instrumentation help.                            |
| [docs/screens/05-events.md](docs/screens/04-events-explorer.md)             | Keyset-paginated events explorer + replay.                                         |
| [docs/screens/06-customer-360.md](docs/screens/05-customer-360.md)          | Profile search, identity, events, segments, consent, GDPR.                         |
| [docs/screens/07-segments.md](docs/screens/06-segments-and-rule-builder.md) | Segment list, rule builder, versions, members.                                     |
| [docs/screens/08-activation.md](docs/screens/07-activation-destinations.md) | Destinations, subscriptions, delivery log.                                         |
| [docs/screens/09-dlq.md](docs/screens/08-dlq-admin.md)                      | DLQ list/filter, retry, discard.                                                   |
| [docs/screens/10-administration.md](docs/screens/09-administration.md)      | Admin tokens, role matrix, tenants (super-admin).                                  |
| [docs/screens/11-audit.md](docs/screens/10-audit-log.md)                    | Audit log — **Phase 2, blocked on backend endpoint**.                              |

> Some docs listed above may not exist yet — they are the intended structure. Where a fact is genuinely unknown, docs say "TBD — backend gap" and link [docs/10-backend-gaps-and-caveats.md](docs/10-backend-gaps-and-caveats.md) rather than guessing.

---

## Key patterns at a glance

Admin requests carry the pasted token and inject the tenant into the path:

```ts
// tenantPath(tenantId, suffix) → /admin/v1/tenants/${tenantId}${suffix}
api.get(tenantPath(tenantId, '/events'), { params: { limit: 50, cursor } });
// Authorization: Bearer <adminToken> is added by a request interceptor.
```

There is **no admin `whoami` endpoint** — the console holds the canonical role→permission table client-side and gates UI accordingly (UX only; the server also enforces `403`). See [docs/03-auth-rbac-tenancy.md](docs/05-auth-rbac-tenancy.md) and [docs/10-backend-gaps-and-caveats.md](docs/10-backend-gaps-and-caveats.md).
