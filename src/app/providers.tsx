import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { queryClient } from '@/lib/query/queryClient';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { buildTheme, COLOR_MODE_KEY, type ColorMode } from './theme';

interface ColorModeContextValue {
  mode: ColorMode;
  toggle: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue>({
  mode: 'light',
  toggle: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useColorMode(): ColorModeContextValue {
  return useContext(ColorModeContext);
}

function readInitialMode(): ColorMode {
  if (typeof localStorage === 'undefined') return 'light';
  return (localStorage.getItem(COLOR_MODE_KEY) as ColorMode) || 'light';
}

/**
 * Provider composition root (outside-in): QueryClient → Theme → Snackbar → Auth.
 * TenantProvider is established per-route at /t/:tenantId (see app/router.tsx).
 * See docs/03-architecture.md §6.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(readInitialMode);
  const theme = useMemo(() => buildTheme(mode), [mode]);

  const colorMode = useMemo<ColorModeContextValue>(
    () => ({
      mode,
      toggle: () =>
        setMode((m) => {
          const next: ColorMode = m === 'light' ? 'dark' : 'light';
          if (typeof localStorage !== 'undefined') localStorage.setItem(COLOR_MODE_KEY, next);
          return next;
        }),
    }),
    [mode],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ColorModeContext.Provider value={colorMode}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
            <AuthProvider>{children}</AuthProvider>
          </SnackbarProvider>
        </ThemeProvider>
      </ColorModeContext.Provider>
    </QueryClientProvider>
  );
}
