import { expect, type Page, type Route } from '@playwright/test';

/**
 * Shared e2e harness. The console talks to the osscdp admin API at a cross-origin
 * base URL (default http://localhost:8080). Rather than stand up the full Go +
 * Postgres + Redpanda stack, we intercept those requests in the browser with
 * Playwright routing and serve realistic responses (shapes match the generated
 * models). This exercises the REAL UI end-to-end.
 *
 * To run against a live backend instead: point VITE_API_BASE_URL at it, remove
 * the `installMockApi(page)` call, and seed real data. See docs/08-testing-and-quality.md.
 */

export const TEST_TENANT = '11111111-1111-1111-1111-111111111111';
export const TEST_TOKEN = 'cdpadm_e2e_test_token';
export const BASE_API = 'http://localhost:8080';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'Authorization,Content-Type,Accept,X-Api-Key,X-CDP-Api-Key',
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface MockSeed {
  /** Profiles returned by the search endpoint (?email/?phone). */
  profiles?: Array<Record<string, unknown>>;
  /** A single profile returned by GET .../profiles/{cuid}. */
  profile?: Record<string, unknown>;
  /** DLQ events returned by GET .../dlq. */
  dlqEvents?: Array<Record<string, unknown>>;
  /** Events page returned by GET .../events. */
  events?: Array<Record<string, unknown>>;
  /** Segment returned by GET .../segments/{id}. */
  segment?: Record<string, unknown>;
  /** Destination returned by GET .../destinations/{id}. */
  destination?: Record<string, unknown>;
  /** List endpoints (browsable console). */
  sources?: Array<Record<string, unknown>>;
  segments?: Array<Record<string, unknown>>;
  destinations?: Array<Record<string, unknown>>;
  tenants?: Array<Record<string, unknown>>;
  /** Admin tokens returned by GET /admin/v1/admin-tokens. */
  adminTokens?: Array<Record<string, unknown>>;
  /** Audit entries returned by GET .../audit. */
  auditEntries?: Array<Record<string, unknown>>;
  /** Stats object returned by GET .../stats. */
  stats?: Record<string, number>;
  /** Principal returned by GET /admin/v1/whoami (set by `connect`). */
  whoami?: { role: string; tenant_id: string | null; is_super_admin: boolean };
  /** Force GET .../dlq to fail (to exercise error states). */
  healthFails?: boolean;
}

export interface MockApi {
  seed: MockSeed;
  /** Requests captured for assertions (method + path + parsed JSON body). */
  requests: Array<{ method: string; path: string; body: unknown }>;
}

/**
 * Install the mock API on a page. Returns a handle whose `seed` can be mutated
 * before navigation and whose `requests` records calls for assertions.
 */
