import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { enqueueSnackbar } from 'notistack';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckOutlined';
import { PageHeader } from '@/components/PageHeader';
import { OneTimeSecretDialog } from '@/components/OneTimeSecretDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { CopyButton } from '@/components/CopyButton';
import { StatusChip } from '@/components/StatusChip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type GridColDef } from '@/components/DataTable';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ROLE_PERMISSIONS, ADMIN_ROLES } from '@/lib/auth/permissions';
import { relativeTime } from '@/lib/format/datetime';
import type { Permission } from '@/types';
import {
  usePostAdminV1AdminTokens,
  useGetAdminV1AdminTokens,
  usePostAdminV1AdminTokensTokenIDRevoke,
  getGetAdminV1AdminTokensQueryKey,
} from '@/lib/api/generated/admin-tokens/admin-tokens';
import {
  usePostAdminV1Tenants,
  useGetAdminV1Tenants,
  getGetAdminV1TenantsQueryKey,
} from '@/lib/api/generated/tenants-sources/tenants-sources';
import type { AdminToken, Tenant } from '@/lib/api/generated/model';
import { PostAdminV1AdminTokensBodyRole } from '@/lib/api/generated/model';

/** Canonical, ordered permission vocabulary for the read-only reference matrix. */
const ALL_PERMISSIONS: Permission[] = [
  'source:read',
  'source:write',
  'event:read',
  'event:replay',
  'profile:read',
  'profile:delete',
  'segment:read',
  'segment:write',
  'destination:read',
  'destination:write',
  'activation:read',
  'dlq:read',
  'dlq:retry',
  'audit:read',
  'consent:write',
  'pii:read',
  'admin:write',
];

const SUPER_ROLE = PostAdminV1AdminTokensBodyRole.SUPER_ADMIN;
const NON_SUPER_ROLES = ADMIN_ROLES.filter((r) => r !== 'SUPER_ADMIN');

type SecretState = { label: string; value: string } | null;

/**
 * Administration — access control (mint, list, and revoke admin tokens, plus a
 * role/permission reference) and super-admin tenant onboarding. Tenants are
 * listable (super-admin only).
 */
