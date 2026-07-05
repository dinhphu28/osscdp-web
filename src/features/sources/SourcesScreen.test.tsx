import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { SourcesScreen } from './SourcesScreen';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('SourcesScreen', () => {
  it('creates a source and reveals the one-time ingest key', async () => {
    const { user } = renderWithProviders(<SourcesScreen />, { role: 'SUPER_ADMIN' });

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Web server');
    await user.click(screen.getByRole('button', { name: 'Create source' }));

    expect(await screen.findByText(/cdp_live_TESTKEY/)).toBeInTheDocument();
  });

  it('shows a validation error and no dialog when the name is empty', async () => {
    const { user } = renderWithProviders(<SourcesScreen />, { role: 'SUPER_ADMIN' });

    await user.click(screen.getByRole('button', { name: 'Create source' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/cdp_live_TESTKEY/)).not.toBeInTheDocument();
    });
  });

  it('gates writes for read-only roles', () => {
    renderWithProviders(<SourcesScreen />, { role: 'VIEWER' });

    expect(screen.getByText(/read-only for sources/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create source' })).toBeDisabled();
  });
});
