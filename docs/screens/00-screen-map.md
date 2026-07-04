# Screen Map & Navigation

Index of all screens with routes, required permissions, primary API calls, and nav placement for the `osscdp-web` admin console.

> Facts, paths, permissions, and enum values are copied from the canonical brief. Where the backend is missing an endpoint, the entry is marked **TBD — backend gap** and links to [backend gaps & caveats](../10-backend-gaps-and-caveats.md).

---

## 1. Screen index

Legend: permissions use the exact strings from the role→permission table (see [Data model & types](../07-data-model-and-types.md) and the auth doc). Routes are React Router paths. "Nav group" = section in the left nav rail.

| #   | Screen                    | Route(s)                                                                                 | Primary API calls (exact paths)                                                                                                                                                                                | Required permission(s)                                                                                | Nav group                |
| --- | ------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | Connect / token entry     | `/connect`                                                                               | one cheap validation call, e.g. `GET /healthz` or a scoped admin read                                                                                                                                          | none (pre-auth)                                                                                       | (no rail — pre-shell)    |
| 2   | App shell                 | (layout at `/t/:tenantId`)                                                               | `POST /admin/v1/tenants` gated read for switcher (super-admin)                                                                                                                                                 | none (token present)                                                                                  | (chrome, not a nav item) |
| 3   | Dashboard                 | `/t/:tenantId/dashboard`                                                                 | `GET /healthz`, `GET /readyz`, `GET /metrics` (Prometheus text), `GET /admin/v1/tenants/{tenantID}/dlq?status=open`                                                                                            | read set (`source:read`…`dlq:read`)                                                                   | Overview                 |
| 4   | Sources                   | `/t/:tenantId/sources`                                                                   | `POST /admin/v1/tenants/{tenantID}/sources`, `POST /admin/v1/tenants/{tenantID}/sources/{sourceID}/rotate-key`                                                                                                 | view: `source:read`; create/rotate/disable: `source:write`                                            | Ingest                   |
| 5   | Events explorer           | `/t/:tenantId/events`                                                                    | `GET /admin/v1/tenants/{tenantID}/events`, `GET .../events/{eventID}`, `POST .../events/{eventID}/replay`, `POST /admin/v1/tenants/{tenantID}/replay?identifier_key=...&max=1000`                              | view: `event:read`; replay: `event:replay`                                                            | Ingest                   |
| 6   | Customer 360              | `/t/:tenantId/profiles`, `/t/:tenantId/profiles/:canonicalUserId`                        | `GET .../profiles?email=` / `?phone=`, `GET .../profiles/{cuid}`, `GET .../profiles/{cuid}/identifiers`, `GET/PUT .../profiles/{cuid}/consent`, `GET .../profiles/{cuid}/export`, `DELETE .../profiles/{cuid}` | view: `profile:read`; consent edit: `consent:write`; delete: `profile:delete`; unmask PII: `pii:read` | Customers                |
| 7   | Segments                  | `/t/:tenantId/segments`, `/t/:tenantId/segments/new`, `/t/:tenantId/segments/:segmentId` | `GET/POST/PUT/DELETE .../segments[/{segmentID}]`, `GET .../segments/{segmentID}/members`, `GET .../segments/{segmentID}/destinations`                                                                          | view: `segment:read`; create/edit/delete: `segment:write`                                             | Audiences                |
| 8   | Activation / Destinations | `/t/:tenantId/destinations`, `/t/:tenantId/destinations/:destinationId`                  | `POST/PUT/GET .../destinations[/{destinationID}]`, `POST/DELETE .../destinations/{destinationID}/subscriptions[/{subscriptionID}]`, `GET .../destinations/{destinationID}/deliveries`                          | view: `destination:read`; write: `destination:write`; deliveries: `activation:read`                   | Audiences                |
| 9   | DLQ admin                 | `/t/:tenantId/dlq`                                                                       | `GET .../dlq?status=open\|retried\|discarded`, `POST .../dlq/{id}/retry`, `POST .../dlq/{id}/discard`                                                                                                          | view: `dlq:read`; retry/discard: `dlq:retry`                                                          | Operations               |
| 10  | Administration            | `/t/:tenantId/administration`                                                            | `POST /admin/v1/admin-tokens`, `POST /admin/v1/tenants` (super-admin)                                                                                                                                          | tokens: `admin:write`; tenant create: `admin:write` + SUPER_ADMIN                                     | Administration           |
| 11  | Audit log                 | `/t/:tenantId/audit`                                                                     | `GET .../audit` — **TBD — backend gap** (no read endpoint)                                                                                                                                                     | `audit:read`                                                                                          | Operations               |

Notes:

- **Discard shares `dlq:retry`** (there is no separate `dlq:discard` permission).
- `GET .../segments` ("list all") and `DELETE .../segments/{id}` are **not in `openapi.yaml`** — see [backend gaps](../10-backend-gaps-and-caveats.md) items 5 & 7.
- `/metrics` is **Prometheus text, not JSON** — the dashboard links/embeds Grafana rather than parsing it (gap item 9).

---

## 2. Route tree (React Router)

