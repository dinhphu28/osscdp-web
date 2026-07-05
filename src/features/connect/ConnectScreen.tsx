import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AdminRole } from '@/types';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ADMIN_ROLES } from '@/lib/auth/permissions';
import { DEFAULT_BASE_URL } from '@/lib/auth/tokenStore';
import { getAdminV1Whoami } from '@/lib/api/generated/admin/admin';

const schema = z.object({
  baseUrl: z.string().url('Enter a valid URL, e.g. http://localhost:8080'),
  token: z.string().min(1, 'Admin token is required'),
});

type ConnectForm = z.infer<typeof schema>;

/**
 * Token entry — NOT a login form. The backend is token-only (no user accounts).
 * On connect we call GET /admin/v1/whoami to resolve the token's role + pinned
 * tenant (no more client-declared role). If the backend lacks whoami (404), we
 * fall back to a manual role picker. See docs/screens/01-connect-and-shell.md.
 */
export function ConnectScreen() {
  const { connect } = useAuth();
  const navigate = useNavigate();

  const [fallback, setFallback] = useState(false);
  const [fallbackRole, setFallbackRole] = useState<AdminRole>('SUPER_ADMIN');
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConnectForm>({
    resolver: zodResolver(schema),
    defaultValues: { baseUrl: DEFAULT_BASE_URL, token: '' },
  });

  const onSubmit = async (values: ConnectForm) => {
    setError(null);
    const token = values.token.trim();
    const baseUrl = values.baseUrl.trim();

    // Fallback path: older backend without /whoami — trust the declared role.
    if (fallback) {
      connect({ token, role: fallbackRole, baseUrl, tenantId: null });
      navigate('/select-tenant', { replace: true });
      return;
    }

    // Set the token first so the interceptor authenticates the whoami call.
    connect({ token, role: null, baseUrl });
    try {
      const me = await getAdminV1Whoami();
      const role = (me.role as AdminRole | undefined) ?? null;
      const tenantId = me.tenant_id ?? null;
      connect({ token, role, baseUrl, tenantId });
      navigate(tenantId ? `/t/${tenantId}/dashboard` : '/select-tenant', { replace: true });
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        setFallback(true);
        setError('This backend has no /whoami endpoint — select your role manually to continue.');
      } else if (status === 401) {
        // The response interceptor already cleared the rejected token.
        setError('That token was rejected (401). Check the token and base URL, then try again.');
      } else {
        setError('Could not reach the API to verify the token. Check the base URL and try again.');
      }
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ width: 460, maxWidth: '100%' }} variant="outlined">
        <CardContent>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Connect to osscdp
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Paste an admin Bearer token. There is no login — the backend is token-only. Your token
            is stored in this browser tab only and sent as an <code>Authorization</code> header;
            your role is detected automatically.
          </Typography>

          {error && (
            <Alert severity={fallback ? 'warning' : 'error'} sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Stack spacing={2.5}>
              <TextField
                label="API base URL"
                {...register('baseUrl')}
                error={!!errors.baseUrl}
                helperText={errors.baseUrl?.message ?? 'Dev: http://localhost:8080 · docker: 18080'}
              />
              <TextField
                label="Admin token"
                type="password"
                placeholder="cdpadm_… or your bootstrap ADMIN_API_TOKEN"
                {...register('token')}
                error={!!errors.token}
                helperText={errors.token?.message}
              />
              {fallback && (
                <TextField
                  label="Role (declared — this backend has no whoami)"
                  select
                  value={fallbackRole}
                  onChange={(e) => setFallbackRole(e.target.value as AdminRole)}
                  helperText="Pick the role your token was minted with."
                >
                  {ADMIN_ROLES.map((r) => (
                    <MenuItem key={r} value={r}>
                      {r}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
                {fallback ? 'Continue' : 'Connect'}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
