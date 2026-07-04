# Segments & Rule Builder

List, create, and edit rule-based audiences with a visual nested rule builder, append-only version history, and members/destinations views.

## Purpose

Define **rule-based audiences** (segments) for the CDP. A segment holds a recursive **rule tree** (nested AND/OR/NOT of leaf conditions over profile/event fields). Editing a segment produces a **new version** (append-only). Operators can inspect the current members and which destinations a segment is wired to.

> Remember the pipeline is **asynchronous**: creating or editing a segment does not immediately populate members. After a write, show "processing — data may take a few seconds; refresh to see updates" and a manual refresh button. See [API integration](../04-api-integration.md).

## Route(s)

| Route                              | Screen                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `/t/:tenantId/segments`            | Segment list                                                                       |
| `/t/:tenantId/segments/new`        | Create segment (rule builder)                                                      |
| `/t/:tenantId/segments/:segmentId` | Segment detail (rule builder in edit mode, version history, members, destinations) |

## Required permission(s)

| Action                                   | Permission         |
| ---------------------------------------- | ------------------ |
| View list / detail / members             | `segment:read`     |
| Create / edit (new version) / deactivate | `segment:write`    |
| View wired destinations                  | `destination:read` |

Roles that hold `segment:write`: `SUPER_ADMIN`, `TENANT_ADMIN`, `MARKETER`. Roles with read-only access (`ANALYST`, `VIEWER`, `OPERATOR`) can view but every write action must be hidden/disabled with a `requires segment:write` tooltip. See [Auth & RBAC](../05-auth-rbac-tenancy.md).

## API calls used (exact paths)

All paths are admin routes: `Authorization: Bearer <adminToken>`, permission-gated, tenant-scoped by URL. Use the `tenantPath(tenantId, suffix)` helper.

| Method   | Path                                                             | Permission         | Notes                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/admin/v1/tenants/{tenantID}/segments`                          | `segment:write`    | Body `{name, description?, rule}` → `201 Segment`                                                                                                                                                           |
| `PUT`    | `/admin/v1/tenants/{tenantID}/segments/{segmentID}`              | `segment:write`    | Edit — **creates a NEW version**                                                                                                                                                                            |
| `DELETE` | `/admin/v1/tenants/{tenantID}/segments/{segmentID}`              | `segment:write`    | Deactivate. **CODE-ONLY, not in openapi.yaml** — Orval won't generate it; add by hand. See [Backend gaps](../10-backend-gaps-and-caveats.md)                                                                |
| `GET`    | `/admin/v1/tenants/{tenantID}/segments/{segmentID}`              | `segment:read`     | Segment detail (incl. current version / rule)                                                                                                                                                               |
| `GET`    | `/admin/v1/tenants/{tenantID}/segments/{segmentID}/members`      | `segment:read`     | Active members, **no paging params** — full array                                                                                                                                                           |
| `GET`    | `/admin/v1/tenants/{tenantID}/segments/{segmentID}/destinations` | `destination:read` | Destinations wired to this segment                                                                                                                                                                          |
| `GET`    | `/admin/v1/tenants/{tenantID}/segments`                          | `segment:read`     | **TBD — backend gap.** List-all-segments endpoint is NOT confirmed in the spec extract; the list screen needs it. Assume `GET .../segments` and flag. See [Backend gaps](../10-backend-gaps-and-caveats.md) |

## Layout & components

### Segment list (`/segments`)

- **PageHeader**: title "Segments", primary action **New segment** (gated `<RequirePerm perm="segment:write">`, links to `/segments/new`).
- **MUI X Data Grid**, client-mode paging (the list endpoint has no paging params; also TBD — backend gap). Columns: `name` (link to detail), `status` via **StatusChip**, `description`, `current_version_id` (copyable), row actions (Edit, Deactivate).
- Loading skeletons; **EmptyState** ("No segments yet — create your first audience"); **ErrorState** with retry.

### Create / edit (`/segments/new`, `/segments/:segmentId`)

Three regions:

1. **Metadata form** — React Hook Form + Zod: `name` (required), `description` (optional).
2. **Rule Builder** (centerpiece, below).
3. **Live JSON preview** — `JsonViewer` rendering the current `Rule` object, kept in sync with the builder.

### Segment detail extras

- **Version history panel** — append-only list of `SegmentVersion` (version number, status, rule). Highlight the one matching `current_version_id`. Read-only; selecting a version shows its `rule_json` in the JSON viewer.
- **Members** — Data Grid (client-mode paging) from `GET .../members`. Columns from `SegmentMembership`: `customer_profile_id` (link to Customer 360), `status`, `entered_at`, `exited_at`, `last_evaluated_at`, `version`.
- **Wired destinations** — list from `GET .../destinations` (needs `destination:read`). If the token lacks `destination:read`, hide/disable this panel. Links to [Activation & Destinations](07-activation-destinations.md).

## Rule Builder (the centerpiece)

The rule is a **recursive tree**. A node groups children under a logical operator; a leaf is a single condition.

```ts
export type Rule = RuleNode | RuleLeaf;
export interface RuleNode {
  operator: LogicalOp;
  conditions: Rule[];
} // 'and' | 'or' | 'not'
export interface RuleLeaf {
  field: string;
  op: RuleOp;
  value?: unknown | unknown[];
}
```

### Visual model

- A **group** (`RuleNode`) renders as a bordered container with an **operator selector** (`AND` / `OR` / `NOT`) and its `conditions` nested inside (indented). Groups nest arbitrarily deep.
- `not` groups: UI should constrain to a single child (logical negation); render "NOT (…)". If backend accepts multiple, treat as NOT of the AND — TBD — backend gap.
- Each **condition** (`RuleLeaf`) is a row: **field picker · operator dropdown · value input**.
- Controls: **Add condition**, **Add group** (nested), **Remove** (per row/group). Drag-to-nest is **optional/nice-to-have**.

### Field picker (known namespaces — brief §6)

Offer these namespaces; `*` segments allow free-text key entry (e.g. `profile.traits.email`):

| Namespace                       | Example                                    |
| ------------------------------- | ------------------------------------------ |
| `profile.traits.*`              | `profile.traits.email`                     |
| `profile.computed_attributes.*` | `profile.computed_attributes.total_orders` |
| `profile.canonical_user_id`     | —                                          |
| `profile.first_seen_at`         | (timestamp)                                |
| `profile.last_seen_at`          | (timestamp)                                |
| `event.event_name`              | —                                          |
| `event.type`                    | `track` / `identify` / `alias`             |
| `event.properties.*`            | `event.properties.plan`                    |
| `event.context.*`               | `event.context.ip`                         |

### Operator dropdown (`RuleOp`)

Populate from `RuleOp` and filter by inferred field type:

```ts
export type RuleOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';
```

- Numeric / timestamp fields (`gt/gte/lt/lte`) vs string fields (`contains/not_contains`) — filter the list to what makes sense for the chosen field.
- **`in` / `not_in`** → render an **array value input** (chips / multi-value); `value` is `unknown[]`.
- **`exists` / `not_exists`** → render **no value input**; omit `value`.
- All others → single scalar value input.

### Client-side validation (Zod)

Validate the whole `Rule` tree with Zod **before submit**. The server also validates on create/edit and returns a `bad_request` error envelope; surface that error on the **offending leaf** (map to field-level error where possible, else a form-level alert).

```ts
const ruleLeaf: z.ZodType<RuleLeaf> = z
  .object({
    field: z.string().min(1),
    op: z.enum([
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'contains',
      'not_contains',
      'in',
      'not_in',
      'exists',
      'not_exists',
    ]),
    value: z.unknown().optional(),
  })
  .refine(
    (l) =>
      l.op === 'exists' || l.op === 'not_exists'
        ? l.value === undefined
        : l.op === 'in' || l.op === 'not_in'
          ? Array.isArray(l.value)
          : l.value !== undefined && !Array.isArray(l.value),
    { message: 'value shape does not match operator' },
  );