export async function installMockApi(page: Page, seed: MockSeed = {}): Promise<MockApi> {
  const api: MockApi = { seed, requests: [] };

  // Disable CSS transitions/animations so MUI menus/dialogs open instantly and
  // stably (avoids "element not stable / detached" flakes on Select/Menu popovers).
  await page.addInitScript(() => {
    const css =
      '*,*::before,*::after{transition:none!important;animation:none!important;transition-duration:0s!important;animation-duration:0s!important;}' +
      // Hover tooltips overlay menus/options and intercept clicks; hide them in tests.
      '.MuiTooltip-popper{display:none!important;}';
    const style = document.createElement('style');
    style.appendChild(document.createTextNode(css));
    document.documentElement.appendChild(style);
  });

  const handle = async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname;

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' });
    }

    let body: unknown = undefined;
    try {
      body = req.postData() ? JSON.parse(req.postData() as string) : undefined;
    } catch {
      body = req.postData();
    }
    api.requests.push({ method, path, body });

    // ---- health ----
    if (path.endsWith('/healthz')) return json(route, 200, { status: 'ok' });

    // ---- whoami + read lists (browsable console); anchored to avoid collisions ----
    if (method === 'GET' && path.endsWith('/admin/v1/whoami')) {
      return json(
        route,
        200,
        api.seed.whoami ?? { role: 'SUPER_ADMIN', tenant_id: null, is_super_admin: true },
      );
    }
    if (method === 'GET' && path.endsWith('/admin/v1/tenants')) {
      return json(route, 200, { tenants: api.seed.tenants ?? [] });
    }
    if (method === 'GET' && path.endsWith('/admin/v1/admin-tokens')) {
      return json(route, 200, { tokens: api.seed.adminTokens ?? [] });
    }
    if (method === 'GET' && /\/tenants\/[^/]+\/sources$/.test(path)) {
      return json(route, 200, { sources: api.seed.sources ?? [] });
    }
    if (method === 'GET' && /\/tenants\/[^/]+\/segments$/.test(path)) {
      return json(route, 200, { segments: api.seed.segments ?? [] });
    }
    if (method === 'GET' && /\/tenants\/[^/]+\/destinations$/.test(path)) {
      return json(route, 200, { destinations: api.seed.destinations ?? [] });
    }
    if (method === 'GET' && /\/tenants\/[^/]+\/audit$/.test(path)) {
      return json(route, 200, { entries: api.seed.auditEntries ?? [], next_cursor: '' });
    }
    if (method === 'GET' && /\/tenants\/[^/]+\/stats$/.test(path)) {
      return json(
        route,
        200,
        api.seed.stats ?? { dlq_open: 0, sources: 0, segments: 0, destinations: 0, profiles: 0 },
      );
    }

    // ---- sources ----
    if (method === 'POST' && /\/sources$/.test(path)) {
      const b = (body ?? {}) as { name?: string; type?: string };
      return json(route, 201, {
        id: 'src-e2e-1',
        tenant_id: TEST_TENANT,
        name: b.name,
        type: b.type,
        status: 'active',
        api_key: 'cdp_live_E2ETESTKEY_abcdef123456',
      });
    }
    if (method === 'POST' && /\/sources\/[^/]+\/rotate-key$/.test(path)) {
      return json(route, 200, { api_key: 'cdp_live_ROTATED_zyxwv987654' });
    }
    if (method === 'POST' && /\/sources\/[^/]+\/disable$/.test(path)) {
      return json(route, 200, { id: pathId(path, 'disable'), status: 'disabled' });
    }

    // ---- admin tokens ----
    if (method === 'POST' && path.endsWith('/admin/v1/admin-tokens')) {
      const b = (body ?? {}) as { role?: string };
      return json(route, 201, { api_token: 'cdpadm_MINTED_e2e_0001', role: b.role ?? 'VIEWER' });
    }
    if (method === 'POST' && /\/admin-tokens\/[^/]+\/revoke$/.test(path)) {
      return json(route, 200, { id: pathId(path, 'revoke'), status: 'revoked' });
    }

    // ---- tenants ----
    if (method === 'POST' && path.endsWith('/admin/v1/tenants')) {
      const b = (body ?? {}) as { name?: string };
      return json(route, 201, {
        id: 'tenant-e2e-new',
        name: b.name,
        status: 'active',
        created_at: '2026-07-05T00:00:00Z',
        updated_at: '2026-07-05T00:00:00Z',
      });
    }

    // ---- profiles ----
    if (method === 'GET' && /\/profiles$/.test(path)) {
      return json(route, 200, { profiles: api.seed.profiles ?? [] });
    }
    if (method === 'GET' && /\/profiles\/[^/]+$/.test(path)) {
      return json(route, 200, api.seed.profile ?? defaultProfile(path));
    }
    if (method === 'GET' && /\/profiles\/[^/]+\/consent$/.test(path)) {
      return json(route, 200, { consent: [] });
    }
    if (method === 'PUT' && /\/profiles\/[^/]+\/consent$/.test(path)) {
      return json(route, 200, { status: 'ok' });
    }
    if (method === 'GET' && /\/profiles\/[^/]+\/identifiers$/.test(path)) {
      return json(route, 200, {
        canonical_user_id: 'customer_e2e',
        total: 2,
        by_namespace: { email: 1, user_id: 1 },
        values: { email: ['e***@x.com'], user_id: ['u1'] },
      });
    }
    if (method === 'GET' && /\/profiles\/[^/]+\/export$/.test(path)) {
      return json(route, 200, {
        profile: api.seed.profile ?? defaultProfile(path),
        identity_nodes: [{ namespace: 'email', value_hash: 'abc' }],
        segment_memberships: [],
        consent: [],
      });
    }
    if (method === 'DELETE' && /\/profiles\/[^/]+$/.test(path)) {
      return json(route, 200, { deleted: { customer_profile: 1, consent: 0, identity_nodes: 2 } });
    }

    // ---- segments ----
    if (method === 'POST' && /\/segments$/.test(path)) {
      const b = (body ?? {}) as { name?: string };
      return json(route, 201, {
        id: 'seg-e2e-1',
        name: b.name,
        status: 'active',
        current_version_id: 'segver-1',
      });
    }
    if (method === 'PUT' && /\/segments\/[^/]+$/.test(path)) {
      const b = (body ?? {}) as { name?: string };
      return json(route, 200, { id: 'seg-e2e-1', name: b.name, status: 'active' });
    }
    if (method === 'GET' && /\/segments\/[^/]+\/members$/.test(path)) {
      return json(route, 200, { members: [] });
    }
    if (method === 'GET' && /\/segments\/[^/]+\/destinations$/.test(path)) {
      return json(route, 200, { destinations: [] });
    }
    if (method === 'GET' && /\/segments\/[^/]+$/.test(path)) {
      return json(
        route,
        200,
        api.seed.segment ?? {
          id: 'seg-e2e-1',
          name: 'E2E segment',
          status: 'active',
          current_version_id: 'segver-1',
          rule: {
            operator: 'and',
            conditions: [{ field: 'profile.traits.country', op: 'eq', value: 'US' }],
          },
        },
      );
    }

    // ---- destinations ----
    if (method === 'POST' && /\/destinations$/.test(path)) {
      const b = (body ?? {}) as { name?: string; type?: string; config?: unknown };
      return json(route, 201, {
        id: 'dst-e2e-1',
        tenant_id: TEST_TENANT,
        name: b.name,
        type: b.type,
        status: 'active',
        config: b.config ?? {},
      });
    }
    if (method === 'PUT' && /\/destinations\/[^/]+$/.test(path)) {
      return json(route, 200, { id: 'dst-e2e-1', status: 'disabled' });
    }
    if (method === 'POST' && /\/destinations\/[^/]+\/subscriptions$/.test(path)) {
      const b = (body ?? {}) as { segment_id?: string };
      return json(route, 201, {
        id: 'sub-e2e-1',
        destination_id: 'dst-e2e-1',
        trigger_type: 'segment_membership',
        segment_id: b.segment_id,
        status: 'active',
      });
    }
    if (method === 'DELETE' && /\/subscriptions\/[^/]+$/.test(path)) {
      return json(route, 200, { id: 'sub-e2e-1', status: 'disabled' });
    }
    if (method === 'GET' && /\/destinations\/[^/]+\/deliveries$/.test(path)) {
      return json(route, 200, { deliveries: [] });
    }
    if (method === 'GET' && /\/destinations\/[^/]+$/.test(path)) {
      return json(
        route,
        200,
        api.seed.destination ?? {
          id: 'dst-e2e-1',
          type: 'webhook',
          name: 'E2E webhook',
          status: 'active',
          config: { url: 'https://example.test/hook' },
        },
      );
    }

    // ---- dlq ----
    if (method === 'GET' && /\/dlq$/.test(path)) {
      return json(route, 200, { events: api.seed.dlqEvents ?? [] });
    }
    if (method === 'POST' && /\/dlq\/[^/]+\/retry$/.test(path)) {
      return json(route, 200, { id: pathId(path, 'retry'), status: 'retried' });
    }
    if (method === 'POST' && /\/dlq\/[^/]+\/discard$/.test(path)) {
      return json(route, 200, { id: pathId(path, 'discard'), status: 'discarded' });
    }

    // ---- events ----
    if (method === 'POST' && /\/events\/[^/]+\/replay$/.test(path)) {
      return json(route, 202, { status: 'accepted' });
    }
    if (method === 'POST' && /\/replay$/.test(path)) {
      return json(route, 202, { status: 'accepted' });
    }
    if (method === 'GET' && /\/events\/[^/]+$/.test(path)) {
      return json(route, 200, (api.seed.events ?? [])[0] ?? defaultEvent());
    }
    if (method === 'GET' && /\/events$/.test(path)) {
      return json(route, 200, { events: api.seed.events ?? [], next_cursor: '' });
    }

    // Fallback: empty 200 so an unmodelled call never hangs the UI.
    return json(route, 200, {});
  };

  await page.route(`${BASE_API}/**`, handle);
  return api;
}

