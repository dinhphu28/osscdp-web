import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '@/lib/auth/AuthProvider';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { StatusChip } from '@/components/StatusChip';
import { useGetAdminV1Tenants } from '@/lib/api/generated/tenants-sources/tenants-sources';

/**
 * Tenant selection. Super-admins get a real, clickable tenant list from
 * GET /admin/v1/tenants; a manual UUID entry remains as a fallback. Non-super
 * tokens are pinned server-side (and normally auto-routed past this screen by
 * whoami). See docs/screens/01-connect-and-shell.md.
 */
export function SelectTenantScreen() {
  const { isSuperAdmin } = useAuth();
  const [tenantId, setTenantId] = useState('');
  const navigate = useNavigate();

  const open = (id: string) => {
    const trimmed = id.trim();
    if (trimmed) navigate(`/t/${trimmed}/dashboard`);
  };

  const tenantsQuery = useGetAdminV1Tenants({ query: { enabled: isSuperAdmin } });
  const tenants = tenantsQuery.data?.tenants ?? [];

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 520, maxWidth: '100%' }} variant="outlined">
        <CardContent>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Choose a tenant
          </Typography>

          {!isSuperAdmin && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Your token is scoped to one tenant. Enter its ID; other tenants return 403.
            </Alert>
          )}

          {isSuperAdmin && (
            <Box sx={{ mb: 2 }}>
              {tenantsQuery.isLoading ? (
                <Stack alignItems="center" sx={{ py: 3 }}>
                  <CircularProgress />
                </Stack>
              ) : tenantsQuery.isError ? (
                <ErrorState
                  message="Failed to load tenants."
                  onRetry={() => tenantsQuery.refetch()}
                />
              ) : tenants.length === 0 ? (
                <EmptyState
                  title="No tenants yet"
                  description="Create one from Administration, then it will appear here."
                />
              ) : (
                <List disablePadding sx={{ maxHeight: 320, overflow: 'auto' }}>
                  {tenants.map((t) => (
                    <ListItemButton key={t.id} divider onClick={() => open(t.id ?? '')}>
                      <ListItemText
                        primary={t.name ?? '(unnamed)'}
                        secondary={t.id}
                        slotProps={{ secondary: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
                      />
                      {t.status && <StatusChip status={t.status} />}
                    </ListItemButton>
                  ))}
                </List>
              )}
              <Divider sx={{ my: 2 }}>or enter an ID</Divider>
            </Box>
          )}

          <Stack spacing={2.5}>
            <TextField
              label="Tenant ID (UUID)"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && open(tenantId)}
              autoFocus={!isSuperAdmin}
            />
            <Button
              variant="contained"
              size="large"
              onClick={() => open(tenantId)}
              disabled={!tenantId.trim()}
            >
              Open tenant
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
