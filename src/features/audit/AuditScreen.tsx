import { useMemo, useState } from 'react';
import { Alert, Box, Button, Stack, Tooltip, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/RefreshOutlined';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { CopyButton } from '@/components/CopyButton';
import { DataTable, type GridColDef } from '@/components/DataTable';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { relativeTime, absoluteTime } from '@/lib/format/datetime';
import { useGetAdminV1TenantsTenantIDAudit } from '@/lib/api/generated/audit/audit';
import type { AuditEntry, GetAdminV1TenantsTenantIDAuditParams } from '@/lib/api/generated/model';

const PAGE_LIMIT = 50;

/**
 * Audit Log — review of privileged admin actions (compliance & incident response).
 *
 * Metadata-only: the backend never returns the before/after bodies (they may hold
 * traits/consent/secrets). Like the events list, this is a KEYSET-paginated resource:
 * paging is driven by the opaque `next_cursor` via a cursor stack (forward/back), not
 * numbered pages. See docs/screens/10-audit-log.md.
 */
export function AuditScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const canRead = can('audit:read');

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Review of privileged admin actions (compliance & incident response)."
      />

      {canRead ? (
        <AuditTable tenantId={tenantId} />
      ) : (
        <Alert severity="info">
          Your role cannot view the audit log. Access requires <code>audit:read</code>.
        </Alert>
      )}
    </>
  );
}

function AuditTable({ tenantId }: { tenantId: string }) {
  // Cursor stack: each entry is the cursor used for that page (first page = undefined).
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const currentCursor = cursorStack[cursorStack.length - 1];

  const params: GetAdminV1TenantsTenantIDAuditParams = {
    limit: PAGE_LIMIT,
    cursor: currentCursor,
  };

  const query = useGetAdminV1TenantsTenantIDAudit(tenantId, params);
  const rows = query.data?.entries ?? [];
  const nextCursor = query.data?.next_cursor ?? '';

  const columns = useMemo<GridColDef<AuditEntry>[]>(
    () => [
      {
        field: 'created_at',
        headerName: 'Time',
        width: 160,
        sortable: false,
        renderCell: (p) => (
          <Tooltip title={absoluteTime(p.row.created_at)}>
            <span>{relativeTime(p.row.created_at)}</span>
          </Tooltip>
        ),
      },
      { field: 'actor_type', headerName: 'Actor', width: 140, sortable: false },
      {
        field: 'action',
        headerName: 'Action',
        flex: 1,
        minWidth: 160,
        sortable: false,
      },
      {
        field: 'resource_type',
        headerName: 'Resource type',
        width: 160,
        sortable: false,
      },
      {
        field: 'resource_id',
        headerName: 'Resource ID',
        flex: 1,
        minWidth: 200,
        sortable: false,
        renderCell: (p) =>
          p.row.resource_id ? (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace' }}>
                {p.row.resource_id}
              </Typography>
              <CopyButton value={p.row.resource_id} title="Copy resource id" />
            </Stack>
          ) : (
            <span>—</span>
          ),
      },
    ],
    [],
  );

  const showEmpty = !query.isLoading && !query.isError && rows.length === 0;

  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load audit log"
        message="The audit request failed. It may be a transient error or a permissions issue (requires audit:read)."
        onRetry={() => query.refetch()}
      />
    );
  }

  if (showEmpty) {
    return (
      <EmptyState
        title="No audit entries yet."
        description="Privileged admin actions will appear here as they happen."
        action={
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => query.refetch()}>
            Refresh
          </Button>
        }
      />
    );
  }

  return (
    <>
      <DataTable<AuditEntry>
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id ?? `${row.resource_id ?? 'unknown'}-${row.created_at ?? ''}`}
        loading={query.isFetching}
        paginationMode="server"
        hideFooterPagination
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
          {nextCursor ? 'Next' : 'No more entries'}
        </Button>
      </Stack>
    </>
  );
}
