import { test, expect } from '@playwright/test';
import { installMockApi, connect } from './support';

/**
 * Sources: creating a source surfaces the one-time ingest API key dialog, and
 * rotating a key (by ID) confirms then surfaces the new one-time key. Exercises
 * the real UI against the mocked admin API. See docs/screens/03-sources.md.
 */
test('sources: create shows one-time key dialog and rotate-key works', async ({ page }) => {
  const mock = await installMockApi(page);

  // Connect as SUPER_ADMIN (default) → dashboard.
  await connect(page);

  // Navigate to Sources.
  await page.getByRole('link', { name: 'Sources' }).click();
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();

  // --- Create: fill Name, leave Type as its "server" default, submit. ---
  await page.getByLabel('Name').fill('web-tracker');
  await page.getByRole('button', { name: 'Create source' }).click();

  // One-time secret dialog shows the mocked ingest key.
  const createDialog = page.getByRole('dialog');
  await expect(createDialog.getByText(/cdp_live_E2ETESTKEY/)).toBeVisible();
  // Acknowledge (enables Done), then close.
  await createDialog.getByRole('checkbox').check();
  await createDialog.getByRole('button', { name: 'Done' }).click();
  await expect(createDialog).toBeHidden();

  // The POST .../sources request carried the form values (Type defaulted to server).
  const created = mock.requests.find((r) => r.method === 'POST' && r.path.endsWith('/sources'));
  expect(created?.body).toMatchObject({ name: 'web-tracker', type: 'server' });

  // --- Rotate: enter a source ID, confirm, then see the new one-time key. ---
  const sourceId = '22222222-2222-2222-2222-222222222222';
  await page.getByLabel('Source ID (UUID)').fill(sourceId);
  // Card button (there is also a "Rotate key" button inside the confirm dialog).
  await page.getByRole('button', { name: 'Rotate key' }).click();

  // ConfirmDialog — confirm via the "Rotate key" button scoped to the dialog.
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog.getByRole('heading', { name: 'Rotate API key?' })).toBeVisible();
  await confirmDialog.getByRole('button', { name: 'Rotate key' }).click();

  // New one-time key dialog shows the rotated key; dismiss it.
  const rotateDialog = page.getByRole('dialog');
  await expect(rotateDialog.getByText(/cdp_live_ROTATED/)).toBeVisible();
  await rotateDialog.getByRole('checkbox').check();
  await rotateDialog.getByRole('button', { name: 'Done' }).click();
  await expect(rotateDialog).toBeHidden();

  // The rotate-key request hit the right endpoint for the entered source ID.
  const rotated = mock.requests.find(
    (r) => r.method === 'POST' && r.path.endsWith(`/sources/${sourceId}/rotate-key`),
  );
  expect(rotated).toBeTruthy();
});
