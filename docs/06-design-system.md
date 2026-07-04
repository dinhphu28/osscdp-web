# Design System & Shared UI

> Purpose: MUI theming, the app shell, and the reusable components every screen in the osscdp-web admin console depends on.

This doc defines the visual/interaction foundation. Screen docs (`docs/screens/*`) assume these components exist and behave exactly as specified here. See also [API integration](04-api-integration.md), [Data model & types](07-data-model-and-types.md), and [Backend gaps & caveats](10-backend-gaps-and-caveats.md).

---

## 1. MUI Theme (`src/app/theme.ts`)

The console is a **data-dense operator tool**. Optimize for information density, legibility, and fast scanning — not marketing polish. Use MUI Material v6+.

### 1.1 Palette (light + dark)

Provide two palettes toggled by mode. Keep semantic colors aligned with `StatusChip` (§3.2) so status color meaning is consistent everywhere.

```ts
import { createTheme, type ThemeOptions } from '@mui/material/styles';

const shared: ThemeOptions = {
  spacing: 8, // 8px base unit
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: `Inter, Roboto, system-ui, -apple-system, "Segoe UI", sans-serif`,
    fontSize: 13, // denser than MUI's 14 default
    h1: { fontSize: '1.6rem', fontWeight: 600 },
    h2: { fontSize: '1.3rem', fontWeight: 600 },
    h3: { fontSize: '1.1rem', fontWeight: 600 },
    body2: { fontSize: '0.8125rem' },
    // Monospace for ids, tokens, hashes, JSON
    // apply via <Typography sx={{ fontFamily: 'monospace' }}> or a Mono component
  },
};

export const buildTheme = (mode: 'light' | 'dark') =>
  createTheme({
    ...shared,
    palette:
      mode === 'light'
        ? {
            mode: 'light',
            primary: { main: '#1f5eff' },
            background: { default: '#f6f7f9', paper: '#ffffff' },
            success: { main: '#2e7d32' }, // active / succeeded
            warning: { main: '#ed6c02' }, // pending
            error: { main: '#d32f2f' }, // denied / failed_* / dlq
            grey: { 500: '#9e9e9e' }, // disabled / skipped
          }
        : {
            mode: 'dark',
            primary: { main: '#5b8bff' },
            background: { default: '#0f1115', paper: '#161a20' },
            success: { main: '#66bb6a' },
            warning: { main: '#ffa726' },
            error: { main: '#f44336' },
            grey: { 500: '#8a8f98' },
          },
    components: componentDefaults, // see §1.3
  });
```

### 1.2 Density

- Global `fontSize: 13` and Data Grid `density="compact"` (see §3.3) to fit more rows.
- Buttons default to `size="small"`; text fields default to `size="small"` and `margin="dense"`.
- Table cells use the relative-time formatter (§3.3) to keep timestamp columns narrow.

### 1.3 Component defaults

```ts
const componentDefaults = {
  MuiButton: { defaultProps: { size: 'small', disableElevation: true } },
  MuiTextField: { defaultProps: { size: 'small', margin: 'dense', fullWidth: true } },
  MuiSelect: { defaultProps: { size: 'small' } },
  MuiChip: { defaultProps: { size: 'small' } },
  MuiTooltip: { defaultProps: { arrow: true } },
  MuiTable: { defaultProps: { size: 'small' } },
  // Data Grid defaults live where the grid wrapper is defined (§3.3):
  // density: 'compact', disableRowSelectionOnClick: true, pageSizeOptions: [25, 50, 100]
} as const;
```

### 1.4 Dark-mode toggle (persisted)

Mode lives in a small `ColorModeProvider` (React context), initialized from `localStorage` and defaulting to the OS preference. Persist on every change under key `osscdp.colorMode`.

```ts
const STORAGE_KEY = 'osscdp.colorMode';

function initialMode(): 'light' | 'dark' {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
// on toggle: setMode(next); localStorage.setItem(STORAGE_KEY, next);
```