export function AdministrationScreen() {
  const { can, isSuperAdmin } = useAuth();
  const canWrite = can('admin:write');

  const [secret, setSecret] = useState<SecretState>(null);
  const [newTenant, setNewTenant] = useState<{ id: string; name: string } | null>(null);

  const showSecret = (value: string) => setSecret({ label: 'Admin token', value });

  return (
    <>
      <PageHeader
        title="Administration"
        description="Mint admin tokens, review role scopes, and onboard tenants."
      />

      {!canWrite && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your role is read-only for administration. Minting tokens and creating tenants requires{' '}
          <code>admin:write</code> (held only by <code>SUPER_ADMIN</code> and{' '}
          <code>TENANT_ADMIN</code>).
        </Alert>
      )}

      <MintTokenSection canWrite={canWrite} isSuperAdmin={isSuperAdmin} onMinted={showSecret} />

      <RolePermissionMatrix />

      {isSuperAdmin && (
        <TenantsSection
          canWrite={canWrite}
          newTenant={newTenant}
          setNewTenant={setNewTenant}
          onMinted={showSecret}
        />
      )}

      <OneTimeSecretDialog
        open={!!secret}
        title="Copy this admin token now"
        label={secret?.label ?? 'Admin token'}
        secret={secret?.value ?? ''}
        description="This admin bearer token (prefix cdpadm_) is shown once and cannot be retrieved again. Deliver it securely to its holder."
        onClose={() => setSecret(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Mint admin token
// ---------------------------------------------------------------------------

const mintSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  role: z.nativeEnum(PostAdminV1AdminTokensBodyRole),
  tenant_id: z.string().trim(),
});
type MintForm = z.infer<typeof mintSchema>;

function MintTokenSection({
  canWrite,
  isSuperAdmin,
  onMinted,
}: {
  canWrite: boolean;
  isSuperAdmin: boolean;
  onMinted: (token: string) => void;
}) {
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  const mintMut = usePostAdminV1AdminTokens();

  const roleOptions = isSuperAdmin ? ADMIN_ROLES : NON_SUPER_ROLES;

  const form = useForm<MintForm>({
    resolver: zodResolver(mintSchema),
    defaultValues: {
      name: '',
      role: PostAdminV1AdminTokensBodyRole.VIEWER,
      // SUPER_ADMIN may target any tenant; others are pinned to the current tenant.
      tenant_id: isSuperAdmin ? '' : tenantId,
    },
  });

  const selectedRole = form.watch('role');
  // A SUPER_ADMIN token is cross-tenant (nil tenant); every other role needs a tenant_id.
  const tenantRequired = selectedRole !== SUPER_ROLE;
  const tenantPinned = !isSuperAdmin;

  const onSubmit = async (values: MintForm) => {
    const tenant = tenantPinned ? tenantId : values.tenant_id.trim();
    if (tenantRequired && !tenant) {
      form.setError('tenant_id', { message: 'Tenant ID is required for non-super roles' });
      return;
    }
    try {
      const res = await mintMut.mutateAsync({
        data: {
          name: values.name.trim(),
          role: values.role,
          ...(tenant ? { tenant_id: tenant } : {}),
        },
      });
      if (res.api_token) {
        onMinted(res.api_token);
      }
      await queryClient.invalidateQueries({ queryKey: getGetAdminV1AdminTokensQueryKey() });
      enqueueSnackbar(`Token "${values.name}" minted as ${values.role}`, { variant: 'success' });
      form.reset({
        name: '',
        role: PostAdminV1AdminTokensBodyRole.VIEWER,
        tenant_id: isSuperAdmin ? '' : tenantId,
      });
    } catch {
      enqueueSnackbar('Failed to mint token (check role/tenant scope)', { variant: 'error' });
    }
  };

  return (
    <Box component="section" sx={{ mb: 4 }}>
      <Typography variant="h6" gutterBottom>
        Admin tokens
      </Typography>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Mint token
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The plaintext token is shown once, immediately after minting.
              {!isSuperAdmin &&
                ' As TENANT_ADMIN you can only mint non-super roles for your tenant.'}
            </Typography>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <Stack spacing={2}>
                <TextField
                  label="Name"
                  {...form.register('name')}
                  error={!!form.formState.errors.name}
                  helperText={form.formState.errors.name?.message ?? 'A label for the token holder'}
                  disabled={!canWrite}
                />
                <TextField
                  label="Role"
                  select
                  value={selectedRole}
                  onChange={(e) =>
                    form.setValue('role', e.target.value as MintForm['role'], {
                      shouldValidate: true,
                    })
                  }
                  disabled={!canWrite}
                  error={!!form.formState.errors.role}
                  helperText={form.formState.errors.role?.message}
                >
                  {roleOptions.map((r) => (
                    <MenuItem key={r} value={r}>
                      {r}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Tenant ID"
                  {...form.register('tenant_id')}
                  disabled={!canWrite || tenantPinned}
                  error={!!form.formState.errors.tenant_id}
                  helperText={
                    form.formState.errors.tenant_id?.message ??
                    (tenantPinned
                      ? 'Pinned to your tenant'
                      : tenantRequired
                        ? 'Tenant UUID for this role'
                        : 'Leave blank — SUPER_ADMIN is cross-tenant')
                  }
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!canWrite || mintMut.isPending}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Mint token
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Existing tokens
            </Typography>
            <AdminTokensList canWrite={canWrite} />
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Admin tokens — list + revoke
// ---------------------------------------------------------------------------

function AdminTokensList({ canWrite }: { canWrite: boolean }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const q = useGetAdminV1AdminTokens({ query: { enabled: can('admin:write') } });
  const revokeMut = usePostAdminV1AdminTokensTokenIDRevoke();

  const [pending, setPending] = useState<AdminToken | null>(null);

  const onRevoke = async () => {
    const tokenID = pending?.id;
    if (!tokenID) return;
    try {
      await revokeMut.mutateAsync({ tokenID });
      await queryClient.invalidateQueries({ queryKey: getGetAdminV1AdminTokensQueryKey() });
      enqueueSnackbar(`Token "${pending.name ?? tokenID}" revoked`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to revoke token', { variant: 'error' });
    } finally {
      setPending(null);
    }
  };

  const columns: GridColDef<AdminToken>[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 140 },
    { field: 'role', headerName: 'Role', width: 140 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      sortable: false,
      renderCell: (params) => <StatusChip status={params.row.status ?? ''} />,
    },
    {
      field: 'tenant_id',
      headerName: 'Tenant',
      flex: 1,
      minWidth: 160,
      sortable: false,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }} noWrap>
          {params.row.tenant_id ?? 'all'}
        </Typography>
      ),
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 140,
      renderCell: (params) => relativeTime(params.row.created_at),
    },
    {
      field: 'id',
      headerName: 'ID',
      width: 90,
      sortable: false,
      renderCell: (params) => <CopyButton value={params.row.id ?? ''} title="Copy token ID" />,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Button
          size="small"
          color="error"
          disabled={params.row.status !== 'active' || !can('admin:write')}
          onClick={() => setPending(params.row)}
        >
          Revoke
        </Button>
      ),
    },
  ];

  if (!canWrite) {
    return (
      <EmptyState
        title="Token listing unavailable"
        description="Listing admin tokens requires admin:write. Ask a SUPER_ADMIN or TENANT_ADMIN."
      />
    );
  }

  if (q.isError) {
    return <ErrorState message="Failed to load admin tokens." onRetry={() => q.refetch()} />;
  }

  if (!q.isLoading && (q.data?.tokens?.length ?? 0) === 0) {
    return (
      <EmptyState
        title="No tokens yet"
        description="Mint a token with the form to see it listed here."
      />
    );
  }

  return (
    <>
      <DataTable<AdminToken>
        columns={columns}
        rows={q.data?.tokens ?? []}
        getRowId={(r) => r.id ?? ''}
        loading={q.isLoading}
        // Small admin list with a wide (7-column) layout: keep every column —
        // notably the row Revoke action — mounted rather than column-virtualized.
        disableVirtualization
      />
      <ConfirmDialog
        open={!!pending}
        title="Revoke admin token"
        message="Revoke this token? It stops authenticating immediately and cannot be undone."
        confirmLabel="Revoke"
        loading={revokeMut.isPending}
        onConfirm={onRevoke}
        onClose={() => setPending(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Role → Permission matrix (read-only reference)
// ---------------------------------------------------------------------------

function RolePermissionMatrix() {
  return (
    <Box component="section" sx={{ mb: 4 }}>
      <Typography variant="h6" gutterBottom>
        Role → permission matrix
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Read-only reference driven by the same client-side role→permission map used to gate the UI.
        A checkmark means the role holds the permission.
      </Typography>
      <TableContainer component={Card} variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Permission</TableCell>
              {ADMIN_ROLES.map((role) => (
                <TableCell key={role} align="center">
                  {role}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {ALL_PERMISSIONS.map((perm) => (
              <TableRow key={perm} hover>
                <TableCell component="th" scope="row">
                  <code>{perm}</code>
                </TableCell>
                {ADMIN_ROLES.map((role) => {
                  const held = ROLE_PERMISSIONS[role].includes(perm);
                  return (
                    <TableCell key={role} align="center">
                      {held ? (
                        <CheckIcon fontSize="small" color="success" aria-label="granted" />
                      ) : (
                        <Box
                          component="span"
                          aria-label="not granted"
                          sx={{ color: 'text.disabled' }}
                        >
                          —
                        </Box>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Tenants (SUPER_ADMIN only)
// ---------------------------------------------------------------------------

const tenantSchema = z.object({ name: z.string().min(1, 'Name is required') });
type TenantForm = z.infer<typeof tenantSchema>;

function TenantsSection({
  canWrite,
  newTenant,
  setNewTenant,
  onMinted,
}: {
  canWrite: boolean;
  newTenant: { id: string; name: string } | null;
  setNewTenant: (t: { id: string; name: string } | null) => void;
  onMinted: (token: string) => void;
}) {
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const createMut = usePostAdminV1Tenants();
  const mintMut = usePostAdminV1AdminTokens();

  // Gate the fetch so non-super users never trigger a 403.
  const tenantsQuery = useGetAdminV1Tenants({ query: { enabled: isSuperAdmin } });

  const form = useForm<TenantForm>({
    resolver: zodResolver(tenantSchema),
    defaultValues: { name: '' },
  });

  const onCreate = async (values: TenantForm) => {
    try {
      const res = await createMut.mutateAsync({ data: { name: values.name.trim() } });
      if (res.id) {
        setNewTenant({ id: res.id, name: res.name ?? values.name.trim() });
      }
      await queryClient.invalidateQueries({ queryKey: getGetAdminV1TenantsQueryKey() });
      enqueueSnackbar(`Tenant "${values.name}" created`, { variant: 'success' });
      form.reset({ name: '' });
    } catch {
      enqueueSnackbar('Failed to create tenant', { variant: 'error' });
    }
  };

  const columns: GridColDef<Tenant>[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      sortable: false,
      renderCell: (params) => <StatusChip status={params.row.status ?? ''} />,
    },
    {
      field: 'id',
      headerName: 'ID',
      flex: 1,
      minWidth: 200,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }} noWrap>
            {params.row.id}
          </Typography>
          <CopyButton value={params.row.id ?? ''} title="Copy tenant ID" />
        </Stack>
      ),
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 160,
      renderCell: (params) => relativeTime(params.row.created_at),
    },
  ];

  const onMintTenantAdmin = async () => {
    if (!newTenant) return;
    try {
      const res = await mintMut.mutateAsync({
        data: {
          name: `${newTenant.name} admin`,
          role: PostAdminV1AdminTokensBodyRole.TENANT_ADMIN,
          tenant_id: newTenant.id,
        },
      });
      if (res.api_token) {
        onMinted(res.api_token);
      }
      enqueueSnackbar('TENANT_ADMIN token minted', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to mint TENANT_ADMIN token', { variant: 'error' });
    }
  };

  return (
    <Box component="section" sx={{ mb: 4 }}>
      <Typography variant="h6" gutterBottom>
        Tenants
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Super-admin only. Onboard a tenant: create it, then mint its first TENANT_ADMIN token.
      </Typography>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Create tenant
            </Typography>
            <form onSubmit={form.handleSubmit(onCreate)} noValidate>
              <Stack spacing={2}>
                <TextField
                  label="Name"
                  {...form.register('name')}
                  error={!!form.formState.errors.name}
                  helperText={form.formState.errors.name?.message}
                  disabled={!canWrite}
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!canWrite || createMut.isPending}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Create tenant
                </Button>
              </Stack>
            </form>

            {newTenant && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  Tenant created
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {newTenant.id}
                  </Typography>
                  <CopyButton value={newTenant.id} title="Copy tenant ID" />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Next, mint a TENANT_ADMIN token so this tenant's operators can create sources.
                </Typography>
                <Button
                  variant="outlined"
                  disabled={!canWrite || mintMut.isPending}
                  onClick={onMintTenantAdmin}
                >
                  Mint TENANT_ADMIN token
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Existing tenants
            </Typography>
            {tenantsQuery.isError ? (
              <ErrorState
                message="Failed to load tenants."
                onRetry={() => tenantsQuery.refetch()}
              />
            ) : !tenantsQuery.isLoading && (tenantsQuery.data?.tenants?.length ?? 0) === 0 ? (
              <EmptyState
                title="No tenants yet"
                description="Create a tenant with the form to see it listed here."
              />
            ) : (
              <DataTable<Tenant>
                columns={columns}
                rows={tenantsQuery.data?.tenants ?? []}
                getRowId={(r) => r.id ?? ''}
                loading={tenantsQuery.isLoading}
              />
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
