import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { enqueueSnackbar } from 'notistack';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Menu,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVertOutlined';
import RefreshIcon from '@mui/icons-material/RefreshOutlined';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import ReplayIcon from '@mui/icons-material/ReplayOutlined';
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
import { relativeTime, absoluteTime } from '@/lib/format/datetime';
import {
  useGetAdminV1TenantsTenantIDEvents,
  usePostAdminV1TenantsTenantIDEventsEventIDReplay,
  usePostAdminV1TenantsTenantIDReplay,
} from '@/lib/api/generated/raw-events/raw-events';
import type { GetAdminV1TenantsTenantIDEventsParams, RawEvent } from '@/lib/api/generated/model';

const PAGE_LIMIT = 50;
const DEFAULT_REPLAY_MAX = 1000;
const NAMESPACES = ['user_id', 'email', 'anonymous_id', 'device_id'] as const;

const ASYNC_NOTE =
  'Republished into the pipeline. Processing is asynchronous — refresh in a few seconds to see downstream changes.';

interface AppliedFilters {
  identifier_key?: string;
  event_name?: string;
}

/**
 * Events Explorer — search, inspect, and replay raw ingested events.
 *
 * The events list is the only KEYSET-paginated resource: paging is driven by the
 * opaque `next_cursor` via a cursor stack (forward/back), not numbered pages.
 * Raw `payload_json` is NOT server-masked (documented backend gap) so the payload
 * is treated as a sensitive surface and hidden behind a "Reveal payload" click.
 * See docs/screens/04-events-explorer.md and docs/10-backend-gaps-and-caveats.md.
 */
