import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { enqueueSnackbar } from 'notistack';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/RefreshOutlined';
import LinkOffIcon from '@mui/icons-material/LinkOffOutlined';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { StatusChip } from '@/components/StatusChip';
import { JsonViewer } from '@/components/JsonViewer';
import { CopyButton } from '@/components/CopyButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type GridColDef } from '@/components/DataTable';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  useGetAdminV1TenantsTenantIDDestinationsDestinationID,
  useGetAdminV1TenantsTenantIDDestinationsDestinationIDDeliveries,
  usePutAdminV1TenantsTenantIDDestinationsDestinationID,
  usePostAdminV1TenantsTenantIDDestinationsDestinationIDSubscriptions,
  useDeleteAdminV1TenantsTenantIDDestinationsDestinationIDSubscriptionsSubscriptionID,
} from '@/lib/api/generated/destinations/destinations';

interface DeliveryRow {
  id: string;
  activation_task_id?: string;
  status?: string;
  http_status?: number | null;
  error_message?: string;
  attempt_count?: number;
  idempotency_key?: string;
}

/** A subscription created this session (there is no list-subscriptions endpoint to hydrate from). */
interface LocalSubscription {
  id: string;
  segment_id: string;
  status?: string;
}

/**
 * Destination detail — config (JsonViewer), enable/disable, segment subscriptions and delivery log.
 * NOTE (backend gap): there is no list-subscriptions endpoint, so subscriptions created here are
 * tracked client-side for this session; unsubscribe also accepts a pasted subscription ID.
 * See docs/screens/07-activation-destinations.md and docs/10-backend-gaps-and-caveats.md.
 */
