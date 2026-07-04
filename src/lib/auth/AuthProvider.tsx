import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { AdminRole, Permission } from '@/types';
import { tokenStore } from './tokenStore';
import { hasPermission, isSuperAdmin } from './permissions';

interface AuthContextValue {
  token: string | null;
  role: AdminRole | null;
  baseUrl: string;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  can: (perm: Permission) => boolean;
  connect: (input: { token: string; role: AdminRole | null; baseUrl?: string }) => void;
  disconnect: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Token-only auth. No login/session/JWT — the console holds a pasted admin
 * Bearer token and a client-declared role (there is no whoami endpoint).
 * See docs/05-auth-rbac-tenancy.md.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, tokenStore.get);

  const connect = useCallback(
    (input: { token: string; role: AdminRole | null; baseUrl?: string }) => tokenStore.set(input),
    [],
  );
  const disconnect = useCallback(() => tokenStore.clear(), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: snapshot.token,
      role: snapshot.role,
      baseUrl: snapshot.baseUrl,
      isAuthenticated: !!snapshot.token,
      isSuperAdmin: isSuperAdmin(snapshot.role),
      can: (perm: Permission) => hasPermission(snapshot.role, perm),
      connect,
      disconnect,
    }),
    [snapshot, connect, disconnect],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