const rule: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    z.object({ operator: z.enum(['and', 'or', 'not']), conditions: z.array(rule).min(1) }),
    ruleLeaf,
  ]),
);
```

### Live JSON preview

Render the current `Rule` with the shared `JsonViewer` component beside the builder so the operator sees exactly what will be sent. This is the same object posted as `rule` in the request body.

## Stateful / behavioral advanced leaf (Level 3) — FEATURE-FLAGGED / beta

> **Gate behind a feature flag** and label the UI **"advanced / beta"**. Per doc 14, the backend has **no time-window rules yet** — see [Backend gaps](../10-backend-gaps-and-caveats.md). Do not enable by default.

A `BehaviorLeaf` is a **different leaf editor**, **mutually exclusive** with the `field`/`op`/`value` leaf — a condition row is either a plain `RuleLeaf` or a `BehaviorLeaf`, never both.

```ts
export interface BehaviorLeaf {
  behavior: {
    kind: 'count' | 'frequency' | 'recency' | 'absence' | 'sequence';
    event_name?: string;
    window?: string; // "7d","24h","30m"
    op?: 'gte' | 'gt' | 'lte' | 'lt' | 'eq';
    value?: number;
    value_prop?: string;
    where?: RuleLeaf;
    steps?: Array<{ event_name: string; where?: RuleLeaf }>;
    within?: string;
    anchor?: object;
    exact?: boolean;
  };
}
```

Editor fields by `kind`:

| Field                | Applies to                                   | UI                                                               |
| -------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `kind`               | all                                          | dropdown: count / frequency / recency / absence / sequence       |
| `event_name`         | count, frequency, recency, absence           | field picker (event name)                                        |
| `window`             | all                                          | window input: `7d` / `24h` / `30m` style                         |
| `op` + `value`       | count, frequency, recency                    | threshold: op dropdown (`gte/gt/lte/lt/eq`) + numeric value      |
| `value_prop`         | count/frequency (sum a property)             | property path input                                              |
| `where`              | count, frequency, recency, absence, per-step | nested `RuleLeaf` filter                                         |
| `steps[]` + `within` | sequence                                     | ordered list of `{event_name, where?}` + overall `within` window |
| `anchor`             | absence (correlated)                         | anchor config object                                             |
| `exact`              | sequence                                     | boolean toggle                                                   |

Behavioral guardrails:

- **Warn on window-widening** (e.g. broadening `24h` → `30d`) — potentially expensive re-evaluation.
- **Forbid `exact` / `sequence` on high-frequency events** — the server rejects these; validate client-side and surface the `bad_request` error on the leaf.
- Show the "advanced / beta" label and only render when the flag is on.

## Data & TS types

Copy from [Data model & types](../07-data-model-and-types.md) verbatim:

```ts
export type LogicalOp = 'and' | 'or' | 'not';
export type RuleOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';

