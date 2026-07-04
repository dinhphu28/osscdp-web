# Tech Stack (Pinned) & Project Setup

> Purpose: the authoritative, opinionated stack for `osscdp-web` with one-line rationale per choice, plus tooling, scripts, environment variables, and codegen setup. This is a build spec — treat the versions as floors ("latest stable major", majors below are the minimum).

Related docs: [App architecture & conventions](03-architecture.md) · [API integration](04-api-integration.md) · [Data model & types](07-data-model-and-types.md) · [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## 1. Pinned stack

Use the **latest stable major** of each library. The major shown is the **floor** (do not go below it).

| Concern | Choice (floor) | Rationale (one line) |
|---|---|---|
| Build tool | **Vite** v6+ | Fast dev server + optimized production builds with first-class TS/React support. |
| Language | **TypeScript**, `strict` mode on | Type safety end-to-end; the API is fully typed via Orval-generated types. |
| UI library | **MUI Material** v6+ (`@mui/material`, `@mui/icons-material`) | Richest component set for a data-dense admin console with theming and TS types. |
| Data tables | **MUI X Data Grid** v7+ | Server-side pagination/filtering (needed for keyset-paginated events) plus rich column features. |
| Date/time inputs | **MUI X Date Pickers** | Consistent, accessible date/time inputs that match the MUI theme. |
| Routing | **React Router** v6.4+ data APIs (or v7) | Nested routes under `/t/:tenantId`; data-router loaders/actions and typed params. |
| Server state | **TanStack Query** (React Query) v5 | All API reads/writes, caching, invalidation, infinite queries for cursor pagination. |
| HTTP client | **Axios** | Single instance with request/response interceptors for auth + tenant + error handling. |
| API types/hooks | **Orval** | Generates TS types + React Query hooks from the backend `openapi.yaml`. |
| Forms | **React Hook Form** v7 + **Zod** v3 (via `@hookform/resolvers`) | Performant forms with schema validation and inline field errors. |
| Validation | **Zod** v3 | Form schemas; also reused to validate segment rule trees client-side before submit. |
| Charts (dashboard) | **Recharts** (or **MUI X Charts**) | The few dashboard gauges we render; MUI X Charts if we want theme parity. |
| Unit/component tests | **Vitest** + **React Testing Library** + **MSW** | Fast Vitest runner, RTL for components, MSW to mock the admin API (error envelope, one-time secrets, keyset pagination). |
| E2E tests | **Playwright** | Golden-path browser flows across the whole console. |
| Lint/format | **ESLint** (typescript-eslint) + **Prettier** | Consistent code style and type-aware linting. |
| Local/UI state | React context + hooks; **Zustand** only if needed | Token/tenant context; reach for Zustand only when context becomes unwieldy. |
| Notifications | **notistack** (or MUI Snackbar) | Success/error toasts. |
| Package manager | **pnpm** (preferred) | Fast, disk-efficient, strict dependency resolution. |
| Node | **Node 20+** | Baseline runtime for Vite 6 and the tooling above. |

---

## 2. Why MUI + MUI X for THIS app

This is a **data-dense admin/operator console** (tables of events, DLQ items, profiles, deliveries, tokens), not a marketing site. The deciding factors:

- **Server-side Data Grid.** The events endpoint uses **keyset/cursor pagination** (`limit`/`cursor` → `next_cursor`). MUI X Data Grid supports **server mode** (manual pagination, sorting, filtering) out of the box; other kits require far more glue. See [API integration](04-api-integration.md) for the cursor wiring.
- **Forms + inputs at scale.** Sources, destinations, admin tokens, consent, and the segment rule builder all need rich, accessible inputs (selects, date pickers, nested dynamic fields). MUI + MUI X Date Pickers cover these with one coherent theme.
- **Theming.** Built-in light/dark theming with a single `theme.ts`; dark-mode toggle persisted to `localStorage` (per [architecture conventions](03-architecture.md)).
- **First-class TypeScript types** across every component, matching our strict-mode + Orval-typed approach.

We deliberately **do not** use Bootstrap, Ant Design, Tailwind, or Chakra here: Bootstrap/Chakra lack a comparable server-mode data grid; Ant Design's theming/TS story is weaker for this use; Tailwind is a styling system, not a component/data-grid library, and would mean building the grid + form controls ourselves. MUI X's Data Grid + Date Pickers are the load-bearing reason.

---

## 3. `package.json` scripts

```jsonc
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint .",
    "format": "prettier --write .",
    "codegen": "orval --config orval.config.ts"
  }
}
```

| Script | What it does |
|---|---|
| `dev` | Start the Vite dev server (default `http://localhost:5173`). |
| `build` | Type-check (`tsc -b`) then produce the production bundle. |
| `preview` | Serve the built bundle locally to smoke-test production output. |
| `test` | Run Vitest (unit/component tests with RTL + MSW). |
| `test:e2e` | Run Playwright e2e (golden path). |
| `lint` | Run ESLint over the repo. |
| `format` | Format the repo with Prettier. |
| `codegen` | Regenerate the typed API client + React Query hooks from `openapi.yaml` via Orval (see §6). |

---

## 4. Environment variables

Vite exposes only vars prefixed `VITE_` on `import.meta.env`. **No client secrets** — the admin token is entered at runtime (see the Connect screen) and never baked into env.

| Var | Required | Default / value | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes | Dev default `http://localhost:8080`; docker `stack-up` maps to `http://localhost:18080` (the OpenAPI spec's server URL) | Base URL of the osscdp API (both ingress `/v1/*` and admin `/admin/v1/*` share this single host/port). |
| `VITE_APP_NAME` | No | e.g. `osscdp console` | Optional display name in the app shell. |

> The admin Bearer token is **not** an env var. It is pasted at runtime on `/connect` and held in the auth store. See [architecture conventions](03-architecture.md).

**CORS dependency:** for the console to reach the API, the backend deployment MUST set `CORS_ALLOWED_ORIGINS` to the console's origin (empty = blocks all cross-origin). `AllowCredentials: false`, so the token goes in the `Authorization` header, never a cookie. Allowed headers include `Authorization, Content-Type, Accept, X-Api-Key`. See [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

### `.env.example` sketch

```dotenv
# Base URL of the osscdp API.
# Local backend (default):        http://localhost:8080
# Docker `stack-up` mapped port:  http://localhost:18080
VITE_API_BASE_URL=http://localhost:8080

# Optional display name shown in the app shell.
VITE_APP_NAME=osscdp console

# NOTE: There is NO token env var. The admin Bearer token is pasted at runtime on /connect.
```

---

## 5. Node / pnpm versions & editor setup

- **Node 20+** (LTS). Pin via `.nvmrc` (`20`) and/or `package.json` `"engines": { "node": ">=20" }`.
- **pnpm** is the required package manager. Pin via `"packageManager": "pnpm@<version>"` and enable `corepack enable` so contributors use the same pnpm.
- Recommended `.vscode/extensions.json`:

| Extension | ID | Why |
|---|---|---|
| ESLint | `dbaeumer.vscode-eslint` | Inline lint feedback (type-aware). |
| Prettier | `esbenp.prettier-vscode` | Format on save, matches `format` script. |
| Vitest | `vitest.explorer` | Run/debug Vitest from the editor. |
| Playwright | `ms-playwright.playwright` | Author/run e2e tests. |
| MDX/Markdown (optional) | `yzhang.markdown-all-in-one` | Editing these spec docs. |

---

## 6. Codegen (Orval)

Orval reads the backend's OpenAPI spec (`GET /openapi.yaml`, OpenAPI 3.0.3) and generates **TypeScript types + React Query v5 hooks** backed by our shared Axios instance. Run via `pnpm codegen`.

```ts
// orval.config.ts (illustrative)
import { defineConfig } from 'orval';

export default defineConfig({
  osscdp: {
    input: {
      // Point at the running backend spec, or a vendored local copy.
      target: 'http://localhost:8080/openapi.yaml',
    },
    output: {
      mode: 'tags-split',            // one folder per OpenAPI tag
      target: 'src/lib/api/generated',
      client: 'react-query',         // TanStack Query v5 hooks
      override: {
        mutator: {
          // Use our Axios instance (auth + tenant + error interceptors).
          path: 'src/lib/api/axios.ts',
          name: 'apiClient',
        },
      },
    },
  },
});
```

The generated code lands under `src/lib/api/generated` (per the folder structure in [architecture conventions](03-architecture.md)). Use Orval's hooks where generated; **hand-write hooks for the gaps** below.

### Gaps Orval will NOT cover (hand-write these)

The spec extract is incomplete in places, so several endpoints/behaviors must be added by hand. Full detail lives in [Backend gaps & caveats](10-backend-gaps-and-caveats.md); the codegen-relevant ones:

| Gap | Impact on codegen | Action |
|---|---|---|
| `DELETE /admin/v1/tenants/{tenantID}/segments/{segmentID}` — exists in code, **not in openapi.yaml** | Orval won't generate it | Add the client call + hook by hand. |
| **No "list all segments"** endpoint confirmed in spec (likely `GET .../segments`) | No generated list hook | Mark "TBD — backend gap"; hand-write once confirmed. |
| **No admin `whoami`/principal** endpoint | Cannot fetch current token's role/perms | Declare role client-side; ship the role→permission table (see [architecture conventions](03-architecture.md)). |
| **Audit log is write-only** — no read/query route (`audit:read` exists, no endpoint) | No generated audit hook | Audit screen is Phase 2 / blocked on backend `GET .../audit`. |
| Events **keyset pagination** (`limit`/`cursor` → `next_cursor`) | Generated hook may not model cursor state | Wrap in `useInfiniteQuery`; drive Data Grid server mode. |
| Some **per-profile sub-resources** (identity-cluster, events, segments) not fully in spec | Missing/partial hooks | Mark "TBD — confirm endpoint" and hand-write. |

Where the spec is thin, the **hand-written canonical types** in [Data model & types](07-data-model-and-types.md) fill the gap — use those exact names alongside Orval output.
