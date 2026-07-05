import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { enqueueSnackbar } from 'notistack';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/RefreshOutlined';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { StatusChip } from '@/components/StatusChip';
import { JsonViewer } from '@/components/JsonViewer';
import { CopyButton } from '@/components/CopyButton';
import { DataTable, type GridColDef } from '@/components/DataTable';
import { relativeTime } from '@/lib/format/datetime';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  useGetAdminV1TenantsTenantIDSegmentsSegmentID,
  useGetAdminV1TenantsTenantIDSegmentsSegmentIDMembers,
  useGetAdminV1TenantsTenantIDSegmentsSegmentIDDestinations,
  usePutAdminV1TenantsTenantIDSegmentsSegmentID,
} from '@/lib/api/generated/segments/segments';
import type {
  Segment,
  Rule,
  GetAdminV1TenantsTenantIDSegmentsSegmentIDMembers200MembersItem as MemberItem,
  GetAdminV1TenantsTenantIDSegmentsSegmentIDDestinations200DestinationsItem as DestinationItem,
} from '@/lib/api/generated/model';
import { RuleBuilder, createDefaultRule, validateRule } from './RuleBuilder';

/**
 * SegmentDetailScreen — read a segment by :segmentId (name, status, current rule),
 * with members and wired-destinations tabs and an edit mode reusing RuleBuilder.
 * Editing PUTs a new immutable version. See docs/screens/06-segments-and-rule-builder.md.
 */
export function SegmentDetailScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const { segmentId = '' } = useParams();
  const [tab, setTab] = useState('rule');

  const canReadDest = can('destination:read');
  const canWrite = can('segment:write');

  const segQuery = useGetAdminV1TenantsTenantIDSegmentsSegmentID(tenantId, segmentId, {
    query: { enabled: !!segmentId },
  });
  const segment = segQuery.data;

  return (
    <>
      <PageHeader
        title={segment?.name ?? 'Segment'}
        description={segmentId}
        action={
          <Button component={RouterLink} to={`/t/${tenantId}/segments`} variant="outlined">
            Back to segments
          </Button>
        }
      />

      {segQuery.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {segQuery.isError && (
        <ErrorState
          title="Couldn't load segment"
          message="The segment may not exist, or you lack access to this tenant."
          onRetry={() => segQuery.refetch()}
        />
      )}

      {!segQuery.isLoading && !segQuery.isError && !segment && (
        <EmptyState
          title="Segment not found"
          description="No segment matches this ID in the current tenant."
        />
      )}

      {segment && (
        <>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap">
            <StatusChip status={segment.status ?? 'unknown'} />
            {segment.current_version !== undefined && (
              <Typography variant="body2" color="text.secondary">
                Current version: v{segment.current_version}
              </Typography>
            )}
            {segment.current_version_id && (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  {segment.current_version_id}
                </Typography>
                <CopyButton value={segment.current_version_id} title="Copy version ID" />
              </Stack>
            )}
          </Stack>

          <Tabs
            value={tab}
            onChange={(_, v: string) => setTab(v)}
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab value="rule" label="Rule" />
            <Tab value="members" label="Members" />
            <Tab value="destinations" label="Destinations" />
            <Tab value="edit" label="Edit" />
          </Tabs>

          {tab === 'rule' && <RulePanel segment={segment} />}
          {tab === 'members' && <MembersPanel tenantId={tenantId} segmentId={segmentId} />}
          {tab === 'destinations' &&
            (canReadDest ? (
              <DestinationsPanel tenantId={tenantId} segmentId={segmentId} />
            ) : (
              <Alert severity="info">
                Viewing wired destinations requires <code>destination:read</code>.
              </Alert>
            ))}
          {tab === 'edit' && (
            <EditPanel
              tenantId={tenantId}
              segmentId={segmentId}
              segment={segment}
              canWrite={canWrite}
              onSaved={() => {
                setTab('rule');
                segQuery.refetch();
              }}
            />
          )}
        </>
      )}
    </>
  );
}

function RulePanel({ segment }: { segment: Segment }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Current rule
        </Typography>
        {segment.rule ? (
          <JsonViewer value={segment.rule} />
        ) : (
          <EmptyState title="No rule" description="This segment has no rule definition." />
        )}
      </CardContent>
    </Card>
  );
}

