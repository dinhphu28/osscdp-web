import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { enqueueSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CopyButton } from '@/components/CopyButton';
import { DataTable, type GridColDef } from '@/components/DataTable';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { relativeTime, looksMasked } from '@/lib/format/datetime';
import { useGetAdminV1TenantsTenantIDProfilesCanonicalUserID } from '@/lib/api/generated/profiles/profiles';
import {
  useGetAdminV1TenantsTenantIDProfilesCanonicalUserIDExport,
  useGetAdminV1TenantsTenantIDProfilesCanonicalUserIDIdentifiers,
  useDeleteAdminV1TenantsTenantIDProfilesCanonicalUserID,
} from '@/lib/api/generated/governance/governance';
import { ConsentEditor } from './ConsentEditor';

type TabKey = 'overview' | 'identity' | 'segments' | 'consent' | 'gdpr';

const TRAIT_KEYS = ['email', 'phone', 'name', 'country'];
const COMPUTED_KEYS = [
  'total_events',
  'total_orders',
  'last_event_name',
  'last_source_id',
  'last_page_url',
  'last_product_viewed',
  'last_order_at',
];

/**
 * Customer 360 detail — the flagship single-customer view. Tabs: Overview,
 * Identity, Segments, Consent, GDPR. See docs/screens/05-customer-360.md.
 */
