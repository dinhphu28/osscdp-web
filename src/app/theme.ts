import { createTheme, type Theme } from '@mui/material/styles';

export type ColorMode = 'light' | 'dark';

/**
 * MUI theme builder for the data-dense admin console. Compact density and
 * consistent surfaces suit tables/forms. See docs/06-design-system.md.
 */
export function buildTheme(mode: ColorMode): Theme {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#3b5bdb' },
      secondary: { main: '#7048e8' },
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", system-ui, sans-serif',
      fontSize: 14,
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
      MuiPaper: { defaultProps: { variant: 'outlined' } },
    },
  });
}

export const COLOR_MODE_KEY = 'osscdp.colorMode';
