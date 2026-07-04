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

## 1. Summary table of gaps

Each row: **gap** → **impact on frontend** → **workaround** → **blocker?** (does it block shipping a
screen entirely, or just degrade it).

| #   | Gap                                                                                                                                                                                              | Impact on frontend                                                                                              | Workaround                                                                                                                                                                                             | Blocker?                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 1   | **No admin `whoami`/principal endpoint.** The admin API cannot report the current token's role or permissions. (`GET /v1/auth/whoami` exists but is for **source keys**, not the admin console.) | Console cannot auto-detect what the operator may do; RBAC UI gating has no server source of truth.              | Operator **declares their role** at `/connect`; console ships the canonical role→permission table client-side and gates UI from it. Treat unknown as least-privilege. Server still enforces via `403`. | No — degraded (manual role selection).             |
| 2   | **Audit log is WRITE-ONLY.** The `audit:read` permission exists but there is **no read/query route** (`GET .../audit` does not exist).                                                           | The Audit Log screen has no data source.                                                                        | Ship the screen as **spec-only / Phase 2**; render a visible "requires backend endpoint" banner and an empty table with the intended columns.                                                          | **Yes — screen blocked.**                          |
| 3   | **No rate-limit config API.** Rate limiting is env-only on ingress (`RATE_LIMIT_RPS` / `RATE_LIMIT_BURST`).                                                                                      | Cannot build a rate-limit configuration UI.                                                                     | Do **NOT** build rate-limit config. Only surface the `events_rate_limited` metric **read-only** (via Grafana link — see gap 9).                                                                        | No — feature omitted by design.                    |
| 4   | **No DLQ export / mark-resolved.** DLQ supports only list/retry/discard.                                                                                                                         | No "export DLQ" or "resolve" affordance.                                                                        | DLQ screen exposes **list / retry / discard** only.                                                                                                                                                    | No — feature omitted.                              |
| 5   | **`DELETE .../segments/{id}` is code-only.** The deactivate route exists in backend code but is **NOT in `openapi.yaml`**.                                                                       | Orval will **not** generate a hook for it.                                                                      | Hand-write the client call + React Query mutation for segment deactivate (see snippet below).                                                                                                          | No — needs hand-written client.                    |
| 6   | **Ingress API-key header mismatch.** Backend code checks `X-CDP-Api-Key`; CORS advertises `X-Api-Key`.                                                                                           | Console does not call ingress, so no runtime impact — but the "instrument your source" help text could mislead. | In Sources instrumentation help, document `X-CDP-Api-Key` as the authoritative header (also `Authorization: Bearer <cdp_...>`). Note the discrepancy.                                                  | No — docs/help-text note only.                     |
| 7   | **No confirmed "list all segments" endpoint.** The spec extract has per-segment reads but no `GET .../segments` collection route.                                                                | Segments screen needs a list; there is nothing confirmed to call.                                               | **TBD — confirm/needs `GET .../segments`.** Wire the list to that path once confirmed; until then the list is empty/blocked.                                                                           | **Yes — list blocked until confirmed.**            |
| 8   | **`actor_id` not populated in audit.** Admin tokens carry no user identity, so audit rows have coarse attribution.                                                                               | Even once gap 2 is fixed, "who did it" will be weak (token/role level, not a person).                           | Show `actor_type` + `action` + resource; label actor as coarse/"token-level" attribution.                                                                                                              | No — quality caveat.                               |
| 9   | **`/metrics` is Prometheus text, not JSON.**                                                                                                                                                     | Dashboard cannot parse `/metrics` for gauges in-browser without a text parser and CORS.                         | Dashboard **embeds/links Grafana** (`:3000` via `stack-up`) for metrics. Render only `/healthz`, `/readyz`, and cheap admin-API-derived counts (e.g. DLQ open count) natively.                         | No — metrics via Grafana.                          |
| 10  | **`discard` shares the `dlq:retry` permission.** There is no separate `dlq:discard` perm.                                                                                                        | Cannot gate discard independently of retry.                                                                     | Gate **both** retry and discard behind `dlq:retry`. Do not invent a `dlq:discard` perm.                                                                                                                | No — permission caveat.                            |
| 11  | **CORS is off by default.** Backend CORS is driven by env `CORS_ALLOWED_ORIGINS`; empty = blocks all cross-origin. `AllowCredentials: false`.                                                    | If unset on the backend deployment, **every** admin API call fails in the browser.                              | Deployment MUST set `CORS_ALLOWED_ORIGINS` to the console origin. Document as a prerequisite; on network failure at `/connect`, hint at CORS. Token goes in `Authorization` header (never a cookie).   | **Yes — whole app blocked if unset (ops config).** |
| 12  | **Async pipeline → no read-your-write.** Ingest returns `202`; identity→profile→segmentation→activation happen seconds later.                                                                    | After a replay/ingest-affecting action, fresh data is not immediately queryable.                                | **Wait-then-refresh UX:** show "processing — data may take a few seconds; refresh to see updates" with a manual refresh button. Never promise instant results.                                         | No — UX caveat.                                    |