Copied from brief §5. Nested routes live under the tenant layout route `/t/:tenantId`.

```
/                       → if no token → redirect /connect; else → tenant picker / last tenant
/connect                → token entry (+ optional role declaration + base URL override)
/t/:tenantId            → AppLayout (nav rail + top bar + tenant switcher + <Outlet/>)
  ├─ /dashboard
  ├─ /sources
  ├─ /events
  ├─ /profiles
  ├─ /profiles/:canonicalUserId
  ├─ /segments
  ├─ /segments/new
  ├─ /segments/:segmentId
  ├─ /destinations
  ├─ /destinations/:destinationId
  ├─ /dlq
  ├─ /audit            (Phase 2 / backend gap)
  └─ /administration   (tokens/roles; tenants list for super-admin)
```

The Axios layer injects `{tenantID}` into admin paths via a `tenantPath(tenantId, suffix)` helper → `/admin/v1/tenants/${tenantId}${suffix}`. Tenant is **never** sent in body or header — only the URL path segment.

---

## 3. Nav-rail order & grouping

The left nav rail (in `AppLayout.tsx`) lists items in this fixed order, grouped by section:

| Order | Nav item       | Route                         | Nav group      | Gating permission                      |
| ----- | -------------- | ----------------------------- | -------------- | -------------------------------------- |
| 1     | Dashboard      | `/t/:tenantId/dashboard`      | Overview       | (read set)                             |
| 2     | Sources        | `/t/:tenantId/sources`        | Ingest         | `source:read`                          |
| 3     | Events         | `/t/:tenantId/events`         | Ingest         | `event:read`                           |
| 4     | Customers      | `/t/:tenantId/profiles`       | Customers      | `profile:read`                         |
| 5     | Segments       | `/t/:tenantId/segments`       | Audiences      | `segment:read`                         |
| 6     | Destinations   | `/t/:tenantId/destinations`   | Audiences      | `destination:read`                     |
| 7     | DLQ            | `/t/:tenantId/dlq`            | Operations     | `dlq:read`                             |
| 8     | Audit          | `/t/:tenantId/audit`          | Operations     | `audit:read` (screen blocked — see §5) |
| 9     | Administration | `/t/:tenantId/administration` | Administration | `admin:write`                          |

Top bar (not in the rail) holds: **tenant switcher**, **theme toggle** (persisted in `localStorage`), **"connected as <role>"** indicator, and **disconnect**.

A nav item is **hidden** when the current role lacks the gating permission. Because every role holds the full read set, items 1–7 are visible to all roles; item 9 (Administration) is visible only to `SUPER_ADMIN` / `TENANT_ADMIN`.

---

## 4. Role-based visibility

Roles: `SUPER_ADMIN`, `TENANT_ADMIN`, `MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER`. Permissions per role are the canonical role→permission table (reproduced in the auth doc and [Data model & types](../07-data-model-and-types.md)). Because there is **no admin `whoami` endpoint** (gap item 1), the operator declares their role at `/connect` and the console computes permissions client-side.

Read visibility of a screen vs write actions inside it:

| Screen                           |       SUPER_ADMIN       |        TENANT_ADMIN         | MARKETER | ANALYST |    OPERATOR     | VIEWER |
| -------------------------------- | :---------------------: | :-------------------------: | :------: | :-----: | :-------------: | :----: |
| Dashboard                        |          full           |            full             |   view   |  view   |      view       |  view  |
| Sources                          |           R+W           |             R+W             |    R     |    R    |        R        |   R    |
| Events                           |        R+replay         |          R+replay           |    R     |    R    |    R+replay     |   R    |
| Customer 360 (view)              |            R            |              R              |    R     |    R    |        R        |   R    |
| — consent edit (`consent:write`) |           yes           |             yes             |   yes    |   no    |       no        |   no   |
| — GDPR delete (`profile:delete`) |           yes           |             yes             |    no    |   no    |       no        |   no   |
| — unmask PII (`pii:read`)        |           yes           |             yes             |    no    |   no    |       no        |   no   |
| Segments                         |           R+W           |             R+W             |   R+W    |    R    |        R        |   R    |
| Destinations                     |           R+W           |             R+W             |   R+W    |    R    |        R        |   R    |
| — deliveries (`activation:read`) |           yes           |             yes             |   yes    |   yes   |       yes       |  yes   |
| DLQ                              |     R+retry/discard     |       R+retry/discard       |    R     |    R    | R+retry/discard |   R    |
| Administration (`admin:write`)   | yes (all roles/tenants) | yes (own tenant, non-super) |  hidden  | hidden  |     hidden      | hidden |
| — Tenants sub-section            | yes (SUPER_ADMIN only)  |           hidden            |  hidden  | hidden  |     hidden      | hidden |
| Audit                            |           R*            |             R*              |    R*    |   R*    |       R*        |   R*   |

`*` = permission exists but the screen is **blocked** (no backend read endpoint — see §5).

**UI gating rule (brief §2/§5):** hide/disable any action the current role can't perform, computed from the role→perm table. Wrap write actions in `<RequirePerm perm="…">`; disabled buttons carry a tooltip `requires <perm>`. Gating is **UX only** — enforcement is server-side (`403`).