`ThemeProvider` wraps the app in `src/app/providers.tsx` (alongside `QueryClientProvider`, `TenantProvider`, `AuthProvider`, `SnackbarProvider`). Always render `<CssBaseline />`.

---

## 2. App Shell / Layout (`src/app/AppLayout.tsx`)

Layout route for `/t/:tenantId`. Renders the nav rail, top bar, breadcrumb, and the routed content via `<Outlet />`.

```
┌────────────────────────────────────────────────────────────────┐
│ TopBar: [tenant switcher ▾] ......  connected as MARKETER · ☾ · ⎋ │
├───────────┬────────────────────────────────────────────────────┤
│ Nav rail  │ Breadcrumb: Tenant / Segments / New                 │
│ (icon +   │ ┌────────────────────────────────────────────────┐ │
│  label,   │ │ <Outlet />  (routed screen)                     │ │
│  perm-    │ │                                                 │ │
│  gated)   │ └────────────────────────────────────────────────┘ │
└───────────┴────────────────────────────────────────────────────┘
```

### 2.1 Left nav rail

One entry per feature, each with an `@mui/icons-material` icon + label, gated by the current role's permissions (computed from the role→permission table in [API integration](04-api-integration.md) / auth lib). Hide (do not merely disable) items the role can never use.

| Nav item       | Route                         | Icon (suggested)     | Gate (permission)                                                   |
| -------------- | ----------------------------- | -------------------- | ------------------------------------------------------------------- |
| Dashboard      | `/t/:tenantId/dashboard`      | `Dashboard`          | none (any valid token)                                              |
| Sources        | `/t/:tenantId/sources`        | `Sensors`            | `source:read`                                                       |
| Events         | `/t/:tenantId/events`         | `Timeline`           | `event:read`                                                        |
| Profiles       | `/t/:tenantId/profiles`       | `Person`             | `profile:read`                                                      |
| Segments       | `/t/:tenantId/segments`       | `GroupWork`          | `segment:read`                                                      |
| Destinations   | `/t/:tenantId/destinations`   | `CallSplit`          | `destination:read`                                                  |
| DLQ            | `/t/:tenantId/dlq`            | `Warning`            | `dlq:read`                                                          |
| Audit          | `/t/:tenantId/audit`          | `History`            | `audit:read` (Phase 2 — see [gaps](10-backend-gaps-and-caveats.md)) |
| Administration | `/t/:tenantId/administration` | `AdminPanelSettings` | `admin:write`                                                       |

- Active route highlighted. Rail is collapsible to icons-only (persist collapse state in `localStorage`).
- Audit item is shown but leads to a "blocked on backend endpoint" banner ([gaps](10-backend-gaps-and-caveats.md)).

### 2.2 Top bar

- **Tenant switcher** — a `Select`/menu of tenants. For `SUPER_ADMIN` (token `tenant_id: null`) list all tenants and allow switching (navigates to `/t/:newTenantId/...`). For any other role the token is pinned to one tenant → show it read-only or hide the control (see multi-tenancy rules in [API integration](04-api-integration.md)).
- **"connected as `<role>`"** — role is the operator-declared role from the connect flow (there is **no whoami** endpoint; TBD — backend gap, see [gaps](10-backend-gaps-and-caveats.md)). Render as a subtle chip.
- **Theme toggle** — sun/moon icon, calls the color-mode toggle (§1.4).
- **Disconnect** — clears the stored admin token and redirects to `/connect`.

### 2.3 Breadcrumb

Derived from the route tree (tenant → feature → sub-resource). Sub-resource ids shown truncated + copyable. Keep it single-line; truncate long ids with a tooltip.

---

## 3. Shared Components (`src/components/*`)

Every component below is reusable and screen-agnostic. Props are prescriptive.

### 3.1 `PageHeader`