export function Customer360Screen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canonicalUserId = '' } = useParams<{ canonicalUserId: string }>();

  const canPii = can('pii:read');
  const canConsentWrite = can('consent:write');
  const canDelete = can('profile:delete');

  const [tab, setTab] = useState<TabKey>('overview');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const profileQuery = useGetAdminV1TenantsTenantIDProfilesCanonicalUserID(
    tenantId,
    canonicalUserId,
  );
  const exportQuery = useGetAdminV1TenantsTenantIDProfilesCanonicalUserIDExport(
    tenantId,
    canonicalUserId,
  );
  const deleteMut = useDeleteAdminV1TenantsTenantIDProfilesCanonicalUserID();

  const onExport = async () => {
    try {
      const res = exportQuery.data ? { data: exportQuery.data } : await exportQuery.refetch();
      const bundle = res.data;
      if (!bundle) {
        enqueueSnackbar('Nothing to export yet', { variant: 'error' });
        return;
      }
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customer-${canonicalUserId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      enqueueSnackbar('Export bundle downloaded', { variant: 'success' });
    } catch {
      enqueueSnackbar('Export failed', { variant: 'error' });
    }
  };

  const onDelete = async () => {
    try {
      const res = await deleteMut.mutateAsync({
        tenantID: tenantId,
        canonicalUserID: canonicalUserId,
      });
      const deleted = res.deleted ?? {};
      const summary = Object.entries(deleted)
        .map(([table, count]) => `${table}: ${count}`)
        .join(', ');
      enqueueSnackbar(`Customer deleted (${summary || 'no rows'})`, { variant: 'success' });
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes(canonicalUserId) });
      setDeleteOpen(false);
      navigate(`/t/${tenantId}/profiles`);
    } catch {
      enqueueSnackbar('Failed to delete customer', { variant: 'error' });
    }
  };

  const backAction = (
    <Button variant="outlined" onClick={() => navigate(`/t/${tenantId}/profiles`)}>
      Back to search
    </Button>
  );

  if (profileQuery.isLoading) {
    return (
      <>
        <PageHeader title="Customer 360" action={backAction} />
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress />
        </Stack>
      </>
    );
  }

  if (profileQuery.isError) {
    const notFound = profileQuery.error?.response?.status === 404;
    return (
      <>
        <PageHeader title="Customer 360" action={backAction} />
        {notFound ? (
          <EmptyState
            title="Profile not found"
            description="It may still be processing (the pipeline is asynchronous) — refresh shortly, or it may have been deleted."
            action={
              <Button variant="outlined" onClick={() => profileQuery.refetch()}>
                Refresh
              </Button>
            }
          />
        ) : (
          <ErrorState message="Failed to load profile." onRetry={() => profileQuery.refetch()} />
        )}
      </>
    );
  }

  const profile = profileQuery.data;
  const traits = (profile?.traits ?? {}) as Record<string, unknown>;
  const computed = (profile?.computed_attributes ?? {}) as Record<string, unknown>;

  return (
    <>
      <PageHeader title="Customer 360" action={backAction} />

      {/* Detail header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            spacing={2}
            alignItems={{ md: 'center' }}
          >
            <Box>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ wordBreak: 'break-all' }}>
                  {profile?.canonical_user_id ?? canonicalUserId}
                </Typography>
                <CopyButton value={profile?.canonical_user_id ?? canonicalUserId} title="Copy ID" />
              </Stack>
              <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 1 }}>
                <HeaderField label="Identity cluster" value={profile?.identity_cluster_id ?? '—'} />
                <HeaderField label="First seen" value={relativeTime(profile?.first_seen_at)} />
                <HeaderField label="Last seen" value={relativeTime(profile?.last_seen_at)} />
                <HeaderField label="Version" value={String(profile?.version ?? '—')} />
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Tabs
        value={tab}
        onChange={(_, next: TabKey) => setTab(next)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label="Overview" value="overview" />
        <Tab label="Identity" value="identity" />
        <Tab label="Segments" value="segments" />
        <Tab label="Consent" value="consent" />
        <Tab label="GDPR" value="gdpr" />
      </Tabs>

      {tab === 'overview' && <OverviewTab traits={traits} computed={computed} canPii={canPii} />}
      {tab === 'identity' && (
        <IdentityTab tenantId={tenantId} canonicalUserId={canonicalUserId} canPii={canPii} />
      )}
      {tab === 'segments' && (
        <SegmentsTab
          isLoading={exportQuery.isLoading}
          isError={exportQuery.isError}
          onRetry={() => exportQuery.refetch()}
          memberships={exportQuery.data?.segment_memberships ?? []}
        />
      )}
      {tab === 'consent' && (
        <ConsentEditor
          tenantId={tenantId}
          canonicalUserId={canonicalUserId}
          canWrite={canConsentWrite}
        />
      )}
      {tab === 'gdpr' && (
        <GdprTab
          canDelete={canDelete}
          exporting={exportQuery.isFetching}
          onExport={onExport}
          onDeleteClick={() => setDeleteOpen(true)}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete / anonymize customer?"
        message="This permanently deletes and anonymizes this customer's profile, identity, consent, and segment data. This is irreversible and audited."
        confirmLabel="Delete customer"
        confirmColor="error"
        confirmPhrase={profile?.canonical_user_id ?? canonicalUserId}
        loading={deleteMut.isPending}
        onConfirm={onDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
        {value}
      </Typography>
    </Box>
  );
}

function KeyValueRow({ label, value, masked }: { label: string; value: string; masked?: boolean }) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      spacing={2}
      sx={{ py: 0.75 }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="body2" sx={{ wordBreak: 'break-all', textAlign: 'right' }}>
          {value}
        </Typography>
        {masked && (
          <Tooltip title="Masked — unmask requires pii:read">
            <LockOutlinedIcon fontSize="inherit" color="disabled" />
          </Tooltip>
        )}
      </Stack>
    </Stack>
  );
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function OverviewTab({
  traits,
  computed,
  canPii,
}: {
  traits: Record<string, unknown>;
  computed: Record<string, unknown>;
  canPii: boolean;
}) {
  const traitKeys = Array.from(new Set([...TRAIT_KEYS, ...Object.keys(traits)]));
  const computedKeys = Array.from(new Set([...COMPUTED_KEYS, ...Object.keys(computed)]));

  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Traits
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            PII is server-masked unless your token holds <code>pii:read</code>.
          </Typography>
          <Divider sx={{ mb: 1 }} />
          {traitKeys.map((k) => {
            const v = traits[k];
            return (
              <KeyValueRow
                key={k}
                label={k}
                value={renderValue(v)}
                masked={looksMasked(v) && !canPii}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Computed attributes
          </Typography>
          <Divider sx={{ mb: 1 }} />
          {computedKeys.map((k) => {
            const v = computed[k];
            const value =
              k === 'last_order_at' && typeof v === 'string' ? relativeTime(v) : renderValue(v);
            return <KeyValueRow key={k} label={k} value={value} />;
          })}
        </CardContent>
      </Card>
    </Box>
  );
}

function IdentityTab({
  tenantId,
  canonicalUserId,
  canPii,
}: {
  tenantId: string;
  canonicalUserId: string;
  canPii: boolean;
}) {
  const idsQuery = useGetAdminV1TenantsTenantIDProfilesCanonicalUserIDIdentifiers(
    tenantId,
    canonicalUserId,
  );

  return (
    <Stack spacing={3}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Identifier inventory
          </Typography>
          {idsQuery.isLoading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress />
            </Stack>
          ) : idsQuery.isError ? (
            <ErrorState message="Failed to load identifiers." onRetry={() => idsQuery.refetch()} />
          ) : (idsQuery.data?.total ?? 0) === 0 ? (
            <EmptyState title="No identifiers" description="No identity nodes linked yet." />
          ) : (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                Total nodes: <strong>{idsQuery.data?.total ?? 0}</strong>
              </Typography>
              <Divider />
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  By namespace
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {Object.entries(idsQuery.data?.by_namespace ?? {}).map(([ns, count]) => (
                    <Chip key={ns} label={`${ns}: ${count}`} size="small" />
                  ))}
                </Stack>
              </Box>
              {idsQuery.data?.values && Object.keys(idsQuery.data.values).length > 0 && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Values (masked unless pii:read)
                  </Typography>
                  {Object.entries(idsQuery.data.values).map(([ns, vals]) => (
                    <Box key={ns} sx={{ mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {ns}
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={0.5}>
                        {(Array.isArray(vals) ? (vals as unknown[]) : []).map((v, i) => (
                          <Chip
                            key={`${String(v)}-${i}`}
                            size="small"
                            variant="outlined"
                            label={String(v)}
                            icon={
                              looksMasked(v) && !canPii ? (
                                <LockOutlinedIcon fontSize="small" />
                              ) : undefined
                            }
                          />
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Box>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Identity cluster & merge history
          </Typography>
          <Alert severity="info">
            The identity-cluster and merge-history endpoints are <strong>TBD — backend gap</strong>.
            There is no dedicated cluster/merge-timeline API yet; identity nodes above are sourced
            from the identifier inventory and export bundle. See
            docs/10-backend-gaps-and-caveats.md.
          </Alert>
        </CardContent>
      </Card>
    </Stack>
  );
}

function SegmentsTab({
  isLoading,
  isError,
  onRetry,
  memberships,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  memberships: { segment_id?: string; status?: string }[];
}) {
  if (isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress />
      </Stack>
    );
  }
  if (isError) {
    return <ErrorState message="Failed to load segment memberships." onRetry={onRetry} />;
  }
  if (memberships.length === 0) {
    return (
      <EmptyState
        title="Not a member of any segment yet"
        description="Segmentation is asynchronous — memberships may take a few seconds to appear."
      />
    );
  }

  const columns: GridColDef<{ id: string; segment_id?: string; status?: string }>[] = [
    { field: 'segment_id', headerName: 'Segment ID', flex: 2, minWidth: 240 },
    { field: 'status', headerName: 'Status', flex: 1, minWidth: 140 },
  ];
  const rows = memberships.map((m, i) => ({ id: m.segment_id ?? String(i), ...m }));

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        A dedicated per-profile segments endpoint is <strong>TBD — backend gap</strong>; these
        memberships are read from the GDPR export bundle. See docs/10-backend-gaps-and-caveats.md.
      </Alert>
      <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} />
    </Stack>
  );
}

function GdprTab({
  canDelete,
  exporting,
  onExport,
  onDeleteClick,
}: {
  canDelete: boolean;
  exporting: boolean;
  onExport: () => void;
  onDeleteClick: () => void;
}) {
  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Export data
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Download the full customer bundle (profile, identity nodes, segment memberships,
            consent) as JSON. Contents honor server-side PII masking based on your token.
          </Typography>
          <Button variant="contained" onClick={onExport} disabled={exporting}>
            {exporting ? 'Preparing…' : 'Export data (JSON)'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Delete / anonymize
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Permanently delete and anonymize this customer. Irreversible and audited.
          </Typography>
          {!canDelete && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Requires <code>profile:delete</code> (SUPER_ADMIN / TENANT_ADMIN only).
            </Alert>
          )}
          <Button variant="outlined" color="error" disabled={!canDelete} onClick={onDeleteClick}>
            Delete / anonymize customer
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
