import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { enqueueSnackbar } from 'notistack';
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
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { usePostAdminV1TenantsTenantIDSources } from '@/lib/api/generated/tenants-sources/tenants-sources';
import { usePostAdminV1TenantsTenantIDSourcesSourceIDRotateKey } from '@/lib/api/generated/tenants-sources/tenants-sources';

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
});
type CreateForm = z.infer<typeof createSchema>;

/**
 * Sources — provision data sources (ingest API keys) and rotate them.
 * NOTE (backend gap): there is no list-sources endpoint, so this screen provides
 * create + rotate-by-ID rather than a table. See docs/screens/03-sources.md and
 * docs/10-backend-gaps-and-caveats.md.
 */
export function SourcesScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const canWrite = can('source:write');

  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [rotateId, setRotateId] = useState('');
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);

  const createMut = usePostAdminV1TenantsTenantIDSources();
  const rotateMut = usePostAdminV1TenantsTenantIDSourcesSourceIDRotateKey();

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
    } catch {
      enqueueSnackbar('Failed to rotate key', { variant: 'error' });
    }
  };

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

      <Alert severity="warning" sx={{ mb: 3 }}>
        The backend has no list-sources endpoint yet, so existing sources can't be shown here. Use
        the source ID captured at creation to rotate a key. (See
        docs/10-backend-gaps-and-caveats.md.)
      </Alert>

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
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Rotating immediately invalidates the current key. The replacement is shown once.
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Source ID (UUID)"
                value={rotateId}
                onChange={(e) => setRotateId(e.target.value)}
                disabled={!canWrite}
              />
              <Button
                variant="outlined"
                color="warning"
                disabled={!canWrite || !rotateId.trim() || rotateMut.isPending}
                onClick={() => setRotateConfirmOpen(true)}
                sx={{ alignSelf: 'flex-start' }}
              >
                Rotate key
              </Button>
            </Stack>
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
