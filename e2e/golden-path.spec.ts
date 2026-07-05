import { test, expect } from '@playwright/test';
import { installMockApi, connect, TEST_TENANT } from './support';

/**
 * Golden path: connect → dashboard → create a source (one-time key) → look up a
 * customer → create a webhook destination. Exercises the real UI against the
 * mocked admin API. See docs/08-testing-and-quality.md.
 */
test('golden path: connect, source, profile lookup, destination', async ({ page }) => {
  const mock = await installMockApi(page, {
    dlqEvents: [
      {
        id: 'dlq-1',
        event_id: 'evt-1',
        component: 'identity',
        error_code: 'internal_error',
        error_message: 'boom',
        retry_count: 1,
        status: 'open',
        failed_at: '2026-07-04T00:00:00Z',
        original_payload: {},
      },
    ],
    profiles: [
      {
        canonical_user_id: 'customer_e2e_1',
        identity_cluster_id: 'cluster-1',
        last_seen_at: '2026-07-01T00:00:00Z',
      },
    ],
  });

  // 1. Connect → Dashboard
  await connect(page, mock);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('OK', { exact: true })).toBeVisible(); // health chip loaded

  // 2. Sources → create → one-time key dialog
  await page.getByRole('link', { name: 'Sources' }).click();
  await expect(page.getByRole('heading', { name: 'Sources', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Name' }).fill('web-tracker');
  await page.getByRole('button', { name: 'Create source' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/cdp_live_E2ETESTKEY/)).toBeVisible();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // verify the create request carried the form values
  const created = mock.requests.find((r) => r.method === 'POST' && r.path.endsWith('/sources'));
  expect(created?.body).toMatchObject({ name: 'web-tracker', type: 'server' });

  // 3. Profiles → search → open detail
  await page.getByRole('link', { name: 'Profiles' }).click();
  await page.getByPlaceholder('name@example.com').fill('a@b.com');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByText('customer_e2e_1').click();
  await expect(page).toHaveURL(new RegExp(`/t/${TEST_TENANT}/profiles/customer_e2e_1`));
  await expect(page.getByRole('tab', { name: 'Consent' })).toBeVisible();

  // 4. Destinations → create webhook → lands on detail
  await page.getByRole('link', { name: 'Destinations' }).click();
  await expect(page.getByRole('heading', { name: 'Destinations', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Name' }).fill('crm-webhook');
  await page.getByRole('textbox', { name: 'URL' }).fill('https://example.test/hook');
  await page.getByRole('button', { name: 'Create destination' }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${TEST_TENANT}/destinations/dst-e2e-1`));
});
