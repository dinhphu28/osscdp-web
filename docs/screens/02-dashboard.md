# Dashboard

At-a-glance health and operability overview for the currently selected tenant.

## Purpose

The Dashboard is the landing screen after a tenant is selected. It answers two operator
questions fast: **"Is the platform healthy right now?"** and **"What is the state of my CDP
for this tenant?"** It surfaces liveness/readiness, a small set of operability cards (DLQ
backlog, activation success, processing lag, segment/source counts), and permission-gated
quick actions.

Be honest about data availability: some numbers are readily computed from admin endpoints,
others are **only in Prometheus/Grafana** and cannot be rendered as JSON gauges today. See
[Backend gaps and caveats](../10-backend-gaps-and-caveats.md).

## Route(s)

| Route                    | Notes                                                                        |
| ------------------------ | ---------------------------------------------------------------------------- |
| `/t/:tenantId/dashboard` | Child of the `/t/:tenantId` layout route. Default landing after tenant pick. |

## Required permission(s)

The dashboard is read-only and composes several read endpoints. There is **no single
dashboard endpoint**; each card gates independently on its own permission. Missing a
permission hides (not errors) the corresponding card.

| Card / element                       | Permission                                  | If missing                                 |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------ |
| Health strip (`/healthz`, `/readyz`) | none (unauthenticated meta)                 | always shown                               |
| DLQ open count                       | `dlq:read`                                  | hide card                                  |
| Activation success rate              | `activation:read`                           | hide card                                  |
| Segment count                        | `segment:read`                              | hide card                                  |
| Source count                         | `source:read`                               | hide card                                  |
| Processing lag / metrics             | none (Grafana link) or backend gap for JSON | show Grafana link                          |
| Quick action: create source          | `source:write`                              | disable (tooltip "requires source:write")  |
| Quick action: look up profile        | `profile:read`                              | disable (tooltip "requires profile:read")  |
| Quick action: create segment         | `segment:write`                             | disable (tooltip "requires segment:write") |

