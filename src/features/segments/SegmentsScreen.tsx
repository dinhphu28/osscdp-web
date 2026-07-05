import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { StatusChip } from '@/components/StatusChip';
import { CopyButton } from '@/components/CopyButton';
import { DataTable, type GridColDef } from '@/components/DataTable';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGetAdminV1TenantsTenantIDSegments } from '@/lib/api/generated/segments/segments';
import type { Segment } from '@/lib/api/generated/model';

/**
 * Segments — entry point for rule-based audiences. Lists the tenant's segments in a
 * table; row click opens the segment detail. Create is gated by `segment:write`.
 * See docs/screens/06-segments-and-rule-builder.md.
 */
export function SegmentsScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const canWrite = can('segment:write');
  const navigate = useNavigate();

  const query = useGetAdminV1TenantsTenantIDSegments(tenantId);
  const segments = query.data?.segments ?? [];

  const [openId, setOpenId] = useState('');
  const onOpen = () => {
    const id = openId.trim();
    if (id) navigate(`/t/${tenantId}/segments/${id}`);
  };

  const columns: GridColDef<Segment>[] = [
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Stack sx={{ minWidth: 0 }}>
          <Typography variant="body2" noWrap>
            {params.row.name ?? '—'}
          </Typography>
          {params.row.description && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {params.row.description}
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (params) => (params.row.status ? <StatusChip status={params.row.status} /> : '—'),
    },
    {
      field: 'id',
      headerName: 'ID',
      width: 180,
      sortable: false,
      renderCell: (params) =>
        params.row.id ? (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace' }}>
              {params.row.id}
            </Typography>
            <CopyButton value={params.row.id} title="Copy segment ID" />
          </Stack>
        ) : (
          '—'
        ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 90,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Button
          size="small"
          component={RouterLink}
          to={`/t/${tenantId}/segments/${params.row.id}`}
          onClick={(e) => e.stopPropagation()}
          disabled={!params.row.id}
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Segments"
        description="Define rule-based audiences and wire them to destinations."
        action={
          <Button
            component={RouterLink}
            to={`/t/${tenantId}/segments/new`}
            variant="contained"
            startIcon={<AddIcon />}
            disabled={!canWrite}
          >
            Create segment
          </Button>
        }
      />

      {!canWrite && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your role is read-only for segments. Creating and editing requires{' '}
          <code>segment:write</code>.
        </Alert>
      )}

      {query.isError ? (
        <ErrorState message="Failed to load segments." onRetry={() => query.refetch()} />
      ) : !query.isLoading && segments.length === 0 ? (
        <EmptyState
          title="No segments yet"
          description="Create a rule-based audience to get started."
          action={
            canWrite ? (
              <Button
                component={RouterLink}
                to={`/t/${tenantId}/segments/new`}
                variant="contained"
                startIcon={<AddIcon />}
              >
                Create segment
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable<Segment>
          rows={segments}
          columns={columns}
          getRowId={(r) => r.id ?? ''}
          loading={query.isLoading}
          onRowClick={(params) => {
            if (params.row.id) navigate(`/t/${tenantId}/segments/${params.row.id}`);
          }}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      )}

      <Card variant="outlined" sx={{ mt: 3, maxWidth: 560 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Open by ID
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Have a segment ID from elsewhere? Jump straight to it.
          </Typography>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              label="Segment ID (UUID)"
              value={openId}
              onChange={(e) => setOpenId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpen();
              }}
              size="small"
              fullWidth
            />
            <Button
              variant="outlined"
              onClick={onOpen}
              disabled={!openId.trim()}
              sx={{ flexShrink: 0 }}
            >
              Open
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}