---

## 2. Gap details & prescriptive workarounds

### Gap 1 — No admin `whoami`

The console holds the role→permission table client-side (see [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md)
for the full table) and computes the effective permission set from the **declared** role. Roles:
`SUPER_ADMIN`, `TENANT_ADMIN`, `MARKETER`, `ANALYST`, `OPERATOR`, `VIEWER`.

```ts
// UI gating is UX only — the server still returns 403 on real violations.
function can(role: AdminRole, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}
// <RequirePerm perm="segment:write"> disables the action + tooltip "requires segment:write"
```

Optional fallback strategy: treat an unknown/declared-low role as least-privilege and reveal a feature
only after a cheap probe call succeeds (i.e. let a `403` hide it). Prefer explicit declaration.

### Gap 2 — Audit log write-only (screen BLOCKED)

Build [screens/11-audit-log.md](screens/10-audit-log.md) as **Phase 2**. Render a persistent banner and
the intended table shell using the `AuditLogEntry` type from [Data model & types](07-data-model-and-types.md):

```tsx
<Alert severity="warning">
  Audit log is read-blocked: the backend has no GET .../audit endpoint yet (audit:read exists, the
  route does not). This screen is a spec placeholder — see docs/10-backend-gaps-and-caveats.md.
</Alert>
```

Intended columns once unblocked: actor (`actor_type`/`actor_id`, coarse — see gap 8), `action`,
`resource_type` + `resource_id`, before/after diff (`before_json`/`after_json`), `ip_address`, `created_at`.

### Gap 5 — Hand-write segment deactivate

`DELETE /admin/v1/tenants/{tenantID}/segments/{segmentID}` (`segment:write`) is not in `openapi.yaml`,
so Orval skips it. Add it by hand on the shared Axios instance:

```ts
// lib/api/segments.ts — not generated by Orval
export const deactivateSegment = (tenantId: string, segmentId: string) =>
  api.delete(tenantPath(tenantId, `/segments/${segmentId}`)); // soft deactivate

// React Query mutation invalidates the (TBD) segment list — see gap 7
useMutation({
  mutationFn: () => deactivateSegment(tenantId, segmentId),
  onSuccess: () => qc.invalidateQueries({ queryKey: qk.segments(tenantId).list() }),
});
```

### Gap 7 — Segment list endpoint unconfirmed

The Segments screen requires a collection list. The likely path is `GET /admin/v1/tenants/{tenantID}/segments`
but it is **not confirmed** in the spec extract. Mark the list data hook **"TBD — backend gap"** and keep
the rest of the screen (create/edit rule builder, per-segment detail, members, wired destinations) buildable
against the confirmed per-segment routes.

### Gap 9 — Metrics via Grafana, not `/metrics` parsing

`GET /metrics` returns Prometheus **text**. Do not parse it in the browser. The [Dashboard](screens/02-dashboard.md)
should link/embed Grafana at `http://localhost:3000` (brought up by the docker `stack-up`) and render only:

- `GET /healthz` (liveness) and `GET /readyz` (readiness) badges,
- cheap admin-API counts (e.g. DLQ open count from `GET .../dlq?status=open`),
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

| Priority | Follow-up                                                                              | Unblocks / improves                                                 |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P0       | Add `GET /admin/v1/tenants/{tenantID}/audit` (query by actor/action/resource/time).    | Unblocks the Audit Log screen (gap 2).                              |
| P0       | Confirm/add `GET /admin/v1/tenants/{tenantID}/segments` (list all).                    | Unblocks the Segments list (gap 7).                                 |
| P1       | Add an admin `whoami`/principal endpoint returning `{role, permissions, tenant_id}`.   | Removes manual role declaration; server-driven RBAC gating (gap 1). |
| P1       | Populate `actor_id` on audit rows (per-operator identity).                             | Real "who did it" attribution (gap 8).                              |
| P1       | Add `DELETE .../segments/{id}` to `openapi.yaml`.                                      | Orval generates the hook; drop hand-written client (gap 5).         |
| P2       | Reconcile ingress header: accept both `X-CDP-Api-Key` and `X-Api-Key` (or align CORS). | Removes instrumentation-help ambiguity (gap 6).                     |
| P2       | Add a JSON metrics summary endpoint (or scrape-and-serve gauges).                      | Native dashboard gauges without Grafana (gap 9).                    |
| P2       | DLQ export + mark-resolved routes.                                                     | Richer DLQ ops (gap 4).                                             |
| P3       | Separate `dlq:discard` permission.                                                     | Independent gating of discard vs retry (gap 10).                    |
| P3       | Rate-limit config API (replace env-only `RATE_LIMIT_RPS`/`RATE_LIMIT_BURST`).          | A rate-limit UI (gap 3).                                            |

---

See [Data model & types](07-data-model-and-types.md) for `AuditLogEntry`, `DlqEvent`, `Segment`, and the
`AdminRole`/`Permission` enums referenced above.
