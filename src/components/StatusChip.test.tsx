import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { StatusChip } from './StatusChip';
import { renderWithProviders } from '@/test/renderWithProviders';

function chipRoot(label: string): HTMLElement {
  const root = screen.getByText(label).closest('.MuiChip-root');
  expect(root).not.toBeNull();
  return root as HTMLElement;
}

describe('StatusChip', () => {
  it('renders the status text as the chip label', () => {
    renderWithProviders(<StatusChip status="active" />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it.each(['active', 'granted', 'succeeded'])('maps %s to the success color', (status) => {
    renderWithProviders(<StatusChip status={status} />);
    expect(chipRoot(status).className).toContain('MuiChip-colorSuccess');
  });

  it.each(['denied', 'failed_permanent', 'dlq'])('maps %s to the error color', (status) => {
    renderWithProviders(<StatusChip status={status} />);
    expect(chipRoot(status).className).toContain('MuiChip-colorError');
  });

  it.each(['pending', 'open'])('maps %s to the warning color', (status) => {
    renderWithProviders(<StatusChip status={status} />);
    expect(chipRoot(status).className).toContain('MuiChip-colorWarning');
  });

  it('renders an unknown status as an outlined default chip', () => {
    renderWithProviders(<StatusChip status="not_a_real_status" />);
    const root = chipRoot('not_a_real_status');
    expect(root.className).toContain('MuiChip-outlined');
    expect(root.className).toContain('MuiChip-colorDefault');
    expect(root.className).not.toContain('MuiChip-colorSuccess');
    expect(root.className).not.toContain('MuiChip-colorError');
    expect(root.className).not.toContain('MuiChip-colorWarning');
  });
});
