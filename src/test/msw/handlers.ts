import { http, HttpResponse } from 'msw';

/**
 * Default MSW handlers for component tests. They mirror the real admin API shapes
 * (see docs/04-api-integration.md). Base URL matches VITE_API_BASE_URL used by the
 * Axios instance. Individual tests override a handler with `server.use(...)` to
 * exercise errors, one-time secrets, empty lists, etc.
 */
export const BASE = 'http://localhost:8080';

export const handlers = [
  http.get(`${BASE}/healthz`, () => HttpResponse.json({ status: 'ok' })),

  // Auth
  http.get(`${BASE}/admin/v1/whoami`, () =>
    HttpResponse.json({ role: 'SUPER_ADMIN', tenant_id: null, is_super_admin: true }),
  ),

  // Sources
  http.get(`${BASE}/admin/v1/tenants/:tenantID/sources`, () => HttpResponse.json({ sources: [] })),
  http.post(`${BASE}/admin/v1/tenants/:tenantID/sources`, async ({ request }) => {
    const body = (await request.json()) as { name?: string; type?: string };
    return HttpResponse.json(
      {
        id: 'src-test-1',
        tenant_id: 't',
        name: body.name,
        type: body.type,
        status: 'active',
        api_key: 'cdp_live_TESTKEY_abc123',
      },
      { status: 201 },
    );
  }),
  http.post(`${BASE}/admin/v1/tenants/:tenantID/sources/:sourceID/rotate-key`, () =>
    HttpResponse.json({ api_key: 'cdp_live_ROTATED_xyz789' }),
  ),
  http.post(`${BASE}/admin/v1/tenants/:tenantID/sources/:sourceID/disable`, ({ params }) =>
    HttpResponse.json({ id: params.sourceID, status: 'disabled' }),
  ),

  // Consent
  http.get(`${BASE}/admin/v1/tenants/:tenantID/profiles/:cuid/consent`, () =>
    HttpResponse.json({ consent: [] }),
  ),
  http.put(`${BASE}/admin/v1/tenants/:tenantID/profiles/:cuid/consent`, () =>
    HttpResponse.json({ status: 'ok' }),
  ),
];
