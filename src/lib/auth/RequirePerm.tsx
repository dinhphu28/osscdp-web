import { cloneElement, type ReactElement } from 'react';
import { Tooltip } from '@mui/material';
import type { Permission } from '@/types';
import { useAuth } from './AuthProvider';

interface RequirePermProps {
  perm: Permission;
  children: ReactElement<{ disabled?: boolean }>;
  /**
   * 'hide' (default) removes the element when not permitted.
   * 'disable' renders the child disabled with an explanatory tooltip
   * (child must accept a `disabled` prop, e.g. a Button).
   */
  mode?: 'hide' | 'disable';
}

/**
 * Client-side permission gate. UX only — the backend still enforces via 403.
 * See docs/05-auth-rbac-tenancy.md.
 */
export function RequirePerm({ perm, children, mode = 'hide' }: RequirePermProps) {
  const { can } = useAuth();
  if (can(perm)) return children;
  if (mode === 'hide') return null;

  return (
    <Tooltip title={`Requires ${perm}`}>
      {/* span keeps the tooltip working on a disabled child */}
      <span>{cloneElement(children, { disabled: true })}</span>
    </Tooltip>
  );
}