Rendered at the top of every screen.

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; to?: string }[];
  actions?: React.ReactNode; // primary action button(s), usually perm-gated
}
```

Behavior: `h1` title, muted `body2` description, right-aligned `actions`. Wrap write actions in `<RequirePerm>` / disable with `PermissionTooltip` (§3.12).

### 3.2 `StatusChip`

Maps a status enum value to an MUI `Chip` color. Single source of truth for status colors across the app.

```tsx
interface StatusChipProps {
  status: string;
}
```

| Status value       | Color           | Applies to                                       |
| ------------------ | --------------- | ------------------------------------------------ |
| `active`           | success (green) | Tenant, Source, AdminToken, Destination, Segment |
| `succeeded`        | success (green) | activation task                                  |
| `granted`          | success (green) | consent                                          |
| `disabled`         | grey            | Source, Destination                              |
| `skipped`          | grey            | activation task (consent_denied)                 |
| `unknown`          | grey            | consent                                          |
| `pending`          | warning (amber) | activation task                                  |
| `sending`          | warning (amber) | activation task                                  |
| `denied`           | error (red)     | consent                                          |
| `failed_retryable` | error (red)     | activation task                                  |
| `failed_permanent` | error (red)     | activation task                                  |
| `dlq`              | error (red)     | activation task                                  |
| `open`             | warning (amber) | DLQ event                                        |
| `retried`          | success (green) | DLQ event                                        |
| `discarded`        | grey            | DLQ event                                        |

- Use a lookup map; unknown/unmapped values fall back to a `default` grey chip and render the raw string (never crash on an unexpected status).
- Enum values must match [Data model & types](07-data-model-and-types.md) exactly (`ActivationTaskStatus`, `DlqStatus`, `ConsentStatus`, entity `status`).

### 3.3 `DataGrid` wrapper (`components/DataGrid`)

Thin wrapper over **MUI X Data Grid v7+** that standardizes the two pagination modes and common columns.

```tsx
interface AppDataGridProps<Row> {
  rows: Row[];
  columns: GridColDef<Row>[];
  loading?: boolean;
  mode: 'server' | 'client';
  // server (keyset/cursor) mode — ONLY the events list:
  hasNextPage?: boolean;
  onLoadMore?: () => void; // fetch next cursor page
  // client (filter-only) mode — profiles, dlq, segment members, deliveries, consent:
  getRowId?: (row: Row) => string;
  emptyState?: React.ReactNode; // renders EmptyState when rows.length === 0
  error?: unknown;
  onRetry?: () => void; // renders ErrorState with retry
}
```

- **`mode: 'server'`** → Data Grid `paginationMode="server"`, cursor-based. Events use `useInfiniteQuery` with `next_cursor`; there are no page numbers. Use a "Load more" / infinite scroll driven by `hasNextPage`/`onLoadMore`. (Only `GET .../events` is keyset — see [API integration](04-api-integration.md).)
- **`mode: 'client'`** → all filter-only endpoints return full arrays; use client-side paging/sorting. `pageSizeOptions={[25, 50, 100]}`, `density="compact"`.
- **States:** if `loading` → LoadingSkeletons (§3.9); if `error` → ErrorState (§3.8) with `onRetry`; if empty → `emptyState`/EmptyState (§3.7). Never render an empty grid with no message.

**Common column helpers** (exported factories):

| Helper                      | Renders                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `idColumn(field)`           | monospace, truncated, with inline `CopyButton` (copyable id)    |
| `statusColumn(field)`       | `StatusChip`                                                    |
| `relativeTimeColumn(field)` | relative-time via formatter (see below), tooltip = absolute ISO |
| `actionsColumn(getActions)` | `type: 'actions'`, perm-gated `GridActionsCellItem`s            |

**Relative-time formatter** (`lib/format`): renders `"3m ago"`, `"2h ago"`, `"5d ago"` from an ISO timestamp; tooltip shows full absolute time. Used in every timestamp column and in list items.

### 3.4 `OneTimeSecretDialog`

Shows a plaintext secret returned exactly once. Reused for **source API keys** (`cdp_...`), **admin tokens** (`cdpadm_...`), and **destination secrets** (§5.5 of the brief — one-time secrets).

```tsx
interface OneTimeSecretDialogProps {
  open: boolean;
  title: string; // e.g. "Source API key created"
  secret: string; // the plaintext value
  helperText?: string; // e.g. "Give this key to the source's engineers."
  onClose: () => void; // only enabled after confirm-to-close
}
```

Behavior:

- Prominent read-only field with the secret + a large `CopyButton`.
- A **warning banner**: "This value is shown once and cannot be retrieved again. Copy it now." (severity `warning`).
- **Confirm-to-close**: a required checkbox "I have copied and stored this value" that enables the Close button. Do not allow backdrop/escape dismissal until confirmed.
- Never log the secret; never re-fetch it.

### 3.5 `ConfirmDialog`

For destructive / irreversible actions: GDPR delete, DLQ discard, key rotation, disable destination.

```tsx
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string; // default "Confirm"
  destructive?: boolean; // red confirm button
  // Typed-confirmation variant (GDPR delete):
  confirmToken?: string; // e.g. the canonical_user_id
  confirmTokenLabel?: string; // "Type the canonical_user_id to confirm"
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean; // disable buttons while mutation pending
}
```

- **Typed-confirmation variant:** when `confirmToken` is set, the confirm button stays disabled until the user types the exact token. Used for `DELETE .../profiles/{canonicalUserID}` (GDPR delete requires typing the `canonical_user_id`).
- Destructive confirm button uses `error` color.

### 3.6 `JsonViewer`

Collapsible viewer for event payloads (`payload_json`), DLQ `original_payload`, and segment `rule_json`.

```tsx
interface JsonViewerProps {
  value: unknown;
  collapsed?: boolean | number; // default collapse to depth 1
  maxHeight?: number; // scroll beyond this
}
```

- Monospace, syntax-highlighted, collapsible nodes, copy-whole-value button.
- Read-only. For the rule builder, the raw `rule_json` is shown via this viewer as an "advanced" panel next to the visual builder.

### 3.7 `EmptyState`

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}
```

