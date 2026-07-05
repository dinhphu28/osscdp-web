import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { buildTheme } from '@/app/theme';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { TenantProvider } from '@/lib/tenant/TenantProvider';
import { tokenStore } from '@/lib/auth/tokenStore';
import { BASE } from './msw/handlers';
import type { AdminRole } from '@/types';

export const TEST_TENANT = '11111111-1111-1111-1111-111111111111';

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Declared role for RBAC gating (default SUPER_ADMIN = all perms). null = signed-out-ish. */
  role?: AdminRole | null;
  tenantId?: string;
  /** Router: initial URL. */
  route?: string;
  /** Router: when set, `ui` is mounted under <Route path={path}> so useParams() works. */
  path?: string;
  token?: string;
}

/** Seed the module-level auth store BEFORE render so AuthProvider picks it up. */
export function setAuth(role: AdminRole | null = 'SUPER_ADMIN', tenantId: string | null = null) {
  tokenStore.set({ token: 'cdpadm_test', role, baseUrl: BASE, tenantId });
}

/**
 * Render a component inside the app's real providers (QueryClient with retries
 * off, MUI theme, notistack, Auth, Tenant) and a MemoryRouter. Returns the RTL
 * result plus a ready `user` (userEvent) and the test QueryClient.
 * See docs/08-testing-and-quality.md.
 */
export function renderWithProviders(ui: ReactElement, opts: ProviderOptions = {}) {
  const { role = 'SUPER_ADMIN', tenantId = TEST_TENANT, route = '/', path, token, ...rtl } = opts;

  tokenStore.set({ token: token ?? 'cdpadm_test', role, baseUrl: BASE, tenantId: null });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={buildTheme('light')}>
        <SnackbarProvider>
          <AuthProvider>
            <TenantProvider tenantId={tenantId}>
              <MemoryRouter
                initialEntries={[route]}
                future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
              >
                {path ? (
                  <Routes>
                    <Route path={path} element={children} />
                  </Routes>
                ) : (
                  children
                )}
              </MemoryRouter>
            </TenantProvider>
          </AuthProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...rtl }),
  };
}
