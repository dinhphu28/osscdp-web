import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Button } from '@mui/material';
import { RequirePerm } from './RequirePerm';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('RequirePerm', () => {
  it('renders the child when the role holds the permission', () => {
    renderWithProviders(
      <RequirePerm perm="segment:write">
        <Button>Create</Button>
      </RequirePerm>,
      { role: 'MARKETER' }, // MARKETER has segment:write
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('hides the child when the role lacks the permission (hide mode)', () => {
    renderWithProviders(
      <RequirePerm perm="segment:write">
        <Button>Create</Button>
      </RequirePerm>,
      { role: 'VIEWER' }, // read-only
    );
    expect(screen.queryByRole('button', { name: 'Create' })).not.toBeInTheDocument();
  });

  it('renders the child disabled when lacking the permission (disable mode)', () => {
    renderWithProviders(
      <RequirePerm perm="segment:write" mode="disable">
        <Button>Create</Button>
      </RequirePerm>,
      { role: 'VIEWER' },
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });
});
