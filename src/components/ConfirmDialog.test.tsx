import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('ConfirmDialog', () => {
  it('enables confirm without a phrase and wires the callbacks', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <ConfirmDialog
        open
        title="Delete segment"
        message="Are you sure?"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gates confirm behind the exact confirmation phrase', async () => {
    const onConfirm = vi.fn();
    const { user } = renderWithProviders(
      <ConfirmDialog
        open
        title="Delete customer"
        message="This is irreversible."
        confirmPhrase="customer_x"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();

    const field = screen.getByRole('textbox', { name: 'Confirmation' });
    await user.type(field, 'wrong');
    expect(confirm).toBeDisabled();

    await user.clear(field);
    await user.type(field, 'customer_x');
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while loading', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete segment"
        message="Are you sure?"
        loading
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
