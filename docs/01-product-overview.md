# Product Overview & Domain Primer

> Purpose: explain the CDP domain, personas/roles, and what the `osscdp-web` console does — so the builder understands the "why" before reading the "how".

`osscdp-web` is a **React + TypeScript admin/operator console** for **osscdp**, an open-source **Customer Data Platform (CDP)** backend (Go). The backend today has **no UI** — this is the first one. It operates the CDP entirely through the **admin API** (`/admin/v1/*`), authenticated with a pasted **admin Bearer token** (no login form, no users table). See [App architecture & conventions](03-architecture.md), [API integration](04-api-integration.md), and the canonical [Data model & types](07-data-model-and-types.md).

---

## §0 — CDP domain primer

A CDP ingests behavioral/identity data from customer apps, stitches it into one profile per real person, groups profiles into audiences, and pushes audience changes to downstream tools — all under governance and operability controls.

The pipeline, in order:

```
event ingress → identity resolution → unified profiles → segmentation → activation
                            (under governance + operability)
```

1. **Event ingress.** Customer apps send events (`track` / `identify` / `alias` / `batch`) to the **ingress API** (`/v1/*`) using a per-source API key (`cdp_...`). Ingest returns **`202 Accepted`** — the work is queued, not done.
2. **Identity resolution.** The pipeline clusters identifiers (emails, user IDs, anonymous IDs) into an **identity cluster** with one **`canonical_user_id`**.
3. **Unified profiles.** It builds a **customer profile** per canonical user: `traits_json` (email, phone, name, country) plus `computed_attributes_json` (total_events, total_orders, last_event_name, etc.).
4. **Segmentation.** It evaluates **segments** — rule-based audiences (nested AND/OR/NOT over profile/event fields) — and tracks per-profile **membership**.
5. **Activation.** On membership changes it pushes to **destinations** (webhook / kafka) via **subscriptions**, recording **delivery** attempts and statuses.

All of the above runs under:

- **Governance** — consent, RBAC, server-side PII masking, GDPR export/delete.
- **Operability** — the **DLQ** (dead-letter queue), rate limiting, metrics.

### Domain entities (glossary)

| Entity | What it is | Canonical type ([07](07-data-model-and-types.md)) |
|---|---|---|
| **Tenant** | An isolated customer org. Identified by a `{tenantID}` UUID; every admin route is scoped by it as a URL path segment. | `Tenant` |
| **Source** | An instrumented app/channel that sends events; holds an ingress API key (`cdp_...`, shown once). | `Source`, `SourceKeyOnce` |
| **Event** | A raw ingested record (`track`/`identify`/`alias`/`batch`) with a JSON payload; processed asynchronously. | `RawEvent` |
| **Identity cluster** | The set of identifiers resolved to one person; yields the `canonical_user_id`. | `IdentityCluster`, `IdentityNode`, `MergeHistoryEntry` |
| **Customer profile** | The unified per-person record: traits + computed attributes. | `CustomerProfile` |
| **Segment** | A rule-based audience (versioned); members are profiles matching the rule. | `Segment`, `SegmentVersion`, `SegmentMembership`, `Rule` |
| **Destination** | A downstream target (`webhook` / `kafka`) that receives activation. | `Destination`, `WebhookConfig`, `KafkaConfig` |
| **Subscription** | A binding of a destination to a segment trigger (`segment_membership`). | `Subscription` |
| **Consent** | Per-profile channel×purpose grant/deny state governing activation. | `ConsentRecord` |
| **DLQ** | Dead-letter queue of failed pipeline events; can be retried or discarded. | `DlqEvent` |

Two secondary/governance entities also appear: **Admin token** (`AdminToken`, minted `cdpadm_...`), **Delivery log** (`DeliveryLog`), and **Audit log entry** (`AuditLogEntry` — write-only backend, see below).

### Cross-cutting facts the builder must internalize

- **Token-only auth.** No login, no username/password, no JWT, no session, no users table. The console uses a pasted admin Bearer token. Build a "paste your admin token" flow, not a login form. See [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md).
- **Tenant-scoped by URL path.** Every admin call carries `{tenantID}` in the path; never in body/header. Super-admin tokens are cross-tenant; all others are pinned to one tenant (`403 tenant scope violation` otherwise).
- **PII masking is server-side.** `email`/`phone`/`name` come back masked (`u***@x.com`, `+8490****567`, `N***`) unless the token holds `pii:read`. The frontend renders what it receives and never attempts client-side unmasking.
- **One-time secrets.** Source API keys, admin tokens, and destination secrets are returned in plaintext **exactly once** at creation/rotation. Show a copy-once modal (`OneTimeSecretDialog`) warning the value cannot be retrieved again.
- **Two separate auth systems.** The console only uses admin tokens (`cdpadm_...` / bootstrap `ADMIN_API_TOKEN`). Source API keys (`cdp_...`) are provisioned by the console for hand-off to the customer's engineers — the console never authenticates with them.

---

## §1 — Personas mapped to roles (RBAC)

The backend defines **6 roles**, each carrying a fixed permission set. Because there is **no admin `whoami`/principal endpoint** (see [Backend gaps & caveats](10-backend-gaps-and-caveats.md)), the console **cannot ask the API for the current token's role** — the operator declares their role at connect time and the console holds the canonical role→permission table client-side to gate the UI. UI gating is UX only; the server also enforces (`403`). Full details in [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md).

