# Testing & Quality Strategy

> How to test the osscdp-web admin console: unit/component tests, API mocking, e2e, RBAC/PII coverage, accessibility, and CI gates. This is a build spec — follow it exactly.

Related docs: [API integration](04-api-integration.md) · [Data model & types](07-data-model-and-types.md) · [App architecture](03-architecture.md) · [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## 1. Test pyramid & tooling

| Layer            | Tooling                                        | What it covers                                                                                                      | Volume          |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| Unit             | **Vitest**                                     | Pure functions: Zod schemas, rule-builder → `Rule` JSON, permission math, masking/format helpers, query-key factory | Most tests      |
| Component / hook | **Vitest + React Testing Library (RTL) + MSW** | Forms, tables, dialogs, query/mutation hooks, RBAC gating, PII rendering — against a mocked admin API               | Many            |
| E2E              | **Playwright**                                 | The golden path + key flows (§5) through a real browser, with the admin API mocked via **in-browser route interception** (not MSW, no backend by default) | Few, high-value |

Pinned choices (from the canonical stack): Vitest, React Testing Library, MSW for **unit/component/hook tests**; Playwright with in-browser route interception for **e2e**. Do not introduce Jest, Cypress, or other runners. Note the split: MSW (a Service Worker) mocks the API for the jsdom unit/component layer; Playwright e2e mocks it with `page.route` in a real browser (§5) — MSW is **not** used for e2e.

Run scripts (add to `package.json`):

```jsonc
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:e2e": "playwright test",
    "build": "vite build",
  },
}
```

Global test setup (`src/test/setup.ts`): install `@testing-library/jest-dom`, start the MSW `server`, `resetHandlers()` after each test, `close()` after all. Wrap rendered components in a shared `renderWithProviders` helper that mounts `QueryClientProvider` (a fresh `QueryClient` with retries disabled), `ThemeProvider`, `TenantProvider`, `AuthProvider`, `SnackbarProvider`, and a `MemoryRouter` seeded to the route under test.

```tsx
// src/test/renderWithProviders.tsx (illustrative)
export function renderWithProviders(
  ui: ReactNode,
  { role = 'VIEWER', tenantId = TENANT, route = '/' } = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        <AuthProvider initialToken="cdpadm_test" initialRole={role}>
          <TenantProvider initialTenantId={tenantId}>
            <SnackbarProvider>
              <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
            </SnackbarProvider>
          </TenantProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}
```

---

## 2. MSW: mock the admin API faithfully

MSW handlers live in `src/test/msw/`. They MUST reproduce the real backend contracts from [API integration](04-api-integration.md), because bugs hide in the envelopes and pagination — not the happy path. Base all handlers on `${VITE_API_BASE_URL}/admin/v1/...` and read the `Authorization: Bearer` header.

### 2.1 Exact error envelope

Every error response uses `pkg/apierror` shape — never a bare string:

```ts
// src/test/msw/errors.ts
export const apiError = (code: string, message: string) => ({ error: { code, message } });
// code → HTTP: bad_request 400, unauthorized 401, forbidden 403, not_found 404,
// conflict 409, payload_too_large 413, rate_limited 429, internal_error 500, not_ready 503
```

Handlers return e.g. `HttpResponse.json(apiError('forbidden', 'tenant scope violation'), { status: 403 })`. Tests assert the console parses `error.code`/`error.message` and routes it correctly.

### 2.2 One-time secret responses

Source key, admin token, and destination secret are returned in plaintext **exactly once** at create/rotate. Mock handlers return the secret field only on the create/rotate call; a subsequent GET of the entity MUST NOT include it.

| Endpoint                                                          | One-time field                                           | Prefix    |
| ----------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| `POST /admin/v1/tenants/{tenantID}/sources`                       | `api_key` (`SourceKeyOnce`)                              | `cdp_`    |
| `POST /admin/v1/tenants/{tenantID}/sources/{sourceID}/rotate-key` | `api_key`                                                | `cdp_`    |
| `POST /admin/v1/admin-tokens`                                     | `api_token` (`AdminTokenOnce`)                           | `cdpadm_` |
| `POST /admin/v1/tenants/{tenantID}/destinations`                  | secret is accepted in the request but **never returned** | —         |

Component test: creating a source shows `OneTimeSecretDialog` with the returned `api_key`, and the dialog copy warns the value cannot be retrieved again; closing requires explicit confirm.

### 2.3 Keyset pagination (`next_cursor`)

ONLY `GET /admin/v1/tenants/{tenantID}/events` is keyset-paginated: query `limit` (default 50, max 500) + `cursor` (opaque) → response `{ events: [...], next_cursor: string }` (shape `KeysetPage<RawEvent>`). Mock a multi-page dataset and verify `useInfiniteQuery` requests the next page with the returned `next_cursor` and stops when `next_cursor` is empty.

```ts
http.get(`${base}/admin/v1/tenants/:tenantID/events`, ({ request }) => {
  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') ?? '';
  const page = pages[cursor] ?? pages['']; // { events, next_cursor }
  return HttpResponse.json(page);
});
```

All other list endpoints are **filter-only, no paging** (profiles by email/phone, dlq by status, segment members, deliveries, consent, replay) — return the full array and test client-side Data Grid paging.

### 2.4 Masked vs unmasked PII

PII masking is server-side. Provide two profile fixtures keyed off whether the mocked token holds `pii:read`:

| Trait | Masked (no `pii:read`) | Unmasked (`pii:read`) |
| ----- | ---------------------- | --------------------- |
| email | `u***@x.com`           | `user@example.com`    |
| phone | `+8490****567`         | `+84901234567`        |
| name  | `N***`                 | `Nguyen`              |

Tests: the console renders the value **as received** (never unmasks client-side); when a value looks masked and the role lacks `pii:read`, a lock-icon tooltip "unmask requires pii:read" is shown.

### 2.5 403 tenant-scope, 429 Retry-After

- **403** — return `apiError('forbidden', 'tenant scope violation')` for a non-super token hitting a foreign `{tenantID}`. Assert a toast is shown and the token is NOT cleared (403 ≠ 401).
- **401** — return `apiError('unauthorized', ...)`; assert the token is cleared and the user is redirected to `/connect`.
- **429** — return `apiError('rate_limited', ...)` with a `Retry-After: 2` header (integer seconds). Assert the client reads `Retry-After` and backs off rather than hammering.

---

## 3. What to unit-test per feature

| Feature                 | Unit/component assertions                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connect / token entry   | Zod validates token presence + optional base-URL override; a cheap validation call gates entry; token is stored; bad token → stays on `/connect`       |
| Auth / RBAC             | `permissionsForRole(role)` matches the role→perm table exactly; `<RequirePerm>` hides/disables gated actions                                           |
| Sources                 | Create form validates via Zod; `OneTimeSecretDialog` shows `api_key`; rotate-key is behind a `ConfirmDialog`                                           |
| Events                  | `useInfiniteQuery` cursor paging; filters `identifier_key` (e.g. `user_id:u1`) + `event_name` build correct query params; payload `JsonViewer` renders |
| Profiles / 360          | Search requires `email` OR `phone` (400 if neither); masked traits render as-is; identifiers show `by_namespace`/`total`                               |
| Consent                 | Editor maps channel×purpose grid; `PUT consent` body `{channel, purpose, status, source?}`; absence renders as `unknown`                               |
| GDPR                    | Export renders bundle; delete requires typing the `canonical_user_id` to confirm                                                                       |
| Segments / rule builder | **Rule builder emits correct `Rule` JSON** (see §3.1); Zod validates the tree; server `bad_request` maps to form errors                                |
| Destinations            | Webhook vs kafka `config` schema; one-time secret; subscription body `{trigger_type:"segment_membership", segment_id}`                                 |
| DLQ                     | Filter by `status=open                                                                                                                                 | retried | discarded`; retry/discard behind confirm; payload viewer |
| Query hooks             | Mutations invalidate the right query keys (`qk.*(tenantId)...`); error interceptor maps codes                                                          |

### 3.1 Rule-builder → `Rule` JSON

The most important pure-logic test. Given a nested AND/OR/NOT tree built in the UI, the serializer must produce the recursive `Rule` from [Data model & types](07-data-model-and-types.md):

```ts
// (age >= 18) AND (country in ["VN","US"])
const expected: Rule = {
  operator: 'and',
  conditions: [
    { field: 'profile.traits.age', op: 'gte', value: 18 },
    { field: 'profile.traits.country', op: 'in', value: ['VN', 'US'] },
  ],
};
```

Cover: valid ops per `RuleOp`; `in`/`not_in` take arrays; `exists`/`not_exists` take **no** `value`; nested `not` nodes; field picker limited to the known namespaces (`profile.traits.*`, `profile.computed_attributes.*`, `profile.canonical_user_id`, `profile.first_seen_at`, `profile.last_seen_at`, `event.event_name`, `event.type`, `event.properties.*`, `event.context.*`); the advanced `BehaviorLeaf` (stateful, `count`/`frequency`/`recency`/`absence`/`sequence`) is only reachable behind the feature flag and labeled advanced/beta.

---

## 4. RBAC & PII coverage (mandatory)

Drive these from the canonical role→permission table. Parametrize component tests over roles.

| Role           | Write actions expected visible                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIEWER`       | **None** — all write/mutating actions hidden or disabled (read set only)                                                                                                      |
| `ANALYST`      | None (read set only)                                                                                                                                                          |
| `OPERATOR`     | DLQ retry/discard (`dlq:retry`), event replay (`event:replay`); no segment/destination/admin writes                                                                           |
| `MARKETER`     | Segment write (`segment:write`), destination write (`destination:write`), consent write (`consent:write`); **not** admin/tenant, **not** `profile:delete`, **not** `pii:read` |
| `TENANT_ADMIN` | All writes within its tenant, incl. `admin:write`, `profile:delete`, `pii:read`                                                                                               |
| `SUPER_ADMIN`  | All, cross-tenant; tenant switcher shows all tenants; can create tenants (`POST /admin/v1/tenants`)                                                                           |

Required RBAC assertions:

- **VIEWER hides all write actions.** No "Create source", "Mint token", "Create segment", "Retry", "Delete", "Rotate key", etc. Gated buttons that render disabled carry a tooltip "requires `<perm>`".
- **MARKETER** shows segment/destination/consent write controls but NOT administration (tokens/roles/tenants) and NOT GDPR delete.
- **`pii:read` gating.** With a role lacking `pii:read` (e.g. MARKETER/ANALYST/OPERATOR/VIEWER), profile traits render masked and the lock affordance appears; with `pii:read` (SUPER_ADMIN/TENANT_ADMIN) the unmasked fixture renders.
- UI gating is UX only — server also enforces (403). Include at least one test where a hidden action, if forced, still yields a mocked 403 handled gracefully.

```tsx
it.each(['VIEWER', 'ANALYST'] as const)('%s hides Create Segment', (role) => {
  renderWithProviders(<SegmentsPage />, { role, route: `/t/${TENANT}/segments` });
  expect(screen.queryByRole('button', { name: /create segment/i })).not.toBeInTheDocument();
});
```

---

## 5. Playwright e2e (in-browser API mock)

E2E drives the **real UI** in a real browser (Chromium) while the cross-origin admin API is **mocked inside the browser** with Playwright's `page.route`. There is **no MSW and no running backend by default** — this keeps CI hermetic without standing up the Go + Postgres + Redpanda stack. All specs live in `e2e/` and share one harness.

### 5.1 Shared harness — `e2e/support.ts`

- **`installMockApi(page, seed?)`** — installs a `page.route('${BASE_API}/**', …)` handler that mocks the admin API in-browser. It:
  - handles **CORS**: every response carries `access-control-allow-*` headers and `OPTIONS` preflight is answered with `204`, because the app calls a **cross-origin** base URL (`http://localhost:8080`) from the dev server origin (`http://localhost:5173`);
  - returns responses **shaped like the generated Orval models** (sources, tokens, tenants, profiles, consent, identifiers, export, segments, destinations, subscriptions, deliveries, DLQ, events), with a catch-all empty `200` so an unmodelled call never hangs the UI;
  - **records every request** (`{ method, path, body }`) on the returned handle's `requests` array for assertions (e.g. that the create call carried the form values);
  - accepts a **`seed`** whose fields (`profiles`, `profile`, `dlqEvents`, `events`, `segment`, `destination`, `healthFails`) can be set before navigation to drive specific states; the handle's `seed` can also be mutated later.
- **`connect(page, { role?, tenantId? })`** — performs the token-entry flow: navigate to `/connect`, fill the admin token, optionally select a **role** (default `SUPER_ADMIN`) via the MUI Select so RBAC gating can be exercised, fill the tenant ID (default `TEST_TENANT`), submit, and assert landing on `/t/{tenantId}/dashboard`.
- **Constants** — `TEST_TENANT` (`1111…`), `TEST_TOKEN` (`cdpadm_e2e_test_token`), `BASE_API` (`http://localhost:8080`).

### 5.2 Specs present in `e2e/`

| Spec                     | Covers                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `golden-path.spec.ts`    | Full flow: connect → dashboard (health chip) → create source (one-time key dialog) → profile lookup → create webhook destination.        |
| `sources.spec.ts`        | Creating a source surfaces the one-time ingest API-key dialog; rotate-key (by ID) confirms then surfaces the new one-time key.           |
| `customer360.spec.ts`    | Open a seeded profile; masked traits + computed attributes render; consent change (`PUT .../consent`); GDPR delete (typed confirm → `DELETE` → back to search). |
| `segments.spec.ts`       | Segments → new-segment editor → drive the RuleBuilder (assert validation on the empty default leaf, then pick field + value) → create.   |
| `dlq.spec.ts`            | DLQ triage: list dead-lettered events, inspect one in the detail Drawer, retry (republish) and discard (behind a `ConfirmDialog`).       |
| `rbac-and-shell.spec.ts` | VIEWER read-only gating on nav/actions; app-shell controls (role chip, theme toggle, disconnect) for a SUPER_ADMIN.                       |

### 5.3 Determinism choices

- **Serial run** — `playwright.config.ts` sets `workers: 1` and `fullyParallel: false`; the specs share one dev server and mock the API per-page, so serial execution keeps timing deterministic (the suite is small and fast).
- **Animations disabled** — `installMockApi` injects an `addInitScript` that sets `transition/animation: none` globally and hides `.MuiTooltip-popper`, so MUI menus/dialogs/selects open instantly and stably (avoids "element not stable / detached" flakes and tooltip overlays intercepting clicks).
- CI reliability extras: `retries: 1` and `trace: 'on-first-retry'` on CI; `forbidOnly` on CI.

### 5.4 How to run

```bash
pnpm exec playwright install chromium   # once, to fetch the browser
pnpm test:e2e                            # runs playwright test
```

Playwright **auto-starts the dev server** via the `webServer` config (`command: 'pnpm dev'`, `url: http://localhost:5173`, `reuseExistingServer` off CI) — you do not start it manually.

### 5.5 Escape hatch — running against a LIVE backend

To exercise a real backend instead of the mock (per the `e2e/support.ts` header comment): point **`VITE_API_BASE_URL`** at the live API, **remove/skip the `installMockApi(page, …)` call**, and **seed real data** first (e.g. via a `SUPER_ADMIN` bootstrap token, backend `ADMIN_API_TOKEN`). Note the pipeline is **asynchronous** (ingest returns `202`; identity→profile→segmentation→activation happen seconds later), so any live-backend step that depends on downstream results must poll with a bounded retry (Playwright `expect.poll` / `toPass`) rather than asserting instantly, and the UI's "processing — refresh" affordance applies.

---

## 6. Accessibility, visual & state coverage

- **axe** — run `@axe-core/playwright` (e2e) and/or `vitest-axe` (component) on each major screen; zero serious/critical violations.
- **Keyboard** — every primary action, dialog (`OneTimeSecretDialog`, `ConfirmDialog`), and the tenant switcher operable by keyboard; focus trapped in modals; focus returns to trigger on close. MUI X Data Grid a11y (roles, aria labels) verified.
- **State coverage** — every data view is tested in all four states: **loading** (skeletons), **empty** (`EmptyState`), **error** (`ErrorState` with retry), and **success**. Drive loading via delayed MSW handlers and error via the error envelope from §2.1.
- **Color contrast / dark mode** — verify contrast in both light and dark themes; theme preference persists to localStorage.

---

## 7. CI outline & coverage

CI runs on every PR, in order; fail fast:

```yaml
# jobs (illustrative)
1. install   # pnpm install --frozen-lockfile
2. lint      # pnpm lint         (ESLint + Prettier check)
3. typecheck # pnpm typecheck    (tsc --noEmit, strict)
4. unit      # pnpm test:cov     (Vitest + coverage gate)
5. build     # pnpm build        (vite build must succeed)
6. e2e       # pnpm exec playwright install chromium && pnpm test:e2e   (auto-starts dev server via webServer, API mocked in-browser — no backend)
```

Also regenerate Orval types (`openapi.yaml`) and fail if the committed generated client is stale.

Coverage expectations (Vitest `--coverage`, thresholds enforced in CI):

| Area                                                                                | Line/branch floor          |
| ----------------------------------------------------------------------------------- | -------------------------- |
| Pure logic (rule serializer, permission table, Zod schemas, masking/format helpers) | ~90%                       |
| Feature components/hooks                                                            | ~80%                       |
| Overall project                                                                     | ~80% lines / ~75% branches |

Generated Orval output and pure type files may be excluded from coverage.

---

## 8. Definition of done (per screen)

A screen is DONE only when ALL hold. This ties to each screen doc's **Acceptance criteria (checklist)** in `docs/screens/*`.

- [ ] Renders loading, empty, error, and success states (skeleton / `EmptyState` / `ErrorState` with retry).
- [ ] Uses only the exact endpoints, permissions, and enum values from the brief; unknowns marked **TBD — backend gap** and linked to [backend gaps](10-backend-gaps-and-caveats.md).
- [ ] RBAC gating verified for every relevant role (write actions hidden/disabled per the role→perm table; VIEWER shows no writes).
- [ ] PII rendered as received; lock affordance when masked without `pii:read`; no client-side unmasking.
- [ ] One-time secrets shown via `OneTimeSecretDialog` (copy-once, unrecoverable warning, confirm-to-close); destructive/irreversible actions behind `ConfirmDialog` (GDPR delete requires typing the `canonical_user_id`).
- [ ] Forms validate via Zod; server `bad_request` mapped to fields or a form-level alert; submit disabled while pending.
- [ ] Async-pipeline actions (ingest-affecting, replay) show the "processing — refresh" affordance.
- [ ] Async list uses correct paging (events = keyset `next_cursor` server mode; others = client-side Data Grid).
- [ ] Error interceptor behavior correct: 401 → clear token + `/connect`; 403 → toast; 429 → respect `Retry-After`.
- [ ] a11y: keyboard-operable, aria labels present, axe passes (no serious/critical), light + dark contrast OK.
- [ ] Unit/component tests + at least the golden-path coverage for the flows it participates in pass in CI.

---

## Backend caveats affecting tests

Some flows are blocked or partial (see [backend gaps](10-backend-gaps-and-caveats.md)): no admin `whoami` (role is declared client-side, so RBAC tests use the seeded role, not a fetched one); **audit log is write-only** (no read endpoint) — test only the "requires backend endpoint" banner, not a data table; `DELETE .../segments/{id}` exists in code but not `openapi.yaml` (hand-written client + test); no segment "list all" endpoint confirmed (**TBD — backend gap**). Do not write tests that assume these gaps are filled.
