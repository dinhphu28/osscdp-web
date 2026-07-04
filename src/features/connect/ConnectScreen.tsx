import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import {
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

const schema = z.object({
  baseUrl: z.string().url('Enter a valid URL, e.g. http://localhost:8080'),
  token: z.string().min(1, 'Admin token is required'),
  role: z.enum(ADMIN_ROLES as [AdminRole, ...AdminRole[]]),
  tenantId: z.string().trim().optional(),
});

type ConnectForm = z.infer<typeof schema>;

/**
 * Token entry — NOT a login form. The backend is token-only (no user accounts).
 * Because there is no admin `whoami` endpoint, the operator declares their role
 * so the console can gate the UI. See docs/screens/01-connect-and-shell.md.
 */
export function ConnectScreen() {
  const { connect } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ConnectForm>({
    resolver: zodResolver(schema),
    defaultValues: { baseUrl: DEFAULT_BASE_URL, token: '', role: 'SUPER_ADMIN', tenantId: '' },
  });

  const onSubmit = (values: ConnectForm) => {
    connect({ token: values.token.trim(), role: values.role, baseUrl: values.baseUrl.trim() });
    const tenantId = values.tenantId?.trim();
    navigate(tenantId ? `/t/${tenantId}/dashboard` : '/select-tenant', { replace: true });
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
            is stored in this browser tab only and sent as an <code>Authorization</code> header.
          </Typography>

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
              <TextField
                label="Role (declared — used to gate the UI)"
                select
                defaultValue="SUPER_ADMIN"
                {...register('role')}
                error={!!errors.role}
                helperText={errors.role?.message ?? 'The backend has no whoami; declare your role.'}
              >
                {ADMIN_ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Tenant ID (optional)"
                placeholder="UUID — leave blank to choose next"
                {...register('tenantId')}
                helperText="Non-super tokens are pinned to one tenant; super-admin can switch."
              />
              <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
                Connect
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
