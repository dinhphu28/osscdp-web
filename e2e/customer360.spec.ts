import { test, expect } from '@playwright/test';
import { installMockApi, connect, TEST_TENANT } from './support';

/**
 * Customer 360: open a seeded profile directly, verify masked traits + computed
 * attributes render, drive a consent change (PUT .../consent), then exercise the
 * GDPR delete/anonymize flow (typed confirmation → DELETE → back to search).
 * Exercises the real UI against the mocked admin API. See docs/08-testing-and-quality.md.
 */
test('customer 360: overview, consent write, gdpr delete', async ({ page }) => {
  const mock = await installMockApi(page, {
    profile: {
      canonical_user_id: 'customer_e2e_1',
      identity_cluster_id: 'c1',
      traits: { email: 'e***@x.com', name: 'N***' },
      computed_attributes: { total_events: 42 },
      first_seen_at: '2026-06-01T00:00:00Z',
      last_seen_at: '2026-07-04T00:00:00Z',
      version: 5,
    },
  });

  // 1. Connect (SUPER_ADMIN → holds pii:read, consent:write, profile:delete).
  await connect(page, mock);

  // 2. Navigate straight to the customer detail.
  await page.goto(`/t/${TEST_TENANT}/profiles/customer_e2e_1`);
  await expect(page.getByRole('heading', { name: 'Customer 360' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();

  // 3. Overview tab (default): a masked trait and a computed attribute render.
  await expect(page.getByText('e***@x.com', { exact: true })).toBeVisible();
  await expect(page.getByText('N***', { exact: true })).toBeVisible();
  await expect(page.getByText('42', { exact: true })).toBeVisible(); // computed total_events

  // 4. Consent tab: drive one channel×purpose cell change → PUT .../consent.
  await page.getByRole('tab', { name: 'Consent' }).click();
  // Seeded consent is empty so every cell defaults to "unknown"; the first
  // Select is email × marketing. Change it to "granted".
  const firstCell = page.getByRole('combobox').first();
  await expect(firstCell).toBeVisible();
  await firstCell.click();
  // The cell Select is wrapped in an interactive MUI Tooltip whose popper can
  // overlay the open menu; force the option click past the interception check.
  await page.getByRole('option', { name: 'granted', exact: true }).click({ force: true });

  await expect
    .poll(() =>
      mock.requests.some((r) => r.method === 'PUT' && /\/profiles\/[^/]+\/consent$/.test(r.path)),
    )
    .toBe(true);
  const consentReq = mock.requests.find(
    (r) => r.method === 'PUT' && /\/profiles\/[^/]+\/consent$/.test(r.path),
  );
  expect(consentReq?.body).toMatchObject({
    channel: 'email',
    purpose: 'marketing',
    status: 'granted',
  });

  // 5. GDPR tab: delete/anonymize with typed confirmation.
  await page.getByRole('tab', { name: 'GDPR' }).click();
  await page.getByRole('button', { name: 'Delete / anonymize customer' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Confirm button stays disabled until the exact canonical_user_id is typed.
  const confirmBtn = dialog.getByRole('button', { name: 'Delete customer' });
  await expect(confirmBtn).toBeDisabled();
  await dialog.getByLabel('Confirmation').fill('customer_e2e_1');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  // Navigates back to the search screen and a DELETE fired.
  await expect(page).toHaveURL(new RegExp(`/t/${TEST_TENANT}/profiles$`));
  const deleteReq = mock.requests.find(
    (r) => r.method === 'DELETE' && /\/profiles\/customer_e2e_1$/.test(r.path),
  );
  expect(deleteReq).toBeTruthy();
});
