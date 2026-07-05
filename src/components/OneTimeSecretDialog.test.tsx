import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { OneTimeSecretDialog } from './OneTimeSecretDialog';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('OneTimeSecretDialog', () => {
  it('renders the title, label and secret when open', () => {
    renderWithProviders(
      <OneTimeSecretDialog
        open
        title="API key created"
        label="Secret key"
        secret="cdpadm_super_secret_value"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'API key created' })).toBeInTheDocument();
    expect(screen.getByText('Secret key')).toBeInTheDocument();
    expect(screen.getByText('cdpadm_super_secret_value')).toBeInTheDocument();
  });

  it('keeps Done disabled until acknowledged, then calls onClose', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <OneTimeSecretDialog
        open
        title="API key created"
        label="Secret key"
        secret="cdpadm_super_secret_value"
        onClose={onClose}
      />,
    );

    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();

    await user.click(
      screen.getByRole('checkbox', {
        name: 'I have copied and stored this value securely',
      }),
    );
    expect(done).toBeEnabled();

    await user.click(done);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render the dialog content when open is false', () => {
    renderWithProviders(
      <OneTimeSecretDialog
        open={false}
        title="API key created"
        label="Secret key"
        secret="cdpadm_super_secret_value"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText('cdpadm_super_secret_value')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
  });
});