Permission strings (copy exactly): `source:read`, `source:write`, `event:read`, `event:replay`, `profile:read`, `profile:delete`, `segment:read`, `segment:write`, `destination:read`, `destination:write`, `activation:read`, `dlq:read`, `dlq:retry`, `audit:read`, `consent:write`, `pii:read`, `admin:write`.

**Read set** = `source:read, event:read, profile:read, segment:read, destination:read, activation:read, audit:read, dlq:read`.

| Persona | Role | Permissions |
|---|---|---|
| **Platform admin** | `SUPER_ADMIN` | ALL permissions; cross-tenant (tenant = nil, can switch tenants) |
| **Tenant admin** | `TENANT_ADMIN` | ALL permissions, scoped to its own tenant |
| **Marketer** | `MARKETER` | read set + `segment:write`, `destination:write`, `consent:write` |
| **Analyst** | `ANALYST` | read set only |
| **Operator** | `OPERATOR` | read set + `dlq:retry`, `event:replay` |
| **Viewer** | `VIEWER` | read set only |

Notes: `pii:read`, `admin:write`, and `profile:delete` exist **only** in `SUPER_ADMIN` / `TENANT_ADMIN`. Note also that DLQ **discard** shares the `dlq:retry` permission (not a separate perm).

```ts
export type AdminRole =
  | 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'MARKETER' | 'ANALYST' | 'OPERATOR' | 'VIEWER';
// The role→permission table lives client-side; gate actions with <RequirePerm perm="segment:write">.
```

---

## §2 — The async pipeline reality (and what it means for UX)

**The pipeline is asynchronous.** Ingest returns `202`; identity resolution → profile build → segmentation → activation happen **seconds later**. The UI must never promise instant results.

Concretely, after any ingest-affecting or replay action:

- Show a "**processing — data may take a few seconds; refresh to see updates**" message with a manual **refresh** button.
- Show explicit loading/processing-lag states; do not assume a just-created event immediately appears in a profile, segment, or delivery log.
- The **wait-then-refresh** pattern is the default mental model across Events, Customer 360, Segments, and Activation.

```tsx
// After replaying an event / identifier, set expectations rather than optimistically mutating.
<Alert severity="info">
  Processing — new data may take a few seconds. <Button onClick={refetch}>Refresh</Button>
</Alert>
```

---

## §3 — Scope: full admin console (11 surfaces)

The console documents and implements **every** operator surface. Detailed specs live in `docs/screens/*`.

1. **Connect / token entry** (`/connect`) — paste admin token, optional role declaration + base URL override; validate via a cheap call; store token.
2. **App shell** — nav rail, top bar, **tenant switcher** (super-admin: all tenants; else pinned), theme toggle, "connected as `<role>`" indicator, disconnect.
3. **Dashboard** — health (`/healthz`, `/readyz`), key metrics (link/embed Grafana; `/metrics` is Prometheus text, not JSON), DLQ open count, activation success rate, processing lag, quick actions.
4. **Sources** — list, create (one-time key modal), rotate key, disable, instrumentation help.
5. **Events explorer** — keyset-paginated table; filter by `identifier_key`, `event_name`; payload JSON viewer; replay one; replay-by-identifier.
6. **Customer 360** — search by email/phone or `canonical_user_id`; tabs: Overview, Identity (cluster + merge history), Events, Segments, **Consent** (channel×purpose editor), GDPR Export, Delete/anonymize. PII masking throughout.
7. **Segments** — list; create/edit with **Rule Builder** (nested AND/OR/NOT); version history; members; wired destinations.
8. **Activation / Destinations** — list; create webhook/kafka; subscriptions to segments; delivery log + circuit-breaker/enable-disable.
9. **DLQ admin** — list/filter by status; retry; discard (confirm); payload viewer.
10. **Administration** — admin tokens (list/mint one-time + role scoping), role→permission matrix reference; **Tenants** (super-admin only): list + create + mint first `TENANT_ADMIN` token.
11. **Audit log** — spec'd but **blocked on a backend `GET .../audit` endpoint** → Phase 2, with a visible "requires backend endpoint" banner. See [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## §4 — Non-goals

- **Not an end-user app.** This is an admin/operator console, not a customer-facing product.
- **Not a data-ingestion SDK.** The console does not send events. It provisions source keys and shows instrumentation instructions for the customer's engineers, but ingestion is done by their apps against the ingress API (`/v1/*`).
- **Does not authenticate with source API keys.** Source keys (`cdp_...`) are handed off, never used by the console. The console authenticates only with admin tokens (`cdpadm_...` / bootstrap `ADMIN_API_TOKEN`) via `Authorization: Bearer <adminToken>`.
- **No self-serve signup / user management.** Onboarding is admin-driven: `SUPER_ADMIN` creates a tenant → mints a `TENANT_ADMIN` token → creates sources.
- **No rate-limit config UI.** Rate limiting is env-only on the backend; only surface the `events_rate_limited` metric read-only. See [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

See also: [Auth, RBAC & tenancy](05-auth-rbac-tenancy.md) · [API integration](04-api-integration.md) · [Architecture & conventions](03-architecture.md) · [Data model & types](07-data-model-and-types.md) · [Backend gaps & caveats](10-backend-gaps-and-caveats.md).