function pathId(path: string, tail: string): string {
  const parts = path.split('/');
  return parts[parts.indexOf(tail) - 1] ?? 'dlq-1';
}

function defaultProfile(path: string): Record<string, unknown> {
  const cuid = decodeURIComponent(path.split('/profiles/')[1]?.split('/')[0] ?? 'customer_e2e');
  return {
    id: 'prof-e2e-1',
    canonical_user_id: cuid,
    identity_cluster_id: 'cluster-e2e-1',
    traits: { email: 'e***@x.com', name: 'N***', country: 'US' },
    computed_attributes: { total_events: 42, total_orders: 3, last_event_name: 'order_completed' },
    first_seen_at: '2026-06-01T00:00:00Z',
    last_seen_at: '2026-07-04T00:00:00Z',
    version: 5,
  };
}

function defaultEvent(): Record<string, unknown> {
  return {
    id: 'evt-e2e-1',
    tenant_id: TEST_TENANT,
    event_id: 'evt-e2e-1',
    source_id: 'src-e2e-1',
    type: 'track',
    event_name: 'page_viewed',
    processing_status: 'stored',
    received_at: '2026-07-04T00:00:00Z',
    timestamp: '2026-07-04T00:00:00Z',
    payload_json: { properties: { url: '/home' } },
  };
}

