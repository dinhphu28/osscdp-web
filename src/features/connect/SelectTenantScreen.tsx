import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Tenant selection. The backend has no confirmed "list tenants" endpoint, so
 * super-admins enter a tenant UUID here. Non-super tokens are pinned to a single
 * tenant server-side (a wrong tenant returns 403). See docs/10-backend-gaps-and-caveats.md.
 */
export function SelectTenantScreen() {
  const { isSuperAdmin } = useAuth();
  const [tenantId, setTenantId] = useState('');
  const navigate = useNavigate();

  const go = () => {
    const id = tenantId.trim();
    if (id) navigate(`/t/${id}/dashboard`);
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: 460, maxWidth: '100%' }} variant="outlined">
        <CardContent>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Choose a tenant
          </Typography>
          {!isSuperAdmin && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Your token is scoped to one tenant. Enter its ID; other tenants return 403.
            </Alert>
          )}
          <Stack spacing={2.5}>
            <TextField
              label="Tenant ID (UUID)"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              autoFocus
              helperText="TBD — a list-tenants endpoint would populate a picker (backend gap)."
            />
            <Button variant="contained" size="large" onClick={go} disabled={!tenantId.trim()}>
              Open tenant
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
