import { useState, type ReactNode } from 'react';
import { enqueueSnackbar } from 'notistack';
import {
  Alert,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { StatusChip } from '@/components/StatusChip';
import { DataTable, type GridColDef } from '@/components/DataTable';
import { JsonViewer } from '@/components/JsonViewer';
import { CopyButton } from '@/components/CopyButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { relativeTime, absoluteTime, looksMasked } from '@/lib/format/datetime';
import {
  useGetAdminV1TenantsTenantIDDlq,
  usePostAdminV1TenantsTenantIDDlqIdRetry,
  usePostAdminV1TenantsTenantIDDlqIdDiscard,
} from '@/lib/api/generated/dlq/dlq';
import type { DLQEvent } from '@/lib/api/generated/model';
import { GetAdminV1TenantsTenantIDDlqStatus } from '@/lib/api/generated/model';

type DlqStatus =
  (typeof GetAdminV1TenantsTenantIDDlqStatus)[keyof typeof GetAdminV1TenantsTenantIDDlqStatus];

const STATUS_TABS: DlqStatus[] = [
  GetAdminV1TenantsTenantIDDlqStatus.open,
  GetAdminV1TenantsTenantIDDlqStatus.retried,
  GetAdminV1TenantsTenantIDDlqStatus.discarded,
];

const rowKey = (row: DLQEvent): string => row.id ?? row.event_id ?? '';

/**
 * DLQ Admin — triage dead-lettered pipeline events. Filter by status, inspect the
 * original payload, and retry (republish) or discard. Retry re-enters the async
 * pipeline, so success means "resubmitted", not "fixed". See docs/screens/08-dlq-admin.md.
 */
export function DlqScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const canRetry = can('dlq:retry');

  const [status, setStatus] = useState<DlqStatus>(GetAdminV1TenantsTenantIDDlqStatus.open);
  const [selected, setSelected] = useState<DLQEvent | null>(null);
  const [discardTarget, setDiscardTarget] = useState<DLQEvent | null>(null);

  const query = useGetAdminV1TenantsTenantIDDlq(tenantId, { status });
  const retryMut = usePostAdminV1TenantsTenantIDDlqIdRetry();
  const discardMut = usePostAdminV1TenantsTenantIDDlqIdDiscard();

  const events = query.data?.events ?? [];

  const onRetry = async (row: DLQEvent) => {
    const id = row.id;
    if (!id) return;
    try {
      await retryMut.mutateAsync({ tenantID: tenantId, id });
      enqueueSnackbar('Event republished; it may reappear here if it fails again.', {
        variant: 'success',
      });
      setSelected(null);
      await query.refetch();
    } catch {
      enqueueSnackbar('Failed to retry event', { variant: 'error' });
    }
  };

  const onDiscard = async () => {
    const id = discardTarget?.id;
    if (!id) return;
    try {
      await discardMut.mutateAsync({ tenantID: tenantId, id });
      enqueueSnackbar('Event discarded — it will not be reprocessed.', { variant: 'success' });
      setDiscardTarget(null);
      setSelected(null);
      await query.refetch();
    } catch {
      enqueueSnackbar('Failed to discard event', { variant: 'error' });
    }
  };

  const columns: GridColDef<DLQEvent>[] = [
    {
      field: 'failed_at',
      headerName: 'Failed at',
      width: 130,
      renderCell: (params) => (
        <Tooltip title={absoluteTime(params.value)}>
          <span>{relativeTime(params.value)}</span>
        </Tooltip>
      ),
    },
    { field: 'component', headerName: 'Component', width: 150 },
    {
      field: 'error_code',
      headerName: 'Error code',
      width: 160,
      renderCell: (params) => (params.value ? <StatusChip status={String(params.value)} /> : '—'),
    },
    {
      field: 'error_message',
      headerName: 'Error message',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Tooltip title={String(params.value ?? '')}>
          <Typography variant="body2" noWrap>
            {params.value ? String(params.value) : '—'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      field: 'event_id',
      headerName: 'Event ID',
      width: 170,
      sortable: false,
      renderCell: (params) =>
        params.value ? (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace' }}>
              {String(params.value)}
            </Typography>
            <CopyButton value={String(params.value)} title="Copy event ID" />
          </Stack>
        ) : (
          '—'
        ),
    },
    {
      field: 'retry_count',
      headerName: 'Retries',
      width: 90,
      type: 'number',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (params.value ? <StatusChip status={String(params.value)} /> : '—'),
    },
  ];

  return (
    <>
      <PageHeader title="DLQ" description="Dead-lettered pipeline events awaiting triage." />

      {!canRetry && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your role is read-only for the DLQ. Retrying and discarding events requires{' '}
          <code>dlq:retry</code>.
        </Alert>
      )}

      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
        value={status}
        onChange={(_, next: DlqStatus | null) => {
          if (next) {
            setStatus(next);
            setSelected(null);
          }
        }}
        sx={{ mb: 2 }}
      >
        {STATUS_TABS.map((s) => (
          <ToggleButton key={s} value={s} sx={{ textTransform: 'capitalize' }}>
            {s}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {query.isError ? (
        <ErrorState
          message="Failed to load dead-lettered events."
          onRetry={() => query.refetch()}
        />
      ) : !query.isLoading && events.length === 0 ? (
        <EmptyState
          title={
            status === GetAdminV1TenantsTenantIDDlqStatus.open
              ? 'No dead-lettered events — pipeline healthy'
              : 'No events with this status'
          }
          description={
            status === GetAdminV1TenantsTenantIDDlqStatus.open
              ? 'Nothing is currently dead-lettered for this tenant.'
              : undefined
          }
        />
      ) : (
        <DataTable<DLQEvent>
          rows={events}
          columns={columns}
          getRowId={rowKey}
          loading={query.isLoading}
          onRowClick={(params) => setSelected(params.row)}
          initialState={{ sorting: { sortModel: [{ field: 'failed_at', sort: 'desc' }] } }}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      )}

      <Drawer anchor="right" open={!!selected} onClose={() => setSelected(null)}>
        <Box sx={{ width: { xs: '100vw', sm: 480 }, p: 3 }}>
          {selected && (
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="h6">DLQ event</Typography>
                <IconButton onClick={() => setSelected(null)} aria-label="Close">
                  <CloseIcon />
                </IconButton>
              </Stack>

              <Stack spacing={1}>
                <DetailRow label="Status">
                  {selected.status ? <StatusChip status={selected.status} /> : '—'}
                </DetailRow>
                <DetailRow label="Component">{selected.component ?? '—'}</DetailRow>
                <DetailRow label="Error code">
                  {selected.error_code ? <StatusChip status={selected.error_code} /> : '—'}
                </DetailRow>
                <DetailRow label="Error message">{selected.error_message ?? '—'}</DetailRow>
                <DetailRow label="Retries">{selected.retry_count ?? 0}</DetailRow>
                <DetailRow label="Failed at">
                  <Tooltip title={absoluteTime(selected.failed_at)}>
                    <span>{relativeTime(selected.failed_at)}</span>
                  </Tooltip>
                </DetailRow>
                <DetailRow label="Event ID">
                  {selected.event_id ? (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span style={{ fontFamily: 'monospace' }}>{selected.event_id}</span>
                      <CopyButton value={selected.event_id} title="Copy event ID" />
                    </Stack>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                <DetailRow label="DLQ ID">
                  {selected.id ? (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <span style={{ fontFamily: 'monospace' }}>{selected.id}</span>
                      <CopyButton value={selected.id} title="Copy DLQ ID" />
                    </Stack>
                  ) : (
                    '—'
                  )}
                </DetailRow>
              </Stack>

              <Divider />

              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle2">Original payload</Typography>
                {looksMasked(selected.error_message) && (
                  <Tooltip title="unmask requires pii:read">
                    <LockOutlinedIcon fontSize="small" color="disabled" />
                  </Tooltip>
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Raw ingress body — may contain PII. Values are masked server-side; the console never
                unmasks.
              </Typography>
              <JsonViewer value={selected.original_payload} />

              {canRetry && (
                <>
                  <Divider />
                  {status === GetAdminV1TenantsTenantIDDlqStatus.open && (
                    <Alert severity="info">
                      Retry republishes the event into the async pipeline. It may reappear here if
                      it fails again.
                    </Alert>
                  )}
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      disabled={!selected.id || retryMut.isPending}
                      onClick={() => onRetry(selected)}
                    >
                      Retry
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      disabled={!selected.id || discardMut.isPending}
                      onClick={() => setDiscardTarget(selected)}
                    >
                      Discard
                    </Button>
                  </Stack>
                </>
              )}
            </Stack>
          )}
        </Box>
      </Drawer>

      <ConfirmDialog
        open={!!discardTarget}
        title="Discard this event?"
        message="Discard this dead-lettered event? This cannot be undone. The event will not be reprocessed."
        confirmLabel="Discard"
        confirmColor="error"
        loading={discardMut.isPending}
        onConfirm={onDiscard}
        onClose={() => setDiscardTarget(null)}
      />
    </>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={2} alignItems="baseline">
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</Box>
    </Stack>
  );
}
