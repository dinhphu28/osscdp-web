import { test, expect } from '@playwright/test';
import { installMockApi, connect, TEST_TENANT } from './support';

/**
 * Management actions unblocked by the new backend endpoints: disabling a source
 * and revoking an admin token (both per-row → ConfirmDialog → mutation).
 * See docs/screens/03-sources.md and docs/screens/09-administration.md.
 */

test('sources: disable a source from the row action', async ({ page }) => {
  const sourceId = '33333333-3333-3333-3333-333333333333';
  const mock = await installMockApi(page, {
    sources: [
      {
        id: sourceId,
        tenant_id: TEST_TENANT,
        name: 'to-disable',
        type: 'server',
        status: 'active',
        created_at: '2026-07-01T00:00:00Z',
      },
    ],
  });

  await connect(page, mock);
  await page.getByRole('link', { name: 'Sources' }).click();
  await expect(page.getByRole('gridcell', { name: 'to-disable' })).toBeVisible();

  await page.getByRole('button', { name: 'Disable' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Disable this source?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Disable' }).click();

  await expect
    .poll(() =>
      mock.requests.some(
        (r) => r.method === 'POST' && r.path.endsWith(`/sources/${sourceId}/disable`),
      ),
    )
    .toBe(true);
});

test('administration: list admin tokens and revoke one', async ({ page }) => {
  const tokenId = '44444444-4444-4444-4444-444444444444';
  const mock = await installMockApi(page, {
    adminTokens: [
      {
        id: tokenId,
        name: 'ci-token',
        role: 'MARKETER',
        tenant_id: TEST_TENANT,
        status: 'active',
        created_at: '2026-07-01T00:00:00Z',
      },
    ],
  });

  await connect(page, mock); // SUPER_ADMIN
  await page.getByRole('link', { name: 'Administration' }).click();

  // The seeded token appears in the list table.
  await expect(page.getByRole('gridcell', { name: 'ci-token' })).toBeVisible();

  await page.getByRole('button', { name: 'Revoke' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Revoke admin token' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Revoke' }).click();

  await expect
    .poll(() =>
      mock.requests.some(
        (r) => r.method === 'POST' && r.path.endsWith(`/admin-tokens/${tokenId}/revoke`),
      ),
    )
    .toBe(true);
});
