import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { enqueueSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreOutlined';
import { PageHeader } from '@/components/PageHeader';
import { OneTimeSecretDialog } from '@/components/OneTimeSecretDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StatusChip } from '@/components/StatusChip';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { DataTable, type GridColDef } from '@/components/DataTable';
import { relativeTime } from '@/lib/format/datetime';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  useGetAdminV1TenantsTenantIDSources,
  getGetAdminV1TenantsTenantIDSourcesQueryKey,
  usePostAdminV1TenantsTenantIDSources,
  usePostAdminV1TenantsTenantIDSourcesSourceIDRotateKey,
} from '@/lib/api/generated/tenants-sources/tenants-sources';
import type { Source } from '@/lib/api/generated/model/source';

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
});
type CreateForm = z.infer<typeof createSchema>;

/**
 * Sources — list, provision (ingest API keys) and rotate data sources.
 * See docs/screens/03-sources.md.
 */
export function SourcesScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const canWrite = can('source:write');
  const queryClient = useQueryClient();

  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [rotateId, setRotateId] = useState('');
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);

  const q = useGetAdminV1TenantsTenantIDSources(tenantId);
  const createMut = usePostAdminV1TenantsTenantIDSources();
  const rotateMut = usePostAdminV1TenantsTenantIDSourcesSourceIDRotateKey();

  const invalidateSources = () =>
    queryClient.invalidateQueries({
      queryKey: getGetAdminV1TenantsTenantIDSourcesQueryKey(tenantId),
    });

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', type: 'server' },
  });

  const onCreate = async (values: CreateForm) => {
    try {
      const res = await createMut.mutateAsync({ tenantID: tenantId, data: values });
      if (res.api_key) {
        setSecret({ label: 'Ingest API key', value: res.api_key });
      }
      enqueueSnackbar(`Source "${values.name}" created`, { variant: 'success' });
      form.reset({ name: '', type: 'server' });
      await invalidateSources();
    } catch {
      enqueueSnackbar('Failed to create source', { variant: 'error' });
    }
  };

  const onRotate = async () => {
    setRotateConfirmOpen(false);
    try {
      const res = await rotateMut.mutateAsync({ tenantID: tenantId, sourceID: rotateId.trim() });
      if (res.api_key) {
        setSecret({ label: 'New ingest API key', value: res.api_key });
      }
      enqueueSnackbar('Key rotated — the previous key is now invalid', { variant: 'success' });
      setRotateId('');
      await invalidateSources();
    } catch {
      enqueueSnackbar('Failed to rotate key', { variant: 'error' });
    }
  };

  const columns: GridColDef<Source>[] = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
    { field: 'type', headerName: 'Type', width: 120 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => <StatusChip status={String(params.row.status ?? 'unknown')} />,
    },
    {
      field: 'created_at',
      headerName: 'Created',
      width: 150,
      renderCell: (params) => <span>{relativeTime(params.row.created_at)}</span>,
    },
    {
      field: 'id',
      headerName: 'ID',
      width: 170,
      sortable: false,
      renderCell: (params) => <CopyButton value={String(params.row.id ?? '')} title="Copy ID" />,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 140,
      sortable: false,
      renderCell: (params) => (
        <Button
          size="small"
          variant="outlined"
          color="warning"
          disabled={!canWrite || rotateMut.isPending}
          onClick={() => {
            setRotateId(String(params.row.id ?? ''));
            setRotateConfirmOpen(true);
          }}
        >
          Rotate key
        </Button>
      ),
    },
  ];

  const rows = q.data?.sources ?? [];

  return (
    <>
      <PageHeader
        title="Sources"
        description="Provision ingestion sources and hand off their one-time API keys."
      />

      {!canWrite && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your role is read-only for sources. Creating and rotating keys requires{' '}
          <code>source:write</code>.
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        {q.isError ? (
          <ErrorState message="Failed to load sources." onRetry={() => q.refetch()} />
        ) : !q.isLoading && rows.length === 0 ? (
          <EmptyState
            title="No sources yet"
            description="Create a source below to start ingesting events."
          />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id ?? ''}
            loading={q.isLoading}
          />
        )}
      </Box>

      <Box
        sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 3 }}
      >
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Create source
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
                <TextField
                  label="Type"
                  placeholder="server"
                  {...form.register('type')}
                  error={!!form.formState.errors.type}
                  helperText={form.formState.errors.type?.message ?? 'e.g. "server"'}
                  disabled={!canWrite}
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!canWrite || createMut.isPending}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Create source
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Rotate API key
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use the <strong>Rotate key</strong> action on a source row above. Rotating immediately
              invalidates the current key, and the replacement is shown once.
            </Typography>
          </CardContent>
        </Card>
      </Box>

      <Accordion variant="outlined">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>Instrumentation help — sending events</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" paragraph>
            Hand the ingest API key to the source application. It authenticates to the ingress API
            (not the admin console) using the key. The console never sends events itself.
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" component="div">
            <strong>Endpoints</strong> (base <code>{'{VITE_API_BASE_URL}'}</code>):
            <ul>
              <li>
                <code>POST /v1/events/track</code> — behavioral event
              </li>
              <li>
                <code>POST /v1/identify</code> — attach traits/identifiers
              </li>
              <li>
                <code>POST /v1/alias</code> — link two identifiers
              </li>
              <li>
                <code>POST /v1/events/batch</code> — up to 500 events
              </li>
            </ul>
            <strong>Auth header:</strong> <code>X-CDP-Api-Key: &lt;key&gt;</code> (or{' '}
            <code>Authorization: Bearer &lt;key&gt;</code>). Note: the CORS allowlist advertises{' '}
            <code>X-Api-Key</code>, but the server checks <code>X-CDP-Api-Key</code> — see
            docs/10-backend-gaps-and-caveats.md.
          </Typography>
        </AccordionDetails>
      </Accordion>

      <OneTimeSecretDialog
        open={!!secret}
        title="Copy this key now"
        label={secret?.label ?? 'API key'}
        secret={secret?.value ?? ''}
        description="This ingest API key is shown once. Hand it to the source application's engineers."
        onClose={() => setSecret(null)}
      />

      <ConfirmDialog
        open={rotateConfirmOpen}
        title="Rotate API key?"
        message="The current key stops working immediately. Any source still using it will start receiving 401s until updated."
        confirmLabel="Rotate key"
        confirmColor="warning"
        loading={rotateMut.isPending}
        onConfirm={onRotate}
        onClose={() => setRotateConfirmOpen(false)}
      />
    </>
  );
}
