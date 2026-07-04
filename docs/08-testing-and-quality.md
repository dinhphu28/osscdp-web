# Testing & Quality Strategy

> How to test the osscdp-web admin console: unit/component tests, API mocking, e2e, RBAC/PII coverage, accessibility, and CI gates. This is a build spec — follow it exactly.

Related docs: [API integration](04-api-integration.md) · [Data model & types](07-data-model-and-types.md) · [App architecture](03-architecture.md) · [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## 1. Test pyramid & tooling

| Layer            | Tooling                                        | What it covers                                                                                                      | Volume          |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| Unit             | **Vitest**                                     | Pure functions: Zod schemas, rule-builder → `Rule` JSON, permission math, masking/format helpers, query-key factory | Most tests      |
| Component / hook | **Vitest + React Testing Library (RTL) + MSW** | Forms, tables, dialogs, query/mutation hooks, RBAC gating, PII rendering — against a mocked admin API               | Many            |
| E2E              | **Playwright**                                 | The golden path (§5) through a real browser against a running (or mocked) backend                                   | Few, high-value |

Pinned choices (from the canonical stack): Vitest, React Testing Library, MSW for component/hook tests; Playwright for e2e. Do not introduce Jest, Cypress, or other runners.

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

## 5. Golden-path Playwright e2e

One end-to-end flow (brief §5). Prefer running against a real backend via docker `stack-up` (`VITE_API_BASE_URL=http://localhost:18080`, backend `CORS_ALLOWED_ORIGINS` set to the console origin, `AllowCredentials:false`); for CI without a backend, run Playwright with MSW/route interception using the same fixtures. Seed with a `SUPER_ADMIN` bootstrap token (backend `ADMIN_API_TOKEN`).

Steps:

1. **Connect** — paste admin token (optional role declaration + base-URL override) at `/connect`; a cheap validation call succeeds; land on tenant picker.
2. **Pick tenant** — select a tenant via the switcher → `/t/:tenantId/dashboard`.
3. **Create source** — `POST .../sources`; `OneTimeSecretDialog` shows the `cdp_...` key; click copy; confirm-to-close; the key is gone afterward.
4. **Lookup profile** — Customer 360 search by `email`/`phone` → profile detail; assert masked-vs-unmasked per token.
5. **Create segment via rule builder** — build a nested rule; `POST .../segments` → `201`; verify the persisted `rule` matches the built tree.
6. **Create webhook destination** — `POST .../destinations` `{type:"webhook", ..., config:{url,...}, secret}`; one-time secret handled.
7. **Subscribe** — `POST .../destinations/{id}/subscriptions` `{trigger_type:"segment_membership", segment_id}`.
8. **View deliveries** — `GET .../destinations/{id}/deliveries`; assert task statuses render (`pending, sending, succeeded, failed_retryable, failed_permanent, dlq, skipped`).

Because the pipeline is **asynchronous** (ingest returns `202`; identity→profile→segmentation→activation happen seconds later), e2e steps that depend on downstream results MUST poll/refresh with a bounded retry (Playwright `expect.poll` / `toPass`) rather than asserting instantly. The UI itself shows "processing — data may take a few seconds; refresh" with a manual refresh — assert that affordance exists.

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
6. e2e       # pnpm test:e2e     (Playwright; boots preview server / docker stack)
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
