import { test, expect } from '@playwright/test';
import { installMockApi, connect } from './support';

/**
 * DLQ triage: list dead-lettered events, inspect one, retry (republish) and
 * discard it. Retry/Discard live in the right-side detail Drawer that opens when
 * a row is clicked; Discard additionally requires confirming a ConfirmDialog.
 * Exercises the real UI against the mocked admin API. See docs/screens/08-dlq-admin.md.
 */
test('DLQ triage: list, retry, discard', async ({ page }) => {
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
        original_payload: { foo: 'bar' },
      },
    ],
  });

  // 1. Connect → Dashboard (default SUPER_ADMIN role can dlq:retry).
  await connect(page);

  // 2. Navigate to DLQ.
  await page.getByRole('link', { name: 'DLQ' }).click();
  await expect(page.getByRole('heading', { name: 'DLQ' })).toBeVisible();

  // 3. Row for dlq-1 renders (component + error code cells).
  await expect(page.getByRole('gridcell', { name: 'identity' })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'internal_error' })).toBeVisible();

  // 4. Open the detail Drawer for the row, then Retry.
  await page.getByRole('gridcell', { name: 'identity' }).click();
  await expect(page.getByRole('heading', { name: 'DLQ event' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();

  // Retrying closes the drawer and shows a success snackbar.
  await expect(page.getByText(/Event republished/)).toBeVisible();
  const retried = mock.requests.find(
    (r) => r.method === 'POST' && r.path.endsWith('/dlq/dlq-1/retry'),
  );
  expect(retried).toBeTruthy();

  // 5. Re-open the drawer and Discard, confirming the ConfirmDialog.
  await page.getByRole('gridcell', { name: 'identity' }).click();
  await expect(page.getByRole('heading', { name: 'DLQ event' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();

  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText('Discard this event?')).toBeVisible();
  await confirm.getByRole('button', { name: 'Discard' }).click();

  // Discarding shows a success snackbar and fires the POST.
  await expect(page.getByText(/Event discarded/)).toBeVisible();
  const discarded = mock.requests.find(
    (r) => r.method === 'POST' && r.path.endsWith('/dlq/dlq-1/discard'),
  );
  expect(discarded).toBeTruthy();
});
