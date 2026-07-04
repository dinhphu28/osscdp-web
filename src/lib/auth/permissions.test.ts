import { describe, expect, it } from 'vitest';
import { hasPermission, isSuperAdmin } from './permissions';

describe('RBAC role → permission table', () => {
  it('grants all permissions to SUPER_ADMIN', () => {
    expect(hasPermission('SUPER_ADMIN', 'pii:read')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', 'admin:write')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', 'profile:delete')).toBe(true);
  });

  it('restricts VIEWER to read-only', () => {
    expect(hasPermission('VIEWER', 'segment:read')).toBe(true);
    expect(hasPermission('VIEWER', 'segment:write')).toBe(false);
    expect(hasPermission('VIEWER', 'pii:read')).toBe(false);
  });

  it('gives MARKETER segment/destination/consent write but not admin', () => {
    expect(hasPermission('MARKETER', 'segment:write')).toBe(true);
    expect(hasPermission('MARKETER', 'destination:write')).toBe(true);
    expect(hasPermission('MARKETER', 'consent:write')).toBe(true);
    expect(hasPermission('MARKETER', 'admin:write')).toBe(false);
  });

  it('gives OPERATOR dlq:retry and event:replay but not writes', () => {
    expect(hasPermission('OPERATOR', 'dlq:retry')).toBe(true);
    expect(hasPermission('OPERATOR', 'event:replay')).toBe(true);
    expect(hasPermission('OPERATOR', 'segment:write')).toBe(false);
  });

  it('returns false for a null role', () => {
    expect(hasPermission(null, 'event:read')).toBe(false);
  });

  it('identifies SUPER_ADMIN as cross-tenant', () => {
    expect(isSuperAdmin('SUPER_ADMIN')).toBe(true);
    expect(isSuperAdmin('TENANT_ADMIN')).toBe(false);
  });
});
