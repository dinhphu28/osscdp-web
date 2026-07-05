import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { ConnectScreen } from './ConnectScreen';
import { renderWithProviders } from '@/test/renderWithProviders';
import { server } from '@/test/msw/server';
import { BASE } from '@/test/msw/handlers';
import { tokenStore } from '@/lib/auth/tokenStore';

describe('ConnectScreen', () => {
  it('resolves the role via whoami on connect', async () => {
    const { user } = renderWithProviders(<ConnectScreen />, { route: '/connect' });

    await user.type(screen.getByLabelText('Admin token'), 'cdpadm_secret');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(tokenStore.getRole()).toBe('SUPER_ADMIN'));
  });

  it('falls back to a manual role picker when the backend has no /whoami (404)', async () => {
    server.use(http.get(`${BASE}/admin/v1/whoami`, () => new HttpResponse(null, { status: 404 })));

    const { user } = renderWithProviders(<ConnectScreen />, { route: '/connect' });

    await user.type(screen.getByLabelText('Admin token'), 'cdpadm_secret');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByLabelText(/Role \(declared/)).toBeInTheDocument();
    expect(await screen.findByText(/no \/whoami endpoint/)).toBeInTheDocument();
  });

  it('shows a validation error when the token is empty', async () => {
    const { user } = renderWithProviders(<ConnectScreen />, { route: '/connect' });

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('Admin token is required')).toBeInTheDocument();
  });
});