function MembersPanel({ tenantId, segmentId }: { tenantId: string; segmentId: string }) {
  const q = useGetAdminV1TenantsTenantIDSegmentsSegmentIDMembers(tenantId, segmentId, {
    query: { enabled: !!segmentId },
  });
  const members = q.data?.members ?? [];

  const columns: GridColDef<MemberItem>[] = [
    {
      field: 'customer_profile_id',
      headerName: 'Profile',
      flex: 1,
      minWidth: 260,
      renderCell: (p) =>
        p.row.customer_profile_id ? (
          <Link component={RouterLink} to={`/t/${tenantId}/profiles/${p.row.customer_profile_id}`}>
            {p.row.customer_profile_id}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 140,
      renderCell: (p) => (p.row.status ? <StatusChip status={p.row.status} /> : '—'),
    },
    {
      field: 'entered_at',
      headerName: 'Entered',
      width: 200,
      renderCell: (p) => relativeTime(p.row.entered_at),
    },
  ];

  if (q.isError) {
    return <ErrorState title="Couldn't load members" onRetry={() => q.refetch()} />;
  }
  if (!q.isLoading && members.length === 0) {
    return (
      <EmptyState
        title="No members yet"
        description="Segments are evaluated asynchronously — refresh in a moment."
        action={
          <Button startIcon={<RefreshIcon />} onClick={() => q.refetch()}>
            Refresh
          </Button>
        }
      />
    );
  }

  return (
    <Stack spacing={1}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => q.refetch()}>
          Refresh
        </Button>
      </Box>
      <DataTable<MemberItem>
        rows={members}
        columns={columns}
        loading={q.isLoading}
        getRowId={(r) => r.customer_profile_id ?? `${r.segment_id}-${r.entered_at}`}
      />
    </Stack>
  );
}

function DestinationsPanel({ tenantId, segmentId }: { tenantId: string; segmentId: string }) {
  const q = useGetAdminV1TenantsTenantIDSegmentsSegmentIDDestinations(tenantId, segmentId, {
    query: { enabled: !!segmentId },
  });
  const rows = q.data?.destinations ?? [];

  const columns: GridColDef<DestinationItem>[] = [
    {
      field: 'name',
      headerName: 'Destination',
      flex: 1,
      minWidth: 200,
      renderCell: (p) =>
        p.row.destination_id ? (
          <Link component={RouterLink} to={`/t/${tenantId}/destinations/${p.row.destination_id}`}>
            {p.row.name ?? p.row.destination_id}
          </Link>
        ) : (
          (p.row.name ?? '—')
        ),
    },
    { field: 'type', headerName: 'Type', width: 120 },
    {
      field: 'destination_status',
      headerName: 'Dest. status',
      width: 150,
      renderCell: (p) =>
        p.row.destination_status ? <StatusChip status={p.row.destination_status} /> : '—',
    },
    {
      field: 'subscription_status',
      headerName: 'Subscription',
      width: 150,
      renderCell: (p) =>
        p.row.subscription_status ? <StatusChip status={p.row.subscription_status} /> : '—',
    },
  ];

  if (q.isError) {
    return <ErrorState title="Couldn't load destinations" onRetry={() => q.refetch()} />;
  }
  if (!q.isLoading && rows.length === 0) {
    return (
      <EmptyState
        title="No destinations wired"
        description="Connect this segment to a destination from the Destinations screen."
      />
    );
  }

  return (
    <DataTable<DestinationItem>
      rows={rows}
      columns={columns}
      loading={q.isLoading}
      getRowId={(r) => r.subscription_id ?? r.destination_id ?? r.name ?? ''}
    />
  );
}

function EditPanel({
  tenantId,
  segmentId,
  segment,
  canWrite,
  onSaved,
}: {
  tenantId: string;
  segmentId: string;
  segment: Segment;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(segment.description ?? '');
  const [rule, setRule] = useState<Rule>(() => segment.rule ?? createDefaultRule());
  const [ruleError, setRuleError] = useState<string | null>(null);
  const putMut = usePutAdminV1TenantsTenantIDSegmentsSegmentID();

  const onSave = async () => {
    const err = validateRule(rule);
    setRuleError(err);
    if (err) {
      enqueueSnackbar('Fix the rule before saving', { variant: 'error' });
      return;
    }
    try {
      await putMut.mutateAsync({
        tenantID: tenantId,
        segmentID: segmentId,
        data: { description: description || undefined, rule },
      });
      enqueueSnackbar(
        'Saved — a new segment version was created; members re-evaluate asynchronously',
        { variant: 'success' },
      );
      onSaved();
    } catch {
      enqueueSnackbar('Failed to save segment', { variant: 'error' });
    }
  };

  if (!canWrite) {
    return (
      <Alert severity="info">
        Editing a segment requires <code>segment:write</code>. Your role is read-only.
      </Alert>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
      <Stack spacing={3}>
        <Alert severity="info">
          Saving edits creates a new immutable version and updates the current-version pointer;
          prior versions remain in history. The segment name can't be changed here.
        </Alert>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Details
            </Typography>
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Rule
            </Typography>
            {ruleError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {ruleError}
              </Alert>
            )}
            <RuleBuilder
              value={rule}
              onChange={(r) => {
                setRule(r);
                setRuleError(null);
              }}
            />
          </CardContent>
        </Card>
        <Box>
          <Button variant="contained" onClick={onSave} disabled={putMut.isPending}>
            Save new version
          </Button>
        </Box>
      </Stack>

      <Card sx={{ position: { lg: 'sticky' }, top: 16, alignSelf: 'start' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Rule JSON
          </Typography>
          <JsonViewer value={rule} />
        </CardContent>
      </Card>
    </Box>
  );
}
