# Documentation Index & Reading Order

> Map of all osscdp-web build-spec docs and the exact order the AI coding agent should read them before writing any code.

`osscdp-web` is a **React + TypeScript admin/operator console** for **osscdp**, an open-source Customer Data Platform (CDP) backend (Go). These documents are a **build specification** for the AI coding agent that will implement the app. Read them in the order below; do not start coding until you have read at least docs 01–08 for the surface you are building, plus [09-build-roadmap.md](09-build-roadmap.md) and [10-backend-gaps-and-caveats.md](10-backend-gaps-and-caveats.md).

## Reading order (numbered)

Read top-to-bottom. Each doc assumes you have read the ones above it.

1. **[01-product-overview.md](01-product-overview.md)** — what a CDP is, what the console operates, the domain in one paragraph, and the cross-cutting facts (async pipeline, token-only auth, tenant scoping, PII masking, one-time secrets).
2. **[02-tech-stack.md](02-tech-stack.md)** — the pinned, opinionated stack (Vite + TS strict, MUI v6+ / MUI X Data Grid v7+, React Router, TanStack Query v5, Axios, Orval, RHF + Zod, Vitest/RTL/MSW, Playwright, pnpm, Node 22.13+), env vars, and CORS constraints.
3. **[03-architecture.md](03-architecture.md)** — folder structure (feature-based), providers, routing shape (`/t/:tenantId/<feature>`), query-key factory, UI conventions (PageHeader, OneTimeSecretDialog, ConfirmDialog, states, permission gating).
4. **[04-api-integration.md](04-api-integration.md)** — Axios instance + interceptors, `tenantPath()` helper, error envelope handling, pagination conventions (keyset for events, filter-only elsewhere), Orval codegen from `openapi.yaml`.
5. **[05-auth-rbac-tenancy.md](05-auth-rbac-tenancy.md)** — token-only auth (paste admin Bearer token, no login), the 6 roles and canonical role→permission table, tenant scoping by URL path, `<RequirePerm>` gating, PII masking rules.
6. **[06-design-system.md](06-design-system.md)** — MUI theme (light/dark), shared components, StatusChip, relative-time formatting, empty/loading/error states, notistack toasts, accessibility.
7. **[07-data-model-and-types.md](07-data-model-and-types.md)** — the canonical hand-written TypeScript types and enums that supplement Orval output; screen specs reference these names.
8. **Screen specs** — read **[screens/screen-map.md](screens/00-screen-map.md) first** (route → screen index), then the individual screen docs under `docs/screens/` for the surface you are building (connect, shell, dashboard, sources, events, customer 360, segments, activation, dlq, administration, audit).
9. **[08-testing.md](08-testing-and-quality.md)** — Vitest + RTL + MSW conventions, Playwright golden path, RBAC/PII test requirements, a11y.
10. **[09-build-roadmap.md](09-build-roadmap.md)** — **the execution order.** Follow this doc's phasing when implementing; it sequences scaffolding → auth/shell → per-feature delivery.
11. **[10-backend-gaps-and-caveats.md](10-backend-gaps-and-caveats.md)** — **what cannot be built yet** and where the API is missing/inconsistent. Consult before building any screen; several features (e.g. audit read, segment "list all") are blocked or need hand-written client code.

## Document map

| Doc path                                                         | What it covers                                   | When to read it                      |
| ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| [01-product-overview.md](01-product-overview.md)                 | CDP domain, console purpose, cross-cutting facts | First — grounds everything           |
| [02-tech-stack.md](02-tech-stack.md)                             | Pinned stack, env vars, CORS                     | Before scaffolding                   |
| [03-architecture.md](03-architecture.md)                         | Folders, providers, routes, UI conventions       | Before scaffolding                   |
| [04-api-integration.md](04-api-integration.md)                   | Axios, interceptors, pagination, Orval           | Before writing any API call          |
| [05-auth-rbac-tenancy.md](05-auth-rbac-tenancy.md)               | Token auth, roles/permissions, tenancy, PII      | Before auth/shell + any gated action |
| [06-design-system.md](06-design-system.md)                       | Theme, shared components, states, a11y           | Before building UI                   |
| [07-data-model-and-types.md](07-data-model-and-types.md)         | Canonical TS types & enums                       | When typing data or building forms   |
| [screens/screen-map.md](screens/00-screen-map.md)                | Route → screen index (read first of screens)     | Before any screen                    |
| `docs/screens/*`                                                 | Per-screen build specs                           | When building that screen            |
| [08-testing.md](08-testing-and-quality.md)                       | Unit/component/e2e/a11y conventions              | Alongside each feature               |
| [09-build-roadmap.md](09-build-roadmap.md)                       | **Execution order / phasing**                    | To decide what to build next         |
| [10-backend-gaps-and-caveats.md](10-backend-gaps-and-caveats.md) | **What can't be built yet + API caveats**        | Before every screen; when blocked    |

## How these docs relate

Docs 01–07 are **foundational reference**: they define the domain, stack, architecture, API integration, security model, design system, and shared types. Every screen spec under `docs/screens/` builds on that foundation and is intentionally thin — it names the exact routes, permissions, API paths, types (from [07-data-model-and-types.md](07-data-model-and-types.md)), states, and acceptance criteria for one surface, and cross-links back to the foundational docs (screen files link up with `../`, e.g. [API integration](04-api-integration.md)). [08-testing.md](08-testing-and-quality.md) applies across all features.

Two docs govern **what and when**: [09-build-roadmap.md](09-build-roadmap.md) is the **execution order** — implement features in the sequence it prescribes, not in document-number order. [10-backend-gaps-and-caveats.md](10-backend-gaps-and-caveats.md) lists everything that **cannot be built yet** or where the backend API is missing/inconsistent (no admin `whoami`, write-only audit log with no read route, no segment "list all", `DELETE .../segments/{id}` absent from `openapi.yaml`, etc.). Whenever a screen spec says "TBD — backend gap", it links there. Check both before starting a screen: the roadmap tells you if it's in scope now, the gaps doc tells you if it's even possible.

### Non-negotiable conventions to carry into every doc

These come from the canonical brief and must not be violated by any screen or code:

- **Async pipeline.** Ingest returns `202`; identity → profile → segmentation → activation happen seconds later. Never promise instant results; show processing-lag/refresh UX.
- **Token-only auth.** No login/username/password/session/JWT. Build a "paste your admin token" flow (`/connect`), send `Authorization: Bearer <adminToken>` on every `/admin/v1/*` request.
- **Tenant-scoped by URL path** `{tenantID}` (UUID). Route shape `/t/:tenantId/<feature>`; never send tenant in body/header.
- **PII masking is server-side.** Render values as received; never attempt client-side unmasking. Unmask requires the `pii:read` permission on the token.
- **One-time secrets.** Source API keys, admin tokens, and destination secrets are shown in plaintext exactly once — use `OneTimeSecretDialog`.

```tsx
// The gate that recurs across screens — compute perms from the role→perm table (see 05).
<RequirePerm perm="segment:write">
  <Button onClick={createSegment}>New segment</Button>
</RequirePerm>
```