Centered, muted. Every list/table shows this when there are zero rows (e.g. "No sources yet — create one to start ingesting events").

### 3.8 `ErrorState`

```tsx
interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}
```

- Parses the API error envelope `{ error: { code, message } }` ([Data model & types](07-data-model-and-types.md)) and shows a human message. Renders a **Retry** button when `onRetry` is provided (re-runs the query).
- Distinguish `403` (permission/tenant-scope) with guidance rather than a generic failure.

### 3.9 `LoadingSkeletons`

MUI `Skeleton` compositions matching the target layout: `TableSkeleton` (rows × cols), `CardSkeleton`, `DetailSkeleton`. Shown while a query is `pending`. Prefer skeletons over spinners for tables and detail panes.

### 3.10 `CopyButton`

```tsx
interface CopyButtonProps {
  value: string;
  label?: string;
  size?: 'small' | 'medium';
}
```

Copies `value` to clipboard, shows a transient "Copied" tooltip/toast. Used inline in id columns, the secret dialog, JSON viewer, and instrumentation help.

### 3.11 `StatusChip` color map is authoritative

Any new status introduced by the backend must be added to §3.2's map, not colored ad-hoc.

### 3.12 `PermissionTooltip` / `RequirePerm`

- `<RequirePerm perm="segment:write">…</RequirePerm>` — renders children only if the current role has the permission (from the role→permission table). Used to hide write actions.
- When an action should be visible-but-disabled, wrap the disabled control in `PermissionTooltip` with text **"requires `<perm>`"** (e.g. "requires `dlq:retry`"). Permission strings must match [Data model & types](07-data-model-and-types.md) `Permission`.

```tsx
interface PermissionTooltipProps {
  perm: Permission;
  children: React.ReactElement;
}
// tooltip text: `requires ${perm}`
```

Gating is UX only — the server also enforces (403). See [API integration](04-api-integration.md).

---

## 4. Standard states pattern (loading / empty / error)

**Every data view MUST implement all three**, driven by the TanStack Query result:

```tsx
const q = useSomething(tenantId);
if (q.isPending) return <TableSkeleton rows={8} />;
if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
if (!q.data?.length) return <EmptyState title="Nothing here yet" action={<CreateButton />} />;
return <AppDataGrid mode="client" rows={q.data} columns={cols} />;
```

