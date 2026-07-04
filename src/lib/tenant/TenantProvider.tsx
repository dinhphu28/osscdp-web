import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface TenantContextValue {
  tenantId: string;
}

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Provides the current {tenantID} (from the /t/:tenantId route param) to all
 * child features and the query-key factory. See docs/03-architecture.md §3.
 */
export function TenantProvider({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const value = useMemo(() => ({ tenantId }), [tenantId]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within <TenantProvider>');
  return ctx;
}
