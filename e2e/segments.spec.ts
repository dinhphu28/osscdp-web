import { test, expect } from '@playwright/test';
import { installMockApi, connect, TEST_TENANT } from './support';

/**
 * Segments: connect → Segments → new-segment editor → drive the RuleBuilder to a
 * valid single-leaf rule → create. Exercises the real UI against the mocked admin
 * API (POST .../segments returns id seg-e2e-1). See docs/screens/06-segments-and-rule-builder.md.
 *
 * The default leaf has an empty `field` (invalid), so we first assert the
 * validation error surfaces, then pick a concrete field + value and create.
 */
test('segments: build a rule and create a segment', async ({ page }) => {
  const mock = await installMockApi(page);

  // 1. Connect → Dashboard, then navigate to Segments.
  await connect(page, mock);
  await page.getByRole('link', { name: 'Segments' }).click();
  await expect(page.getByRole('heading', { name: 'Segments', exact: true })).toBeVisible();

  // 2. Open the new-segment editor via the "Create segment" action (a RouterLink).
  await page.getByRole('link', { name: 'Create segment' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/t/${TEST_TENANT}/segments/new`));
  await expect(page.getByRole('heading', { name: 'New segment' })).toBeVisible();

  // 3. Fill the segment name (required by the meta form).
  await page.getByLabel('Name').fill('e2e-segment');

  // 4. Submitting now still fails because the default leaf has an empty field.
  //    Assert the rule validation error surfaces (leafSchema: field min length 1).
  await page.getByRole('button', { name: 'Create segment' }).click();
  await expect(page.getByText('Every condition needs a field', { exact: true })).toBeVisible();
  // Nothing should have been POSTed yet.
  expect(
    mock.requests.find((r) => r.method === 'POST' && r.path.endsWith('/segments')),
  ).toBeUndefined();

  // 5. Drive the RuleBuilder leaf to a valid, non-wildcard single comparison:
  //    field = profile.canonical_user_id, op = eq (default), value = customer_e2e.
  await page.getByLabel('Field').click();
  await page.getByRole('option', { name: 'profile.canonical_user_id', exact: true }).click();
  await page.getByLabel('Value').fill('customer_e2e');

  // 6. Create → navigates to the returned segment's detail (seg-e2e-1).
  await page.getByRole('button', { name: 'Create segment' }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${TEST_TENANT}/segments/seg-e2e-1`));

  // 7. The POST body must carry the name and the built rule object.
  const created = mock.requests.find((r) => r.method === 'POST' && r.path.endsWith('/segments'));
  expect(created?.body).toMatchObject({
    name: 'e2e-segment',
    rule: {
      operator: 'and',
      conditions: [{ field: 'profile.canonical_user_id', op: 'eq', value: 'customer_e2e' }],
    },
  });
});
