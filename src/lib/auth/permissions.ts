import type { AdminRole, Permission } from '@/types';

/**
 * Canonical role → permission table (mirrors backend internal/rbac/roles.go).
 * The admin API has NO whoami endpoint, so the console holds this table
 * client-side to gate UI. Server still enforces via 403 — gating is UX only.
 * Source of truth: docs/05-auth-rbac-tenancy.md.
 */

const READ_SET: Permission[] = [
  'source:read',
  'event:read',
  'profile:read',
  'segment:read',
  'destination:read',
  'activation:read',
  'audit:read',
  'dlq:read',
];

const ALL_PERMISSIONS: Permission[] = [
  ...READ_SET,
  'source:write',
  'event:replay',
  'profile:delete',
  'segment:write',
  'destination:write',
  'dlq:retry',
  'consent:write',
  'pii:read',
  'admin:write',
];

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  TENANT_ADMIN: ALL_PERMISSIONS,
  MARKETER: [...READ_SET, 'segment:write', 'destination:write', 'consent:write'],
  ANALYST: READ_SET,
  OPERATOR: [...READ_SET, 'dlq:retry', 'event:replay'],
  VIEWER: READ_SET,
};

export const ADMIN_ROLES: AdminRole[] = [
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'MARKETER',
  'ANALYST',
  'OPERATOR',
  'VIEWER',
];

/** True if the role grants the permission. Unknown/undefined role → false. */
export function hasPermission(role: AdminRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

/** SUPER_ADMIN is cross-tenant (can switch tenants freely). */
export function isSuperAdmin(role: AdminRole | null | undefined): boolean {
  return role === 'SUPER_ADMIN';
}