The `AppDataGrid` wrapper (§3.3) accepts `loading`, `error`, `onRetry`, and `emptyState` so screens can also delegate all three to the grid. Do not ship a data view that renders a blank area in any of these states.

---

## 5. Async-pipeline UX (`ProcessingBanner`)

The pipeline is **asynchronous** — ingest/replay returns `202` and identity → profile → segmentation → activation happen seconds later. After any ingest-affecting or replay action (e.g. `POST .../events/{eventID}/replay`, `POST .../replay`, DLQ retry), show a non-blocking banner and a manual refresh.

```tsx
interface ProcessingBannerProps {
  onRefresh: () => void;
}
// copy: "Processing — data may take a few seconds. Refresh to see updates."
```

- Severity `info`, dismissible, with a **Refresh** button that invalidates/refetches the relevant query keys.
- Never promise instant results; never auto-assert success of downstream stages from a `202`.

---

## 6. Toasts (notistack) & form-error display

### 6.1 notistack toast conventions

Single `SnackbarProvider` at the app root. Use a small `useToast()` wrapper over `useSnackbar`.

| Kind    | Variant   | When                                                                                    |
| ------- | --------- | --------------------------------------------------------------------------------------- |
| success | `success` | mutation succeeded (e.g. "Source created", "DLQ event retried")                         |
| error   | `error`   | mutation/query error surfaced from the error interceptor (message from `error.message`) |
| info    | `info`    | non-blocking notices (e.g. "Copied", processing hints not shown as a banner)            |

- Central Axios error interceptor drives error toasts (except `401` → redirect to `/connect`, and `429` → respect `Retry-After`). See [API integration](04-api-integration.md).
- Keep messages short; include the server `error.message` when present.

### 6.2 Form-error display pattern

Forms use **React Hook Form + Zod** (`@hookform/resolvers`).

- **Field-level errors** come from Zod validation → render inline under the MUI input (`helperText` + `error` prop) via the resolver.
- **Form-level errors** come from the server `bad_request` (400) envelope → render an MUI `Alert severity="error"` at the top of the form with `error.message`. Where the server indicates a specific field, map it onto that field with `setError`.
- Disable the submit button while the mutation is pending; re-enable on settle.

```tsx
const form = useForm({ resolver: zodResolver(schema) });
const onSubmit = form.handleSubmit(async (values) => {
  try {
    await mutate(values);
  } catch (e) {
    const api = parseApiError(e); // { code, message }
    if (api?.code === 'bad_request') setFormError(api.message); // top-level Alert
  }
});
```

---

## 7. Accessibility baseline

Non-negotiable for all screens:

- **Keyboard navigation:** every interactive element reachable and operable by keyboard; logical tab order; visible focus rings (do not remove outlines). Dialogs (`OneTimeSecretDialog`, `ConfirmDialog`) trap focus and restore it on close; Escape cancels (except the secret dialog which requires confirm-to-close).
- **ARIA:** icon-only buttons (nav rail, theme toggle, copy, row actions) carry `aria-label`. `StatusChip` conveys status via text, not color alone. Toasts use polite live regions (notistack default).
- **Contrast:** meet WCAG AA (4.5:1 body text) in both light and dark palettes; status colors chosen in §1.1 satisfy this.
- **Data Grid a11y:** rely on MUI X Data Grid's built-in ARIA grid roles; provide `aria-label` on the grid; ensure row-action buttons and sort/filter controls are keyboard-operable and labeled. Do not disable grid keyboard navigation.
- **PII:** masked values render as received; the "unmask requires `pii:read`" affordance is a labeled lock icon/tooltip, never a color-only cue.

---

## 8. Cross-links

- [API integration](04-api-integration.md) — Axios interceptors, error handling, TanStack Query keys, RBAC gating source.
- [Data model & types](07-data-model-and-types.md) — canonical enums, `Permission`, entity `status` values used by `StatusChip`.
- [Backend gaps & caveats](10-backend-gaps-and-caveats.md) — no whoami (role declared client-side), audit endpoint missing, etc.
