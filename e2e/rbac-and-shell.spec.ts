import { test, expect } from '@playwright/test';
import { installMockApi, connect } from './support';

/**
 * RBAC gating + app-shell behaviors. Exercises the real UI against the mocked
 * admin API: role-scoped nav/actions (VIEWER) and shell controls (role chip,
 * theme toggle, disconnect) for a SUPER_ADMIN.
 *
 * Note: the theme + disconnect controls are icon-only IconButtons wrapped in
 * MUI Tooltips (no explicit aria-label), so we target them by their MUI icon
 * data-testid, which is stable and unambiguous.
 */

test('VIEWER: read-only gating on nav and source actions', async ({ page }) => {
  await installMockApi(page);
  await connect(page, { role: 'VIEWER' });

  // Dashboard shows the role chip for the connected VIEWER.
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('VIEWER', { exact: true })).toBeVisible();

  // Administration nav needs admin:write → not rendered for VIEWER.
  await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);

  // Sources is read-only for VIEWER (has source:read, lacks source:write).
  await page.getByRole('link', { name: 'Sources' }).click();
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();

  // The read-only info Alert appears (distinct from the always-present backend-gap warning).
  await expect(page.getByText(/read-only for sources/)).toBeVisible();

  // The create action is gated off.
  await expect(page.getByRole('button', { name: 'Create source' })).toBeDisabled();
});

test('shell: role chip, theme toggle, disconnect (SUPER_ADMIN)', async ({ page }) => {
  await installMockApi(page);
  await connect(page); // SUPER_ADMIN

  // Role chip + admin-only nav are present for a SUPER_ADMIN.
  await expect(page.getByText('SUPER_ADMIN', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();

  // Theme toggle: starts in light mode (shows the "switch to dark" icon), and
  // after clicking flips to the "switch to light" icon — proving the toggle ran.
  const themeButton = page.locator('button:has([data-testid="DarkModeOutlinedIcon"])');
  await expect(themeButton).toBeVisible();
  await themeButton.click();
  await expect(page.locator('button:has([data-testid="LightModeOutlinedIcon"])')).toBeVisible();

  // Disconnect (logout) → clears token and returns to /connect.
  await page.locator('button:has([data-testid="LogoutOutlinedIcon"])').click();
  await expect(page).toHaveURL(/\/connect/);
});
