import type { AdminRole } from '@/types';

/**
 * Module-level auth store so the Axios interceptor can read the token/base URL
 * OUTSIDE React. AuthProvider mirrors this into React state for rendering.
 *
 * Persistence: sessionStorage (cleared when the tab closes) — a deliberate
 * trade-off. The token never goes in a cookie (backend AllowCredentials: false).
 * See docs/05-auth-rbac-tenancy.md.
 */

const TOKEN_KEY = 'osscdp.token';
const ROLE_KEY = 'osscdp.role';
const BASE_URL_KEY = 'osscdp.baseUrl';

export const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export interface AuthSnapshot {
  token: string | null;
  role: AdminRole | null;
  baseUrl: string;
}

function read(): AuthSnapshot {
  const store = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined;
  return {
    token: store?.getItem(TOKEN_KEY) ?? null,
    role: (store?.getItem(ROLE_KEY) as AdminRole | null) ?? null,
    baseUrl: store?.getItem(BASE_URL_KEY) ?? DEFAULT_BASE_URL,
  };
}

let snapshot: AuthSnapshot = read();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const tokenStore = {
  getToken: () => snapshot.token,
  getRole: () => snapshot.role,
  getBaseUrl: () => snapshot.baseUrl,
  get: (): AuthSnapshot => snapshot,

  set(next: { token: string; role: AdminRole | null; baseUrl?: string }) {
    snapshot = {
      token: next.token,
      role: next.role,
      baseUrl: next.baseUrl ?? snapshot.baseUrl,
    };
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TOKEN_KEY, snapshot.token ?? '');
      if (snapshot.role) sessionStorage.setItem(ROLE_KEY, snapshot.role);
      else sessionStorage.removeItem(ROLE_KEY);
      sessionStorage.setItem(BASE_URL_KEY, snapshot.baseUrl);
    }
    emit();
  },

  clear() {
    snapshot = { token: null, role: null, baseUrl: snapshot.baseUrl };
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(ROLE_KEY);
    }
    emit();
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
