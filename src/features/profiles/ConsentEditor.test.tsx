import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { ConsentEditor } from './ConsentEditor';
import { renderWithProviders, TEST_TENANT } from '@/test/renderWithProviders';
import { server } from '@/test/msw/server';
import { BASE } from '@/test/msw/handlers';

const CUID = 'cuid-abc-123';

describe('ConsentEditor', () => {
  it('PUTs the changed cell (email × marketing) when canWrite is true', async () => {
    let captured: unknown = null;
    server.use(
      http.put(`${BASE}/admin/v1/tenants/:tenantID/profiles/:cuid/consent`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ status: 'ok' });
      }),
    );

    const { user } = renderWithProviders(
      <ConsentEditor tenantId={TEST_TENANT} canonicalUserId={CUID} canWrite />,
      { role: 'SUPER_ADMIN' },
    );

    // All cells default to 'unknown' Selects (5 channels × 4 purposes = 20).
    const selects = await screen.findAllByRole('combobox');
    expect(selects).toHaveLength(20);

    // First cell = CHANNELS[0] (email) × PURPOSES[0] (marketing).
    await user.click(selects[0]);
    await user.click(await screen.findByRole('option', { name: 'granted' }));

    await waitFor(() => {
      expect(captured).toEqual({
        channel: 'email',
        purpose: 'marketing',
        status: 'granted',
        source: 'admin_console',
      });
    });
  });

  it('renders read-only StatusChips and a note when canWrite is false', async () => {
    renderWithProviders(
      <ConsentEditor tenantId={TEST_TENANT} canonicalUserId={CUID} canWrite={false} />,
      { role: 'SUPER_ADMIN' },
    );

    expect(await screen.findByText(/Editing consent requires/i)).toBeInTheDocument();
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });
});
