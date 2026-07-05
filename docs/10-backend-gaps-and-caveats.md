# Backend Gaps, Caveats & Workarounds

> Everything the frontend must know that the current osscdp backend does **NOT** provide, or does
> unexpectedly. Read this before building any screen — several gaps change UX, block whole screens,
> or require hand-written API client code that Orval will not generate.

This file is the canonical index for the phrase **"TBD — backend gap"** used across the other docs.
When another doc defers a feature, it links here.

Related docs: [API integration](04-api-integration.md) · [Data model & types](07-data-model-and-types.md) ·
[Auth, RBAC & tenancy](05-auth-rbac-tenancy.md) · [DLQ screen](screens/08-dlq-admin.md) ·
[Audit screen](screens/10-audit-log.md) · [Dashboard](screens/02-dashboard.md).

---

## 0. Recently resolved (no longer gaps)

The backend has since shipped several endpoints that close previously-documented gaps. These are **no
longer blockers**; the numbered gap that used to describe each has been removed from the table below.

| Was gap | Now available                                                                                        | One-line note                                                                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1      | `GET /admin/v1/whoami` → `{ role, tenant_id, is_super_admin }`                                       | Console **auto-detects** role + pinned tenant at connect. The manual role picker remains **only as a fallback** when the backend returns `404` (older build). See [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md). |
| #2      | `GET /admin/v1/tenants/{tenantID}/audit` (keyset-paginated)                                          | Audit screen is a **live** read table. **Metadata only** (`created_at`, `actor_type`, `action`, `resource_type`, `resource_id`); `before_json`/`after_json` are **intentionally omitted (PII)** — see gap #8b.     |
| #7      | `GET .../sources`, `GET .../segments`, `GET .../destinations` (list endpoints)                       | Sources / Segments / Destinations render **real list tables** (open-by-ID kept as a secondary path).                                                                                                               |
| —       | `GET /admin/v1/tenants` (super-admin, list tenants)                                                  | SelectTenant + the tenant switcher show a **real tenant list**; manual UUID entry kept as a fallback.                                                                                                              |
| —       | `GET /admin/v1/tenants/{tenantID}/stats` → `{ dlq_open, sources, segments, destinations, profiles }` | Dashboard counts are **real JSON**. Covers **counts only** — processing-lag / time-series remain Prometheus/Grafana (gap #9).                                                                                      |
| —       | `POST /admin/v1/tenants/{tenantID}/sources/{sourceID}/disable`                                       | Sources table has a per-row **Disable** action; disabling blocks that source's ingest immediately. Audited.                                                                                                        |
| —       | `GET /admin/v1/admin-tokens` + `POST /admin/v1/admin-tokens/{tokenID}/revoke`                        | Administration shows a **token list** (tenant-scoped; `token_hash` never returned) with a per-row **Revoke** (tenant-scoped, idempotent, audited).                                                                 |

---

## 1. Summary table of gaps

Each row: **gap** → **impact on frontend** → **workaround** → **blocker?** (does it block shipping a
screen entirely, or just degrade it).

| #   | Gap                                                                                                                                                                                                                          | Impact on frontend                                                                                                        | Workaround                                                                                                                                                                                           | Blocker?                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 3   | **No rate-limit config API.** Rate limiting is env-only on ingress (`RATE_LIMIT_RPS` / `RATE_LIMIT_BURST`).                                                                                                                  | Cannot build a rate-limit configuration UI.                                                                               | Do **NOT** build rate-limit config. Only surface the `events_rate_limited` metric **read-only** (via Grafana link — see gap 9).                                                                      | No — feature omitted by design.                    |
| 4   | **No DLQ export / mark-resolved.** DLQ supports only list/retry/discard.                                                                                                                                                     | No "export DLQ" or "resolve" affordance.                                                                                  | DLQ screen exposes **list / retry / discard** only.                                                                                                                                                  | No — feature omitted.                              |
| 5   | **`DELETE .../segments/{id}` is code-only.** The deactivate route exists in backend code but is **NOT in `openapi.yaml`**.                                                                                                   | Orval will **not** generate a hook for it.                                                                                | Hand-write the client call + React Query mutation for segment deactivate (see snippet below).                                                                                                        | No — needs hand-written client.                    |
| 6   | **Ingress API-key header mismatch.** Backend code checks `X-CDP-Api-Key`; CORS advertises `X-Api-Key`.                                                                                                                       | Console does not call ingress, so no runtime impact — but the "instrument your source" help text could mislead.           | In Sources instrumentation help, document `X-CDP-Api-Key` as the authoritative header (also `Authorization: Bearer <cdp_...>`). Note the discrepancy.                                                | No — docs/help-text note only.                     |
| 8   | **`actor_id` not populated in audit.** Admin tokens carry no user identity, so audit rows have coarse attribution.                                                                                                           | Now that audit read is live, "who did it" is still weak — resolves only to `actor_type` (token/role level, not a person). | Show `actor_type` + `action` + resource; label actor as coarse/"token-level" attribution.                                                                                                            | No — quality caveat.                               |
| 8b  | **Audit read is metadata-only (no before/after JSON).** `GET .../audit` returns `created_at/actor_type/action/resource_type/resource_id` (keyset-paginated); `before_json`/`after_json` are **intentionally omitted (PII)**. | No diff/detail drawer on the Audit screen.                                                                                | Ship the audit list without a before/after diff. A PII-bearing detail is deferred to a future `pii:read`-gated detail route.                                                                         | No — by design (PII); detail deferred.             |
| 9   | **`/metrics` is Prometheus text, not JSON.** (Counts are now covered by `GET .../stats`; processing-lag / time-series are not.)                                                                                              | Dashboard cannot parse `/metrics` for time-series gauges (e.g. processing lag) in-browser without a text parser and CORS. | Read counts from `GET .../stats`; **embed/link Grafana** (`:3000` via `stack-up`) for processing-lag and other time-series. Render `/healthz`, `/readyz` natively.                                   | No — lag/time-series via Grafana.                  |
| 10  | **`discard` shares the `dlq:retry` permission.** There is no separate `dlq:discard` perm.                                                                                                                                    | Cannot gate discard independently of retry.                                                                               | Gate **both** retry and discard behind `dlq:retry`. Do not invent a `dlq:discard` perm.                                                                                                              | No — permission caveat.                            |
| 11  | **CORS is off by default.** Backend CORS is driven by env `CORS_ALLOWED_ORIGINS`; empty = blocks all cross-origin. `AllowCredentials: false`.                                                                                | If unset on the backend deployment, **every** admin API call fails in the browser.                                        | Deployment MUST set `CORS_ALLOWED_ORIGINS` to the console origin. Document as a prerequisite; on network failure at `/connect`, hint at CORS. Token goes in `Authorization` header (never a cookie). | **Yes — whole app blocked if unset (ops config).** |
| 12  | **Async pipeline → no read-your-write.** Ingest returns `202`; identity→profile→segmentation→activation happen seconds later.                                                                                                | After a replay/ingest-affecting action, fresh data is not immediately queryable.                                          | **Wait-then-refresh UX:** show "processing — data may take a few seconds; refresh to see updates" with a manual refresh button. Never promise instant results.                                       | No — UX caveat.                                    |

---

## 2. Gap details & prescriptive workarounds

### Role gating (context) — `whoami` now resolves the role

The console now reads the effective role + pinned tenant from `GET /admin/v1/whoami`
(`{ role, tenant_id, is_super_admin }`) at connect, and computes the permission set from the canonical
role→permission table (see [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md)). The manual role picker
remains **only as a fallback** if the backend returns `404` (older build). UI gating stays UX-only —
the server still returns `403` on real violations.

```ts
// UI gating is UX only — the server still returns 403 on real violations.
function can(role: AdminRole, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}
// <RequirePerm perm="segment:write"> disables the action + tooltip "requires segment:write"
```

### Gap 8b — Audit read is metadata-only

The Audit screen (see [screens/10-audit-log.md](screens/10-audit-log.md)) is a **live keyset table**.
`GET .../audit` returns metadata only — `created_at`, `actor_type`, `action`, `resource_type`,
`resource_id` — and is keyset-paginated (mirror the events explorer). `before_json`/`after_json` are
**intentionally omitted (PII)**; do not render a diff drawer. A PII-bearing detail view is deferred to a
future `pii:read`-gated detail route. Attribution is coarse — `actor_id` is unpopulated (gap 8).

### Gap 5 — Hand-write segment deactivate

`DELETE /admin/v1/tenants/{tenantID}/segments/{segmentID}` (`segment:write`) is not in `openapi.yaml`,
so Orval skips it. Add it by hand on the shared Axios instance:

```ts
// lib/api/segments.ts — not generated by Orval
export const deactivateSegment = (tenantId: string, segmentId: string) =>
  api.delete(tenantPath(tenantId, `/segments/${segmentId}`)); // soft deactivate

// React Query mutation invalidates the segment list (GET .../segments)
useMutation({
  mutationFn: () => deactivateSegment(tenantId, segmentId),
  onSuccess: () => qc.invalidateQueries({ queryKey: qk.segments(tenantId).list() }),
});
```

### Gap 9 — Time-series metrics via Grafana, not `/metrics` parsing

`GET /metrics` returns Prometheus **text**. Do not parse it in the browser. Dashboard **counts** now come
from `GET /admin/v1/tenants/{tenantID}/stats` (`dlq_open`, `sources`, `segments`, `destinations`,
`profiles`). For everything time-series/lag, the [Dashboard](screens/02-dashboard.md) should link/embed
Grafana at `http://localhost:3000` (brought up by the docker `stack-up`) and render:

- `GET /healthz` (liveness) and `GET /readyz` (readiness) badges,
- real counts from `GET .../stats` (`—` when a count is unavailable / `-1`),
- links to Grafana panels for `events_rate_limited`, `activation_circuit_open_total`, processing lag, etc.

### Gap 11 — CORS prerequisite

The backend MUST set `CORS_ALLOWED_ORIGINS` to the console's origin, else the browser blocks all admin
API calls (empty = block-all, `AllowCredentials: false`). Allowed headers include
`Authorization, Content-Type, Accept, X-Api-Key`. If the very first `/connect` validation call fails with a
network/CORS error (no HTTP status), surface a hint: "backend CORS may not allow this origin — set
`CORS_ALLOWED_ORIGINS`."

### Gap 12 — Async, no read-your-write

After replay (`.../events/{eventID}/replay`, `.../replay?identifier_key=...`) or any ingest-affecting
action, do not refetch and expect updated profiles/segments/deliveries. Show the standard processing
banner + manual refresh button. See the async-pipeline UX convention in the shared brief / app conventions.

---

## 3. Recommended backend follow-ups (nice-to-have)

These would unblock or materially improve the console. Prioritized roughly by console impact.

> Resolved since the last revision: admin `whoami`, `GET .../audit` (read), list endpoints for
> sources/segments/destinations, `GET /admin/v1/tenants` (list), `GET .../stats` (JSON counts),
> source **disable**, and admin-token **list** + **revoke**.
> See [§0 Recently resolved](#0-recently-resolved-no-longer-gaps).

| Priority | Follow-up                                                                              | Unblocks / improves                                                               |
| -------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P1       | Add a `pii:read`-gated audit **detail** route returning `before_json`/`after_json`.    | Restores the before/after diff drawer on the Audit screen (gap 8b).               |
| P1       | Populate `actor_id` on audit rows (per-operator identity).                             | Real "who did it" attribution (gap 8).                                            |
| P1       | Add `DELETE .../segments/{id}` to `openapi.yaml`.                                      | Orval generates the hook; drop hand-written client (gap 5).                       |
| P2       | Reconcile ingress header: accept both `X-CDP-Api-Key` and `X-Api-Key` (or align CORS). | Removes instrumentation-help ambiguity (gap 6).                                   |
| P2       | Add a JSON **time-series/processing-lag** metrics endpoint.                            | Native dashboard lag gauges without Grafana (gap 9; counts already via `/stats`). |
| P2       | DLQ export + mark-resolved routes.                                                     | Richer DLQ ops (gap 4).                                                           |
| P3       | Separate `dlq:discard` permission.                                                     | Independent gating of discard vs retry (gap 10).                                  |
| P3       | Rate-limit config API (replace env-only `RATE_LIMIT_RPS`/`RATE_LIMIT_BURST`).          | A rate-limit UI (gap 3).                                                          |

---

See [Data model & types](07-data-model-and-types.md) for `AuditLogEntry`, `DlqEvent`, `Segment`, and the
`AdminRole`/`Permission` enums referenced above.