```tsx
// Compute perms once from the declared role, gate at render time.
const perms = permsForRole(role); // role→perm table, client-side
<RequirePerm perm="segment:write">
  <Button>Create segment</Button> {/* hidden/disabled if perm absent */}
</RequirePerm>;
```

---

## 5. Blocked / deferred / feature-flagged screens & features

| Item                                                                                        | Screen / feature        | Status                                       | Reason                                                                                                                                                                                                                                             | Reference                                                                 |
| ------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Audit log                                                                                   | `/t/:tenantId/audit`    | **Blocked — Phase 2**                        | No backend `GET .../audit` read endpoint (`audit:read` perm exists, route does not). Ship the screen as a spec with the intended table (actor, action, resource, before/after diff, ip, time) behind a visible "requires backend endpoint" banner. | [gap #2](../10-backend-gaps-and-caveats.md), [audit doc](10-audit-log.md) |
| Stateful segmentation (behavior leaves: `count`/`frequency`/`recency`/`absence`/`sequence`) | Segments → Rule Builder | **Feature-flagged (advanced/beta)**          | No time-window rules yet; gate behind a flag and label "advanced/beta". Stateless (Level 1/2) rules are the shipped default.                                                                                                                       | brief §6, [segments doc](06-segments-and-rule-builder.md)                 |
| Destination types `push`, `email`, `crm`, `ads`, `warehouse`                                | Destinations → create   | **Deferred (show disabled / "coming soon")** | Only `webhook` and `kafka` are implemented.                                                                                                                                                                                                        | brief §3, [activation doc](07-activation-destinations.md)                 |
| Rate-limit config UI                                                                        | (none)                  | **Do not build**                             | Rate limiting is env-only (`RATE_LIMIT_RPS`/`RATE_LIMIT_BURST`); only surface the `events_rate_limited` metric read-only.                                                                                                                          | [gap #3](../10-backend-gaps-and-caveats.md)                               |
| DLQ export / mark-resolved                                                                  | DLQ                     | **Not available**                            | Backend supports only list/retry/discard.                                                                                                                                                                                                          | [gap #4](../10-backend-gaps-and-caveats.md)                               |
| `GET .../segments` (list all)                                                               | Segments list           | **TBD — backend gap**                        | Not confirmed in spec extract; UI needs a list — hand-add if missing.                                                                                                                                                                              | [gap #7](../10-backend-gaps-and-caveats.md)                               |
| `DELETE .../segments/{id}`                                                                  | Segments delete         | **Code-only**                                | Exists in code, not in `openapi.yaml`; Orval won't generate it — add by hand.                                                                                                                                                                      | [gap #5](../10-backend-gaps-and-caveats.md)                               |

---

## 6. Screen documents

| Screen                                | Doc                                            |
| ------------------------------------- | ---------------------------------------------- |
| Connect / token entry                 | [connect.md](01-connect-and-shell.md)          |
| App shell & navigation                | [app-shell.md](01-connect-and-shell.md)        |
| Dashboard                             | [dashboard.md](02-dashboard.md)                |
| Sources                               | [sources.md](03-sources.md)                    |
| Events explorer                       | [events.md](04-events-explorer.md)             |
| Customer 360 (incl. consent, GDPR)    | [customer-360.md](05-customer-360.md)          |
| Segments & Rule Builder               | [segments.md](06-segments-and-rule-builder.md) |
| Activation / Destinations             | [activation.md](07-activation-destinations.md) |
| DLQ admin                             | [dlq.md](08-dlq-admin.md)                      |
| Administration (tokens/roles/tenants) | [administration.md](09-administration.md)      |
| Audit log (Phase 2)                   | [audit.md](10-audit-log.md)                    |

Cross-cutting references: [API integration](../04-api-integration.md) · [Data model & types](../07-data-model-and-types.md) · [Backend gaps & caveats](../10-backend-gaps-and-caveats.md).

---

## 7. Acceptance criteria

- [ ] Every route in brief §5 is reachable and rendered under `/t/:tenantId`; `/` redirects to `/connect` when no token, else to the tenant picker / last tenant.
- [ ] Nav rail renders items 1–9 in the exact order and groups of §3; the top bar holds tenant switcher, theme toggle, "connected as <role>", and disconnect.
- [ ] Nav items and in-screen actions are hidden/disabled per the role→permission table (§4); a `VIEWER` sees no write actions; Administration is hidden for `MARKETER`/`ANALYST`/`OPERATOR`/`VIEWER`.
- [ ] The Tenants sub-section of Administration is visible only to `SUPER_ADMIN`.
- [ ] The Audit screen shows a "requires backend endpoint" banner and does not call a non-existent endpoint (§5).
- [ ] Stateful/behavior segment rules are gated behind a feature flag and labelled "advanced/beta".
- [ ] Deferred destination types (`push`, `email`, `crm`, `ads`, `warehouse`) render disabled/"coming soon"; only `webhook`/`kafka` are selectable.
- [ ] No rate-limit config UI exists.
- [ ] All screen docs in §6 are linked and present.