export function EventsScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const canReplay = can('event:replay');

  // Draft filter inputs.
  const [namespace, setNamespace] = useState<string>(NAMESPACES[0]);
  const [identValue, setIdentValue] = useState('');
  const [eventName, setEventName] = useState('');

  // Applied filters (drive the query).
  const [applied, setApplied] = useState<AppliedFilters>({});

  // Cursor stack: each entry is the cursor used for that page (first page = undefined).
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const currentCursor = cursorStack[cursorStack.length - 1];

  // Detail drawer + payload reveal.
  const [selected, setSelected] = useState<RawEvent | null>(null);
  const [revealPayload, setRevealPayload] = useState(false);

  // Row-actions menu.
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<RawEvent | null>(null);

  // Replay-one confirmation.
  const [replayEvent, setReplayEvent] = useState<RawEvent | null>(null);

  // Replay-by-identifier dialog.
  const [identDialogOpen, setIdentDialogOpen] = useState(false);
  const [identDialogKey, setIdentDialogKey] = useState('');
  const [identDialogMax, setIdentDialogMax] = useState<number>(DEFAULT_REPLAY_MAX);

  const params: GetAdminV1TenantsTenantIDEventsParams = {
    limit: PAGE_LIMIT,
    cursor: currentCursor,
    identifier_key: applied.identifier_key,
    event_name: applied.event_name,
  };

  const query = useGetAdminV1TenantsTenantIDEvents(tenantId, params);
  const rows = query.data?.events ?? [];
  const nextCursor = query.data?.next_cursor ?? '';

  const replayOneMut = usePostAdminV1TenantsTenantIDEventsEventIDReplay();
  const replayIdentMut = usePostAdminV1TenantsTenantIDReplay();

  const resetPaging = () => setCursorStack([undefined]);

  const onApply = () => {
    const key = identValue.trim() ? `${namespace}:${identValue.trim()}` : undefined;
    setApplied({ identifier_key: key, event_name: eventName.trim() || undefined });
    resetPaging();
  };

  const onClear = () => {
    setNamespace(NAMESPACES[0]);
    setIdentValue('');
    setEventName('');
    setApplied({});
    resetPaging();
  };

  const openMenu = (e: MouseEvent<HTMLElement>, row: RawEvent) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuRow(row);
  };
  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuRow(null);
  };

  const openReplayIdentDialog = (seed: string) => {
    setIdentDialogKey(seed);
    setIdentDialogMax(DEFAULT_REPLAY_MAX);
    setIdentDialogOpen(true);
  };

  const doReplayOne = async () => {
    if (!replayEvent?.id) return;
    const target = replayEvent;
    setReplayEvent(null);
    try {
      await replayOneMut.mutateAsync({ tenantID: tenantId, eventID: target.id! });
      enqueueSnackbar(ASYNC_NOTE, { variant: 'info' });
    } catch {
      enqueueSnackbar('Failed to replay event', { variant: 'error' });
    }
  };

  const doReplayIdentifier = async () => {
    const key = identDialogKey.trim();
    if (!key) return;
    setIdentDialogOpen(false);
    try {
      const res = await replayIdentMut.mutateAsync({
        tenantID: tenantId,
        params: { identifier_key: key, max: identDialogMax },
      });
      const count = res.replayed;
      enqueueSnackbar(
        `${typeof count === 'number' ? `${count} event(s) queued. ` : ''}${ASYNC_NOTE}`,
        { variant: 'info' },
      );
    } catch {
      enqueueSnackbar('Failed to replay events for identifier', { variant: 'error' });
    }
  };

  const columns = useMemo<GridColDef<RawEvent>[]>(
    () => [
      {
        field: 'received_at',
        headerName: 'Received',
        width: 150,
        sortable: false,
        renderCell: (p) => (
          <Tooltip title={absoluteTime(p.row.received_at)}>
            <span>{relativeTime(p.row.received_at)}</span>
          </Tooltip>
        ),
      },
      { field: 'type', headerName: 'Type', width: 110, sortable: false },
      {
        field: 'event_name',
        headerName: 'Event name',
        flex: 1,
        minWidth: 160,
        sortable: false,
        renderCell: (p) => <span>{p.row.event_name ?? <em>({p.row.type ?? 'event'})</em>}</span>,
      },
      {
        field: 'source_id',
        headerName: 'Source',
        width: 160,
        sortable: false,
        renderCell: (p) =>
          p.row.source_id ? (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace' }}>
                {p.row.source_id}
              </Typography>
              <CopyButton value={p.row.source_id} title="Copy source id" />
            </Stack>
          ) : (
            <span>—</span>
          ),
      },
      {
        field: 'processing_status',
        headerName: 'Status',
        width: 150,
        sortable: false,
        renderCell: (p) => <StatusChip status={p.row.processing_status ?? 'unknown'} />,
      },
      {
        field: 'event_id',
        headerName: 'Event ID',
        width: 180,
        sortable: false,
        renderCell: (p) =>
          p.row.event_id ? (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace' }}>
                {p.row.event_id}
              </Typography>
              <CopyButton value={p.row.event_id} title="Copy event id" />
            </Stack>
          ) : (
            <span>—</span>
          ),
      },
      {
        field: 'actions',
        headerName: '',
        width: 56,
        sortable: false,
        filterable: false,
        renderCell: (p) => (
          <IconButton size="small" aria-label="Row actions" onClick={(e) => openMenu(e, p.row)}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        ),
      },
    ],
    [],
  );

  const hasFilters = !!(applied.identifier_key || applied.event_name);

  const showEmpty = !query.isLoading && !query.isError && rows.length === 0;

  return (
    <>
      <PageHeader
        title="Events"
        description="Inspect and replay raw ingested events."
        action={
          <Tooltip title={canReplay ? '' : 'Requires event:replay'}>
            <span>
              <Button
                variant="outlined"
                startIcon={<ReplayIcon />}
                disabled={!canReplay}
                onClick={() => openReplayIdentDialog(applied.identifier_key ?? '')}
              >
                Replay by identifier
              </Button>
            </span>
          </Tooltip>
        }
      />

      {!canReplay && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your role can view events but cannot replay them. Replay actions require{' '}
          <code>event:replay</code>.
        </Alert>
      )}

      <Alert severity="warning" sx={{ mb: 2 }}>
        Raw event payloads are <strong>not masked server-side</strong> and may contain PII. The
        payload is hidden until you choose to reveal it. See docs/10-backend-gaps-and-caveats.md.
      </Alert>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'flex-end' }}
          >
            <TextField
              select
              label="Namespace"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              {NAMESPACES.map((ns) => (
                <MenuItem key={ns} value={ns}>
                  {ns}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Identifier value"
              placeholder="u1"
              value={identValue}
              onChange={(e) => setIdentValue(e.target.value)}
              helperText={
                identValue.trim() ? `identifier_key = ${namespace}:${identValue.trim()}` : ' '
              }
              sx={{ minWidth: 200 }}
            />
            <TextField
              label="Event name"
              placeholder="product_viewed"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              sx={{ minWidth: 200 }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={onApply}>
                Apply
              </Button>
              <Button
                variant="text"
                onClick={onClear}
                disabled={!hasFilters && !identValue && !eventName}
              >
                Clear
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {query.isError ? (
        <ErrorState
          title="Couldn't load events"
          message="The events request failed. It may be a transient error or a permissions issue (requires event:read)."
          onRetry={() => query.refetch()}
        />
      ) : showEmpty ? (
        <EmptyState
          title="No events found"
          description="Ingestion is asynchronous — recently sent events may take a few seconds to appear. Adjust filters or refresh."
          action={
            <Stack direction="row" spacing={1}>
              {hasFilters && (
                <Button variant="outlined" onClick={onClear}>
                  Clear filters
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={() => query.refetch()}
              >
                Refresh
              </Button>
            </Stack>
          }
        />
      ) : (
        <>
          <DataTable<RawEvent>
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id ?? row.event_id ?? ''}
            loading={query.isFetching}
            paginationMode="server"
            hideFooterPagination
            onRowClick={(p) => {
              setSelected(p.row);
              setRevealPayload(false);
            }}
            sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
          />

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="flex-end"
            sx={{ mt: 1.5 }}
          >
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => query.refetch()}
              disabled={query.isFetching}
            >
              Refresh
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="body2" color="text.secondary">
              Page {cursorStack.length}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              disabled={cursorStack.length === 1 || query.isFetching}
              onClick={() => setCursorStack((s) => s.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={!nextCursor || query.isFetching}
              onClick={() => setCursorStack((s) => [...s, nextCursor])}
            >
              {nextCursor ? 'Next' : 'No more events'}
            </Button>
          </Stack>
        </>
      )}

      {/* Row-actions menu */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={closeMenu}>
        <MenuItem
          disabled={!canReplay || !menuRow?.id}
          onClick={() => {
            setReplayEvent(menuRow);
            closeMenu();
          }}
        >
          Replay this event
        </MenuItem>
        <MenuItem
          disabled={!canReplay || !menuRow?.identifier_key}
          onClick={() => {
            openReplayIdentDialog(menuRow?.identifier_key ?? '');
            closeMenu();
          }}
        >
          Replay all for identifier
        </MenuItem>
      </Menu>

      {/* Detail drawer */}
      <Drawer
        anchor="right"
        open={!!selected}
        onClose={() => setSelected(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 3 } }}
      >
        {selected && (
          <Stack spacing={2}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">
                {selected.event_name ?? selected.type ?? 'Event'}
              </Typography>
              <IconButton onClick={() => setSelected(null)} aria-label="Close details">
                <CloseIcon />
              </IconButton>
            </Stack>

            <Stack spacing={1}>
              <MetaRow label="Type" value={selected.type} />
              <MetaRow label="Status">
                <StatusChip status={selected.processing_status ?? 'unknown'} />
              </MetaRow>
              <MetaRow label="Identifier key" value={selected.identifier_key} mono />
              <MetaRow label="Source ID" value={selected.source_id} mono copyable />
              <MetaRow label="Event ID" value={selected.event_id} mono copyable />
              <MetaRow label="Row ID" value={selected.id} mono copyable />
              {selected.payload_hash && (
                <MetaRow label="Payload hash" value={selected.payload_hash} mono copyable />
              )}
              <MetaRow label="Timestamp" value={absoluteTime(selected.timestamp)} />
              <MetaRow
                label="Received"
                value={`${absoluteTime(selected.received_at)} (${relativeTime(selected.received_at)})`}
              />
              {selected.created_at && (
                <MetaRow label="Stored" value={absoluteTime(selected.created_at)} />
              )}
            </Stack>

            <Divider />

            <Box>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle2">Payload</Typography>
                {!revealPayload && (
                  <Button size="small" onClick={() => setRevealPayload(true)}>
                    Reveal payload
                  </Button>
                )}
              </Stack>
              {revealPayload ? (
                <JsonViewer value={selected.payload_json} />
              ) : (
                <Alert severity="info" variant="outlined">
                  Payload hidden to avoid incidental PII exposure. Click “Reveal payload” to view.
                </Alert>
              )}
            </Box>

            <Divider />

            <Tooltip title={canReplay ? '' : 'Requires event:replay'}>
              <span>
                <Button
                  variant="contained"
                  startIcon={<ReplayIcon />}
                  disabled={!canReplay || !selected.id}
                  onClick={() => setReplayEvent(selected)}
                >
                  Replay this event
                </Button>
              </span>
            </Tooltip>
          </Stack>
        )}
      </Drawer>

      {/* Replay one confirmation */}
      <ConfirmDialog
        open={!!replayEvent}
        title="Replay this event?"
        message="This event will be re-published into the pipeline. Downstream effects are asynchronous and won't appear instantly."
        confirmLabel="Replay"
        confirmColor="primary"
        loading={replayOneMut.isPending}
        onConfirm={doReplayOne}
        onClose={() => setReplayEvent(null)}
      />

      {/* Replay by identifier dialog */}
      <Dialog
        open={identDialogOpen}
        onClose={() => setIdentDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Replay all events for an identifier</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Re-publishes every matching event into the pipeline (up to the cap). Processing is
              asynchronous.
            </Typography>
            <TextField
              label="Identifier key"
              placeholder="user_id:u1"
              value={identDialogKey}
              onChange={(e) => setIdentDialogKey(e.target.value)}
              helperText="Format namespace:value, e.g. user_id:u1"
            />
            <TextField
              label="Max events"
              type="number"
              value={identDialogMax}
              onChange={(e) => setIdentDialogMax(Number(e.target.value) || DEFAULT_REPLAY_MAX)}
              inputProps={{ min: 1 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIdentDialogOpen(false)} disabled={replayIdentMut.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={doReplayIdentifier}
            disabled={!identDialogKey.trim() || replayIdentMut.isPending}
          >
            Replay
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function MetaRow({
  label,
  value,
  children,
  mono = false,
  copyable = false,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
  mono?: boolean;
  copyable?: boolean;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
        {label}
      </Typography>
      {children ?? (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}
          >
            {value || '—'}
          </Typography>
          {copyable && value && <CopyButton value={value} title={`Copy ${label}`} />}
        </Stack>
      )}
    </Stack>
  );
}
