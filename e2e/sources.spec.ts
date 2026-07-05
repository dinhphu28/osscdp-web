import { test, expect } from '@playwright/test';
import { installMockApi, connect, TEST_TENANT } from './support';

/**
 * Sources: the list table renders seeded sources; creating a source surfaces the
 * one-time ingest API key dialog; rotating via the per-row action confirms then
 * surfaces the new one-time key. Exercises the real UI against the mocked admin
 * API. See docs/screens/03-sources.md.
 */
test('sources: list, create one-time key, rotate via row action', async ({ page }) => {
  const sourceId = '22222222-2222-2222-2222-222222222222';
  const mock = await installMockApi(page, {
    sources: [
      {
        id: sourceId,
        tenant_id: TEST_TENANT,
        name: 'web-tracker',
        type: 'server',
        status: 'active',
        created_at: '2026-07-01T00:00:00Z',
      },
    ],
  });

  await connect(page, mock);
  await page.getByRole('link', { name: 'Sources' }).click();
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();

  // The seeded source appears in the list table.
  await expect(page.getByRole('gridcell', { name: 'web-tracker' })).toBeVisible();

  // --- Create: fill Name, leave Type as its "server" default, submit. ---
  await page.getByRole('textbox', { name: 'Name' }).fill('mobile-sdk');
  await page.getByRole('button', { name: 'Create source' }).click();

  const createDialog = page.getByRole('dialog');
  await expect(createDialog.getByText(/cdp_live_E2ETESTKEY/)).toBeVisible();
  await createDialog.getByRole('checkbox').check();
  await createDialog.getByRole('button', { name: 'Done' }).click();
  await expect(createDialog).toBeHidden();

  const created = mock.requests.find((r) => r.method === 'POST' && r.path.endsWith('/sources'));
  expect(created?.body).toMatchObject({ name: 'mobile-sdk', type: 'server' });

  // --- Rotate: use the per-row "Rotate key" action → confirm → new one-time key. ---
  await page.getByRole('button', { name: 'Rotate key' }).click();
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog.getByRole('heading', { name: 'Rotate API key?' })).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Rotate key' }).click();

  const rotateDialog = page.getByRole('dialog');
  await expect(rotateDialog.getByText(/cdp_live_ROTATED/)).toBeVisible();
  await rotateDialog.getByRole('checkbox').check();
  await rotateDialog.getByRole('button', { name: 'Done' }).click();
  await expect(rotateDialog).toBeHidden();

  const rotated = mock.requests.find(
    (r) => r.method === 'POST' && r.path.endsWith(`/sources/${sourceId}/rotate-key`),
  );
  expect(rotated).toBeTruthy();
});
