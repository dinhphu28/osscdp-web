import { test, expect } from '@playwright/test';

/**
 * LIVE smoke test — drives the REAL console against a REAL running backend
 * (NO mock). Skipped unless LIVE_SMOKE=1 so it never runs in normal CI (which has
 * no backend). See docs/08-testing-and-quality.md and the plan.
 *
 * Run (with the backend up + data seeded):
 *   LIVE_SMOKE=1 ADMIN_TOKEN=… TENANT_ID=… PROFILE_EMAIL=… \
 *     pnpm exec playwright test live-smoke
 *
 * This is the only spec that exercises CORS, real response shapes, and real auth.
 */
const LIVE = !!process.env.LIVE_SMOKE;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? 'dev-admin-token-change-me';
const TENANT_ID = process.env.TENANT_ID ?? '';
const PROFILE_EMAIL = process.env.PROFILE_EMAIL ?? 'smoke@x.com';
const SHOTS = 'test-results/live';

test.describe('live backend smoke', () => {
  test.skip(!LIVE, 'set LIVE_SMOKE=1 (and a running backend + seeded data) to run');

  test('connect → browse real data across the console', async ({ page }) => {
    // 1. Connect: paste the admin token → whoami resolves the role (real CORS/auth).
    await page.goto('/connect');
    await page.getByLabel('Admin token').fill(ADMIN_TOKEN);
    await page.getByRole('button', { name: 'Connect' }).click();

    // SUPER_ADMIN (tenant_id null) → tenant selection. If CORS/auth were broken,
    // whoami would fail and we'd never leave /connect.
    await expect(page).toHaveURL(/\/select-tenant/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Choose a tenant' })).toBeVisible();
    // The seeded tenant is newest (list is created_at DESC) → visible near the top.
    await expect(page.getByText('smoketest', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/01-select-tenant.png`, fullPage: true });

    // 2. Open the seeded tenant → dashboard with real health + stats.
    await page.getByLabel('Tenant ID (UUID)').fill(TENANT_ID);
    await page.getByRole('button', { name: 'Open tenant' }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${TENANT_ID}/dashboard`));
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('OK', { exact: true })).toBeVisible(); // health from /healthz
    await page.screenshot({ path: `${SHOTS}/02-dashboard.png`, fullPage: true });

    // 3. Sources — real list endpoint shows the seeded "web" source.
    await page.getByRole('link', { name: 'Sources' }).click();
    await expect(page.getByRole('gridcell', { name: 'web' })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/03-sources.png`, fullPage: true });

    // 4. Segments — real list shows the seeded "vn-viewers" segment.
    await page.getByRole('link', { name: 'Segments' }).click();
    await expect(page.getByRole('gridcell', { name: 'vn-viewers' })).toBeVisible({
      timeout: 10000,
    });
    await page.screenshot({ path: `${SHOTS}/04-segments.png`, fullPage: true });

    // 5. Customer 360 — search the real profile produced by the pipeline.
    await page.getByRole('link', { name: 'Profiles' }).click();
    await page.getByPlaceholder('name@example.com').fill(PROFILE_EMAIL);
    await page.getByRole('button', { name: 'Search' }).click();
    await page
      .getByText(/^customer_/)
      .first()
      .click();
    await expect(page).toHaveURL(/\/profiles\/customer_/);
    await expect(page.getByRole('tab', { name: 'Consent' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/05-customer360.png`, fullPage: true });

    // 6. Audit — the seed's create operations were audited → live keyset table has rows.
    await page.getByRole('link', { name: 'Audit' }).click();
    await expect(page.getByRole('gridcell').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/06-audit.png`, fullPage: true });

    // 7. Administration — real tenant list (shows the seeded tenant) + admin-token list.
    await page.getByRole('link', { name: 'Administration' }).click();
    await expect(page.getByText('smoketest', { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
    await page.screenshot({ path: `${SHOTS}/07-administration.png`, fullPage: true });
  });
});