Role → permission gating is computed client-side from the canonical role→perm table (there is
**no admin whoami endpoint**). See [Auth & RBAC](../05-auth-rbac-tenancy.md) and
[Backend gaps](../10-backend-gaps-and-caveats.md#no-admin-whoami).

## API calls used (exact paths)

### Health / meta (unauthenticated)

| Method | Path       | Purpose                                                                 |
| ------ | ---------- | ----------------------------------------------------------------------- |
| `GET`  | `/healthz` | Liveness.                                                               |
| `GET`  | `/readyz`  | Readiness (DB ping). Non-200 ⇒ "not ready".                             |
| `GET`  | `/metrics` | Prometheus **text** (NOT JSON). Not parsed by the frontend — see below. |

### Tenant-scoped reads (built via `tenantPath(tenantId, suffix)`)

| Method | Path                                                                   | Permission        | Feeds card                                                          |
| ------ | ---------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| `GET`  | `/admin/v1/tenants/{tenantID}/dlq?status=open`                         | `dlq:read`        | DLQ open count (`events.length`)                                    |
| `GET`  | `/admin/v1/tenants/{tenantID}/segments`                                | `segment:read`    | Segment count — **TBD**, list endpoint unconfirmed                  |
| `GET`  | `/admin/v1/tenants/{tenantID}/sources`                                 | `source:read`     | Source count — **TBD**, list endpoint unconfirmed                   |
| `GET`  | `/admin/v1/tenants/{tenantID}/destinations/{destinationID}/deliveries` | `activation:read` | Activation success rate (per-destination; aggregate is approximate) |

> **TBD — backend gap:** the spec extract confirms no "list all segments" and no "list all
> sources" endpoint. Segment/source count cards depend on `GET .../segments` and
> `GET .../sources` existing. Mark these cards "TBD — confirm list endpoint" and render an
> "unavailable" state until confirmed. See
> [Backend gaps](../10-backend-gaps-and-caveats.md#no-segment-list) and
> [API integration](../04-api-integration.md).

## Metrics reality (read this before building gauges)

`GET /metrics` returns **Prometheus exposition text, not JSON**. The frontend must NOT scrape
and parse it. Two supported approaches — **default to Grafana + a few computed cards**:

1. **Default — link/embed Grafana.** The docker `stack-up` runs Grafana on `:3000`. Render a
   "Open metrics dashboard" button/`<iframe>` to Grafana. Processing lag, ingest rate,
   `events_rate_limited`, and `activation_circuit_open_total` live here.
2. **JSON gauges (blocked).** Rendering in-app gauges (Recharts / MUI X Charts) requires a
   **JSON metrics endpoint that does not exist today** (would need a backend scrape-and-parse
   endpoint). Mark as **TBD — backend gap**; see
   [Backend gaps](../10-backend-gaps-and-caveats.md#metrics-prometheus-text).

Where a number IS cheaply available from an admin endpoint (DLQ open count, counts,
delivery-derived success rate), render it as a card. Everything time-series/lag → Grafana.

## Layout & components

```
PageHeader ("Dashboard", tenant name, refresh button)
├─ HealthStrip        (healthz / readyz StatusChips + Grafana link)
├─ CardsRow (MUI Grid of MetricCard)
│    ├─ DLQ open count            (dlq:read)      → link to /t/:tenantId/dlq?status=open
│    ├─ Activation success rate   (activation:read, approximate)
│    ├─ Processing lag            (Grafana link / TBD gauge)
│    ├─ Segment count             (segment:read, TBD endpoint)
│    └─ Source count              (source:read, TBD endpoint)
└─ QuickActions (RequirePerm-wrapped buttons)
```

Shared components (see [App architecture](../03-architecture.md)):
`PageHeader`, `StatusChip`, `EmptyState`, `ErrorState`, `RequirePerm`, `CopyButton`. Cards use
MUI `Card`/`CardContent`; each card owns its own TanStack Query and loading/empty/error state.

### Health strip snippet

```tsx
function HealthStrip() {
  const health = useHealthz(); // GET /healthz
  const ready = useReadyz(); // GET /readyz
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <StatusChip label="Liveness" ok={health.isSuccess} />
      <StatusChip label="Readiness" ok={ready.isSuccess} error={ready.isError} />
      <Button href={grafanaUrl} target="_blank" endIcon={<OpenInNewIcon />}>
        Open metrics dashboard
      </Button>
    </Stack>
  );
}
```

### Activation success rate (approximate — per destination)

Deliveries are returned **per destination**, so there is no tenant-wide aggregate endpoint.
Compute an approximate rate by iterating a destination's deliveries and label it clearly.

```tsx
// deliveries: DeliveryLog[] from GET .../destinations/{id}/deliveries
const succeeded = deliveries.filter((d) => d.status === 'succeeded').length;
const total = deliveries.length;
const rate = total ? succeeded / total : null; // show "—" when total === 0
// Label: "Activation success (approx., per destination)"
```

> Task statuses: `pending, sending, succeeded, failed_retryable, failed_permanent, dlq,
skipped` (`skipped` = consent denied). Excluding `skipped` from the denominator is a product
> choice — document whichever you pick. Aggregating across all destinations is **TBD** (no
> aggregate endpoint). See [Activation & Destinations](07-activation-destinations.md).

## Data & TS types

Types are defined in [Data model & types](../07-data-model-and-types.md); reference by name — do
not redefine.

| Card               | Source shape                                                              |
| ------------------ | ------------------------------------------------------------------------- |
| DLQ open count     | `{ events: DlqEvent[] }` → `events.length`                                |
| Activation success | `DeliveryLog[]` (fields: `status: ActivationTaskStatus`, `attempt_count`) |
| Segment count      | `Segment[]` (TBD list endpoint)                                           |
| Source count       | `Source[]` (TBD list endpoint)                                            |
| Health             | plain `200` OK / non-200; no body needed                                  |

`DlqStatus = 'open' | 'retried' | 'discarded'`. The DLQ open-count query MUST use
`?status=open` verbatim.

## States (loading / empty / error)

Each card manages state independently so one failing card never blanks the page.

| State               | Rendering                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Loading             | Skeleton inside the card (MUI `Skeleton`); health chips show indeterminate.               |
| Empty               | Zero is a valid value: DLQ open `0` → green "no backlog"; counts `0` → "None yet".        |
| Error               | `ErrorState` inside the card with a retry button; other cards keep rendering.             |
| Not ready           | `/readyz` non-200 → red readiness chip + banner "Backend not ready (DB)".                 |
| Permission-missing  | Card is **hidden** (not an error) when the role lacks the read perm.                      |
| Metrics unavailable | Processing-lag/gauge cards show "View in Grafana" or "TBD — needs JSON metrics endpoint". |

## Actions & confirmations

All dashboard actions are navigational or read-only — **no destructive actions, no
confirmations** here.

| Action          | Gate            | Behavior                                            |
| --------------- | --------------- | --------------------------------------------------- |
| Refresh         | none            | Invalidate dashboard query keys; refetch all cards. |
| Create source   | `source:write`  | Navigate to `/t/:tenantId/sources` (create flow).   |
| Look up profile | `profile:read`  | Navigate to `/t/:tenantId/profiles`.                |
| Create segment  | `segment:write` | Navigate to `/t/:tenantId/segments/new`.            |
| Open DLQ        | `dlq:read`      | Navigate to `/t/:tenantId/dlq?status=open`.         |
| Open metrics    | none            | Open Grafana (`:3000`) in a new tab.                |

Quick actions are wrapped in `<RequirePerm>`; when the role lacks the perm, render a disabled
button with tooltip "requires `<perm>`".

```tsx
<RequirePerm
  perm="source:write"
  fallback={<DisabledAction label="Create source" perm="source:write" />}
>
  <Button onClick={() => nav(`/t/${tenantId}/sources`)}>Create source</Button>
</RequirePerm>
```

## RBAC & PII notes

- **VIEWER / ANALYST** (read set only): see all read cards; **all quick actions disabled**
  (no `source:write` / `segment:write`). Effectively read-only, as intended.
- **MARKETER**: quick actions "create segment" enabled (`segment:write`); "create source"
  disabled (no `source:write`).
- **OPERATOR**: read cards visible; write quick actions disabled; DLQ actions live on the DLQ
  screen, not here.
- **TENANT_ADMIN / SUPER_ADMIN**: all cards and quick actions enabled.
- **PII:** the dashboard shows **no customer PII** — only counts/rates/health. No masking
  concerns on this screen. (Profile PII masking lives on Customer 360.)
- Gating is UX only; the backend also enforces `403`. See
  [Auth & RBAC](../05-auth-rbac-tenancy.md).

## Acceptance criteria (checklist)

- [ ] Route `/t/:tenantId/dashboard` renders as the default post-tenant-selection landing.
- [ ] Health strip calls `GET /healthz` and `GET /readyz`; green when 200, red/error otherwise;
      `/readyz` non-200 shows a "backend not ready" banner.
- [ ] DLQ open-count card calls `GET /admin/v1/tenants/{tenantID}/dlq?status=open` and shows
      `events.length`; `0` renders as a healthy "no backlog" state; links to the DLQ screen.
- [ ] Activation success card computes an **approximate, per-destination** rate from
      `DeliveryLog[]` and is explicitly labelled "approx." (no aggregate endpoint — TBD).
- [ ] Segment-count and source-count cards render, but degrade to a "TBD — confirm list
      endpoint" state until `GET .../segments` / `GET .../sources` are confirmed.
- [ ] Processing-lag / time-series metrics are NOT parsed from `/metrics`; the screen links
      (or embeds) Grafana (`:3000`) instead. JSON gauges flagged "TBD — backend gap".
- [ ] Each card owns its loading / empty / error state; a single failing card does not blank
      the page.
- [ ] Cards hide when the role lacks the corresponding read permission (computed client-side).
- [ ] Quick actions (create source, look up profile, create segment) are permission-gated:
      disabled with a "requires `<perm>`" tooltip for insufficient roles; a VIEWER sees all
      quick actions disabled.
- [ ] A refresh control invalidates and refetches all dashboard queries.
- [ ] No customer PII is rendered anywhere on this screen.

---

**See also:** [App architecture & conventions](../03-architecture.md) ·
[API integration](../04-api-integration.md) · [Data model & types](../07-data-model-and-types.md) ·
[Backend gaps and caveats](../10-backend-gaps-and-caveats.md) ·
[DLQ admin](08-dlq-admin.md) · [Activation & Destinations](07-activation-destinations.md)