export function DestinationDetailScreen() {
  const { tenantId } = useTenant();
  const { destinationId = '' } = useParams();
  const { can } = useAuth();
  const canWrite = can('destination:write');
  const canActivation = can('activation:read');

  const detailQuery = useGetAdminV1TenantsTenantIDDestinationsDestinationID(
    tenantId,
    destinationId,
  );
  const deliveriesQuery = useGetAdminV1TenantsTenantIDDestinationsDestinationIDDeliveries(
    tenantId,
    destinationId,
    { query: { enabled: canActivation && !!destinationId } },
  );

  const putMut = usePutAdminV1TenantsTenantIDDestinationsDestinationID();
  const subscribeMut = usePostAdminV1TenantsTenantIDDestinationsDestinationIDSubscriptions();
  const unsubscribeMut =
    useDeleteAdminV1TenantsTenantIDDestinationsDestinationIDSubscriptionsSubscriptionID();

  const [disableOpen, setDisableOpen] = useState(false);
  const [segmentId, setSegmentId] = useState('');
  const [unsubscribeId, setUnsubscribeId] = useState('');
  const [subs, setSubs] = useState<LocalSubscription[]>([]);
  const [pendingUnsub, setPendingUnsub] = useState<string | null>(null);

  const destination = detailQuery.data;
  const status = destination?.status ?? 'unknown';
  const isActive = status !== 'disabled';

  const onToggleStatus = async (next: 'active' | 'disabled') => {
    setDisableOpen(false);
    try {
      await putMut.mutateAsync({
        tenantID: tenantId,
        destinationID: destinationId,
        data: { status: next },
      });
      enqueueSnackbar(next === 'disabled' ? 'Destination disabled' : 'Destination enabled', {
        variant: 'success',
      });
      await detailQuery.refetch();
    } catch {
      enqueueSnackbar('Failed to update destination', { variant: 'error' });
    }
  };

  const onSubscribe = async () => {
    const seg = segmentId.trim();
    if (!seg) return;
    try {
      const res = await subscribeMut.mutateAsync({
        tenantID: tenantId,
        destinationID: destinationId,
        data: { trigger_type: 'segment_membership', segment_id: seg },
      });
      setSubs((prev) => [
        { id: res.id ?? '', segment_id: res.segment_id ?? seg, status: res.status },
        ...prev,
      ]);
      setSegmentId('');
      enqueueSnackbar(
        'Subscribed. Deliveries are async — they appear after a customer enters/exits the segment. Refresh to check.',
        { variant: 'success' },
      );
    } catch {
      enqueueSnackbar('Failed to subscribe', { variant: 'error' });
    }
  };

  const onUnsubscribe = async (subscriptionID: string) => {
    const id = subscriptionID.trim();
    if (!id) return;
    setPendingUnsub(id);
    try {
      await unsubscribeMut.mutateAsync({
        tenantID: tenantId,
        destinationID: destinationId,
        subscriptionID: id,
      });
      setSubs((prev) => prev.filter((s) => s.id !== id));
      setUnsubscribeId('');
      enqueueSnackbar('Unsubscribed (soft-disabled). Repeat calls are safe (idempotent).', {
        variant: 'success',
      });
    } catch {
      enqueueSnackbar('Failed to unsubscribe', { variant: 'error' });
    } finally {
      setPendingUnsub(null);
    }
  };

  const deliveryRows: DeliveryRow[] = (deliveriesQuery.data?.deliveries ?? []).map((d, i) => ({
    id: d.activation_task_id ?? d.idempotency_key ?? `row-${i}`,
    ...d,
  }));

  const deliveryColumns: GridColDef<DeliveryRow>[] = [
    {
      field: 'status',
      headerName: 'Status',
      width: 150,
      renderCell: (params) => (params.value ? <StatusChip status={String(params.value)} /> : '—'),
    },
    {
      field: 'http_status',
      headerName: 'HTTP',
      width: 90,
      valueFormatter: (value) => (value == null ? '—' : String(value)),
    },
    { field: 'attempt_count', headerName: 'Attempts', width: 100, type: 'number' },
    {
      field: 'error_message',
      headerName: 'Error',
      flex: 1,
      minWidth: 200,
      renderCell: (params) =>
        params.value ? (
          <Tooltip title={String(params.value)}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(params.value)}
            </span>
          </Tooltip>
        ) : (
          '—'
        ),
    },
    {
      field: 'idempotency_key',
      headerName: 'Idempotency key',
      width: 220,
      renderCell: (params) =>
        params.value ? (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(params.value)}
            </span>
            <CopyButton value={String(params.value)} title="Copy key" />
          </Stack>
        ) : (
          '—'
        ),
    },
  ];

  if (detailQuery.isLoading) {
    return (
      <>
        <PageHeader title="Destination" />
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      </>
    );
  }

  if (detailQuery.isError) {
    return (
      <>
        <PageHeader title="Destination" />
        <ErrorState
          title="Couldn't load destination"
          message="The destination could not be loaded. Check the ID and your permissions."
          onRetry={() => detailQuery.refetch()}
        />
      </>
    );
  }

  if (!destination) {
    return (
      <>
        <PageHeader title="Destination" />
        <EmptyState title="Destination not found" description="No destination matched this ID." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={destination.name ?? 'Destination'}
        description={`Destination ${destination.id ?? destinationId}`}
        action={
          canWrite ? (
            isActive ? (
              <Button
                variant="outlined"
                color="warning"
                onClick={() => setDisableOpen(true)}
                disabled={putMut.isPending}
              >
                Disable
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={() => onToggleStatus('active')}
                disabled={putMut.isPending}
              >
                Enable
              </Button>
            )
          ) : undefined
        }
      />

      {!canWrite && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your role is read-only for destinations. Editing, disabling and subscribing require{' '}
          <code>destination:write</code>.
        </Alert>
      )}

      {/* Config */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Config
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
            {destination.type && <Chip size="small" label={`type: ${destination.type}`} />}
            <StatusChip status={status} />
          </Stack>
          <JsonViewer value={destination.config ?? {}} />
        </CardContent>
      </Card>

      {/* Subscriptions */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Subscriptions
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            There is no list-subscriptions endpoint, so only subscriptions created in this session
            are shown. Use a subscription ID to unsubscribe an existing one. Only the{' '}
            <code>segment_membership</code> trigger is supported today. (See
            docs/10-backend-gaps-and-caveats.md.)
          </Alert>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Add subscription</Typography>
              <TextField
                label="Segment ID (UUID)"
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                disabled={!canWrite}
                size="small"
              />
              <Button
                variant="contained"
                onClick={onSubscribe}
                disabled={!canWrite || !segmentId.trim() || subscribeMut.isPending}
                sx={{ alignSelf: 'flex-start' }}
              >
                Subscribe
              </Button>
            </Stack>

            <Stack spacing={1.5}>
              <Typography variant="subtitle2">Unsubscribe by ID</Typography>
              <TextField
                label="Subscription ID (UUID)"
                value={unsubscribeId}
                onChange={(e) => setUnsubscribeId(e.target.value)}
                disabled={!canWrite}
                size="small"
              />
              <Button
                variant="outlined"
                color="warning"
                onClick={() => onUnsubscribe(unsubscribeId)}
                disabled={!canWrite || !unsubscribeId.trim() || unsubscribeMut.isPending}
                sx={{ alignSelf: 'flex-start' }}
              >
                Unsubscribe
              </Button>
            </Stack>
          </Box>

          <Divider sx={{ my: 2 }} />

          {subs.length === 0 ? (
            <EmptyState
              title="No subscriptions added this session"
              description="Add a subscription above to push this segment's membership changes to the destination."
            />
          ) : (
            <Stack spacing={1}>
              {subs.map((s) => (
                <Stack
                  key={s.id || s.segment_id}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      segment: {s.segment_id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      subscription: {s.id || '—'} {s.status ? `· ${s.status}` : ''}
                    </Typography>
                  </Box>
                  <Tooltip title={canWrite ? 'Unsubscribe' : 'requires destination:write'}>
                    <span>
                      <IconButton
                        color="warning"
                        onClick={() => onUnsubscribe(s.id)}
                        disabled={!canWrite || !s.id || pendingUnsub === s.id}
                      >
                        <LinkOffIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Deliveries */}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Deliveries</Typography>
            {canActivation && (
              <Button
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => deliveriesQuery.refetch()}
                disabled={deliveriesQuery.isFetching}
              >
                Refresh
              </Button>
            )}
          </Stack>

          {!canActivation ? (
            <Alert severity="info">
              Viewing the delivery log requires <code>activation:read</code>.
            </Alert>
          ) : deliveriesQuery.isError ? (
            <ErrorState
              title="Couldn't load deliveries"
              onRetry={() => deliveriesQuery.refetch()}
            />
          ) : !deliveriesQuery.isLoading && deliveryRows.length === 0 ? (
            <EmptyState
              title="No deliveries yet"
              description="Activation is async — deliveries appear after a customer enters or exits a subscribed segment. Refresh to check."
            />
          ) : (
            <DataTable<DeliveryRow>
              rows={deliveryRows}
              columns={deliveryColumns}
              getRowId={(r) => r.id}
              loading={deliveriesQuery.isLoading}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={disableOpen}
        title="Disable destination?"
        message="Disabling stops new deliveries to this destination immediately. Existing subscriptions are retained. You can re-enable it later."
        confirmLabel="Disable"
        confirmColor="warning"
        loading={putMut.isPending}
        onConfirm={() => onToggleStatus('disabled')}
        onClose={() => setDisableOpen(false)}
      />
    </>
  );
}