export type Rule = RuleNode | RuleLeaf;
export interface RuleNode {
  operator: LogicalOp;
  conditions: Rule[];
}
export interface RuleLeaf {
  field: string;
  op: RuleOp;
  value?: unknown | unknown[];
}
export interface BehaviorLeaf {
  behavior: { /* see above */ };
}

export interface Segment {
  id: string;
  name: string;
  description?: string;
  status: string;
  current_version_id?: string;
}
export interface SegmentVersion {
  version: number;
  rule_json: Rule;
  status: string;
}
export interface SegmentMembership {
  customer_profile_id: string;
  status: 'member' | string;
  entered_at?: string;
  exited_at?: string | null;
  last_evaluated_at?: string;
  version?: number;
  transition_seq?: number;
}
```

Errors use the standard envelope `{ error: { code, message } }`. `bad_request` (400) is the validation error to map onto rule leaves.

## States (loading / empty / error)

| State                                      | Behavior                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Loading (list/detail/members/destinations) | Skeletons / grid loading overlay                                                                               |
| Empty (list)                               | EmptyState "No segments yet — create your first audience" + New segment CTA                                    |
| Empty (members)                            | EmptyState "No members yet — segments are evaluated asynchronously; refresh in a moment" + refresh button      |
| Error                                      | ErrorState with retry; map `403` to permission/tenant-scope toast; `bad_request` on submit → field/leaf errors |
| Post-write (create/edit)                   | Toast success + async-processing notice ("data may take a few seconds; refresh")                               |

## Actions & confirmations

| Action                     | Perm            | Confirmation                                                                                                                                                            |
| -------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create segment             | `segment:write` | Zod-valid rule required; submit disabled while pending                                                                                                                  |
| Edit segment (new version) | `segment:write` | Inform the user: **"Editing bumps the version"** — the save creates a new immutable `SegmentVersion` and updates `current_version_id`; prior versions remain in history |
| Deactivate segment         | `segment:write` | **ConfirmDialog** (destructive). CODE-ONLY endpoint — see [Backend gaps](../10-backend-gaps-and-caveats.md)                                                             |

On success, invalidate the relevant TanStack Query keys (segment list, this segment's detail/versions/members) so the UI refetches.

## RBAC & PII notes

- Gate all write actions with `<RequirePerm perm="segment:write">`; disabled controls carry a `requires segment:write` tooltip. Read views require `segment:read`; the destinations panel requires `destination:read`.
- Gating is UX only — the server also enforces (`403`). A `403` may mean missing permission **or** tenant-scope violation.
- **PII:** the **Members** grid may surface profile fields; render values **as received** (server-side masked unless the token holds `pii:read`). Never attempt client-side unmasking. If a value looks masked, show the lock-icon tooltip "unmask requires pii:read".

## Acceptance criteria (checklist)

- [ ] Segment list renders via `GET .../segments` (**TBD — backend gap**, flagged); New-segment CTA gated by `segment:write`.
- [ ] Create posts `{name, description?, rule}` to `POST .../segments`; success shows async-processing notice.
- [ ] Edit uses `PUT .../segments/{segmentID}` and the UI states that editing **creates a new version**.
- [ ] Deactivate uses `DELETE .../segments/{segmentID}` behind a ConfirmDialog and is documented as CODE-ONLY (not in openapi.yaml, hand-add to client).
- [ ] Rule builder supports nested AND/OR/NOT groups with add/remove condition and add/remove group.
- [ ] Field picker offers all namespaces from brief §6; operator dropdown is `RuleOp`, filtered by field type.
- [ ] `in`/`not_in` render an array value input; `exists`/`not_exists` render no value input.
- [ ] Rule tree validated with Zod before submit; server `bad_request` errors surface on the offending leaf.
- [ ] Live `JsonViewer` preview stays in sync with the builder and equals the posted `rule`.
- [ ] BehaviorLeaf editor is feature-flagged, labeled "advanced/beta", mutually exclusive with field/op/value, warns on window-widening, and forbids `exact`/`sequence` on high-frequency events.
- [ ] Version history panel lists append-only `SegmentVersion`s and marks `current_version_id`.
- [ ] Members grid renders `GET .../members` (client-side paging) with PII-masked values as received.
- [ ] Wired-destinations panel renders `GET .../destinations` and is hidden without `destination:read`.
- [ ] Read-only roles (ANALYST/VIEWER/OPERATOR) see no enabled write actions.

```

```