/** Role type for the connect helper. */
export type ConnectRole =
  'SUPER_ADMIN' | 'TENANT_ADMIN' | 'MARKETER' | 'ANALYST' | 'OPERATOR' | 'VIEWER';

/**
 * Perform the token-entry connect flow and land on the tenant dashboard.
 *
 * The role is now resolved from GET /admin/v1/whoami (no dropdown). This helper
 * seeds `mock.seed.whoami` from `opts.role`: a pinned (non-super) role reports a
 * `tenant_id` and lands directly on the dashboard; SUPER_ADMIN reports null and
 * is routed via /select-tenant, where we pick the tenant. Pass the `MockApi`
 * handle returned by `installMockApi`.
 */
export async function connect(
  page: Page,
  mock: MockApi,
  opts: { role?: ConnectRole; tenantId?: string } = {},
): Promise<void> {
  const role = opts.role ?? 'SUPER_ADMIN';
  const tenantId = opts.tenantId ?? TEST_TENANT;
  const pinned = role !== 'SUPER_ADMIN';

  mock.seed.whoami = {
    role,
    tenant_id: pinned ? tenantId : null,
    is_super_admin: role === 'SUPER_ADMIN',
  };

  await page.goto('/connect');
  await page.getByLabel('Admin token').fill(TEST_TOKEN);
  await page.getByRole('button', { name: 'Connect' }).click();

  // Super-admin → /select-tenant (pick a tenant); pinned → straight to dashboard.
  await page.waitForURL(/\/(select-tenant|t\/[^/]+\/dashboard)/);
  if (page.url().includes('/select-tenant')) {
    await page.getByLabel('Tenant ID (UUID)').fill(tenantId);
    await page.getByRole('button', { name: 'Open tenant' }).click();
  }

  await expect(page).toHaveURL(new RegExp(`/t/${tenantId}/dashboard`));
}
