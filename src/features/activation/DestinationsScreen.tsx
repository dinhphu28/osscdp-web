import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldArray, useForm } from 'react-hook-form';
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
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreOutlined';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { PageHeader } from '@/components/PageHeader';
import { OneTimeSecretDialog } from '@/components/OneTimeSecretDialog';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { usePostAdminV1TenantsTenantIDDestinations } from '@/lib/api/generated/destinations/destinations';
import type { PostAdminV1TenantsTenantIDDestinationsBody } from '@/lib/api/generated/model';

/** Destination types the backend actually implements today; the rest are declared-but-deferred. */
const TYPE_OPTIONS: { value: string; label: string; enabled: boolean }[] = [
  { value: 'webhook', label: 'Webhook', enabled: true },
  { value: 'kafka', label: 'Kafka', enabled: true },
  { value: 'push', label: 'Push (coming soon)', enabled: false },
  { value: 'email', label: 'Email (coming soon)', enabled: false },
  { value: 'crm', label: 'CRM (coming soon)', enabled: false },
  { value: 'ads', label: 'Ads (coming soon)', enabled: false },
  { value: 'warehouse', label: 'Warehouse (coming soon)', enabled: false },
];

const CHANNEL_OPTIONS = ['email', 'sms', 'push', 'ads', 'webhook'] as const;
const PURPOSE_OPTIONS = ['marketing', 'analytics', 'personalization', 'transactional'] as const;

const numericString = z
  .string()
  .optional()
  .refine((v) => !v || /^\d+$/.test(v.trim()), 'Must be a whole number');

const createSchema = z
  .object({
    type: z.enum(['webhook', 'kafka']),
    name: z.string().min(1, 'Name is required'),
    secret: z.string().optional(),
    channel: z.string().optional(),
    purpose: z.string().optional(),
    // webhook
    url: z.string().optional(),
    method: z.enum(['POST', 'PUT']),
    headers: z.array(z.object({ key: z.string(), value: z.string() })),
    timeout_ms: numericString,
    max_retries: numericString,
    // kafka
    topic: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'webhook' && !val.url?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'URL is required' });
    }
    if (val.type === 'kafka' && !val.topic?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['topic'], message: 'Topic is required' });
    }
  });
type CreateForm = z.infer<typeof createSchema>;

/**
 * Activation / Destinations — create a destination (webhook or kafka) and open an existing one by ID.
 * NOTE (backend gap): there is no list-destinations endpoint, so this screen provides
 * create + open-by-ID rather than a table. See docs/screens/07-activation-destinations.md and
 * docs/10-backend-gaps-and-caveats.md.
 */
export function DestinationsScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const navigate = useNavigate();
  const canWrite = can('destination:write');

  const [openId, setOpenId] = useState('');
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);

  const createMut = usePostAdminV1TenantsTenantIDDestinations();

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      type: 'webhook',
      name: '',
      secret: '',
      channel: '',
      purpose: '',
      url: '',
      method: 'POST',
      headers: [],
      timeout_ms: '5000',
      max_retries: '5',
      topic: '',
    },
  });
  const headers = useFieldArray({ control: form.control, name: 'headers' });
  const type = form.watch('type');

  const onOpen = () => {
    const id = openId.trim();
    if (!id) return;
    navigate(`/t/${tenantId}/destinations/${id}`);
  };

  const onCreate = async (values: CreateForm) => {
    const config: Record<string, unknown> =
      values.type === 'webhook'
        ? {
            url: values.url?.trim(),
            method: values.method,
            ...(values.timeout_ms?.trim() ? { timeout_ms: Number(values.timeout_ms) } : {}),
            ...(values.max_retries?.trim() ? { max_retries: Number(values.max_retries) } : {}),
            ...buildHeaders(values.headers),
          }
        : { topic: values.topic?.trim() };

    const body: PostAdminV1TenantsTenantIDDestinationsBody = {
      type: values.type,
      name: values.name.trim(),
      config,
      ...(values.secret?.trim() ? { secret: values.secret.trim() } : {}),
      ...(values.channel ? { channel: values.channel } : {}),
      ...(values.purpose ? { purpose: values.purpose } : {}),
    };

    try {
      const res = await createMut.mutateAsync({ tenantID: tenantId, data: body });
      // The create response does NOT return the secret today (write-only, encrypted at rest).
      // Guard defensively in case the backend ever surfaces it once.
      const returnedSecret = (res as { secret?: string }).secret;
      if (returnedSecret) {
        setSecret({ label: 'Destination signing secret', value: returnedSecret });
      } else if (values.secret?.trim()) {
        enqueueSnackbar('Destination created — the secret is write-only and cannot be retrieved', {
          variant: 'success',
        });
      } else {
        enqueueSnackbar(`Destination "${body.name}" created`, { variant: 'success' });
      }
      if (res.id) {
        navigate(`/t/${tenantId}/destinations/${res.id}`);
      }
    } catch {
      enqueueSnackbar('Failed to create destination', { variant: 'error' });
    }
  };

  return (
    <>
      <PageHeader
        title="Destinations"
        description="Create activation destinations (webhook / Kafka) and push segment-membership changes to external systems."
      />

      {!canWrite && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your role is read-only for destinations. Creating one requires{' '}
          <code>destination:write</code>.
        </Alert>
      )}

      <Alert severity="warning" sx={{ mb: 3 }}>
        The backend has no list-destinations endpoint yet, so existing destinations can't be shown
        as a table. Open one by its ID below, or reach it from a segment's destinations. (See
        docs/10-backend-gaps-and-caveats.md.)
      </Alert>

      <Box
        sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, mb: 3 }}
      >
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Create destination
            </Typography>
            <form onSubmit={form.handleSubmit(onCreate)} noValidate>
              <Stack spacing={2}>
                <TextField
                  select
                  label="Type"
                  {...form.register('type')}
                  value={type}
                  error={!!form.formState.errors.type}
                  helperText={form.formState.errors.type?.message}
                  disabled={!canWrite}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <MenuItem key={o.value} value={o.value} disabled={!o.enabled}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  label="Name"
                  {...form.register('name')}
                  error={!!form.formState.errors.name}
                  helperText={form.formState.errors.name?.message}
                  disabled={!canWrite}
                />

                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  }}
                >
                  <TextField
                    select
                    label="Channel (optional)"
                    {...form.register('channel')}
                    value={form.watch('channel')}
                    helperText="Consent routing — activation skips customers who denied this channel×purpose"
                    disabled={!canWrite}
                  >
                    <MenuItem value="">None</MenuItem>
                    {CHANNEL_OPTIONS.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Purpose (optional)"
                    {...form.register('purpose')}
                    value={form.watch('purpose')}
                    disabled={!canWrite}
                  >
                    <MenuItem value="">None</MenuItem>
                    {PURPOSE_OPTIONS.map((p) => (
                      <MenuItem key={p} value={p}>
                        {p}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                <TextField
                  label="Secret (optional, write-only)"
                  type="password"
                  {...form.register('secret')}
                  helperText="HMAC signing key for webhook deliveries. Stored encrypted; never returned by any GET — keep a copy."
                  disabled={!canWrite}
                />

                <Divider textAlign="left">
                  <Typography variant="overline" color="text.secondary">
                    {type === 'webhook' ? 'Webhook config' : 'Kafka config'}
                  </Typography>
                </Divider>

                {type === 'webhook' ? (
                  <>
                    <TextField
                      label="URL"
                      placeholder="https://example.com/hooks/cdp"
                      {...form.register('url')}
                      error={!!form.formState.errors.url}
                      helperText={form.formState.errors.url?.message}
                      disabled={!canWrite}
                    />
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 2,
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                      }}
                    >
                      <TextField
                        select
                        label="Method"
                        {...form.register('method')}
                        value={form.watch('method')}
                        disabled={!canWrite}
                      >
                        <MenuItem value="POST">POST</MenuItem>
                        <MenuItem value="PUT">PUT</MenuItem>
                      </TextField>
                      <TextField
                        label="Timeout (ms)"
                        type="number"
                        {...form.register('timeout_ms')}
                        error={!!form.formState.errors.timeout_ms}
                        helperText={form.formState.errors.timeout_ms?.message ?? 'default 5000'}
                        disabled={!canWrite}
                      />
                      <TextField
                        label="Max retries"
                        type="number"
                        {...form.register('max_retries')}
                        error={!!form.formState.errors.max_retries}
                        helperText={form.formState.errors.max_retries?.message ?? 'default 5'}
                        disabled={!canWrite}
                      />
                    </Box>

                    <Box>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ mb: 1 }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          Headers (optional)
                        </Typography>
                        <Button
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => headers.append({ key: '', value: '' })}
                          disabled={!canWrite}
                        >
                          Add header
                        </Button>
                      </Stack>
                      <Stack spacing={1}>
                        {headers.fields.map((field, i) => (
                          <Stack key={field.id} direction="row" spacing={1} alignItems="center">
                            <TextField
                              size="small"
                              label="Key"
                              {...form.register(`headers.${i}.key`)}
                              disabled={!canWrite}
                              sx={{ flex: 1 }}
                            />
                            <TextField
                              size="small"
                              label="Value"
                              {...form.register(`headers.${i}.value`)}
                              disabled={!canWrite}
                              sx={{ flex: 1 }}
                            />
                            <IconButton
                              aria-label="Remove header"
                              onClick={() => headers.remove(i)}
                              disabled={!canWrite}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  </>
                ) : (
                  <TextField
                    label="Topic"
                    placeholder="cdp.segment-membership"
                    {...form.register('topic')}
                    error={!!form.formState.errors.topic}
                    helperText={form.formState.errors.topic?.message}
                    disabled={!canWrite}
                  />
                )}

                <Button
                  type="submit"
                  variant="contained"
                  disabled={!canWrite || createMut.isPending}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Create destination
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>

        <Card sx={{ alignSelf: 'flex-start' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Open destination by ID
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Paste a destination ID (captured at creation or from a segment) to view its config,
              subscriptions and deliveries.
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Destination ID (UUID)"
                value={openId}
                onChange={(e) => setOpenId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onOpen()}
              />
              <Button
                variant="outlined"
                onClick={onOpen}
                disabled={!openId.trim()}
                sx={{ alignSelf: 'flex-start' }}
              >
                Open
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Accordion variant="outlined">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography fontWeight={600}>Receiver reference — webhook payload & signing</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" paragraph>
            When a customer enters or exits a subscribed segment, osscdp POSTs this body to the
            webhook <code>url</code> (the console does not receive it — this is for the receiving
            system):
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              mb: 2,
              p: 2,
              bgcolor: 'action.hover',
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: 12.5,
              overflow: 'auto',
            }}
          >
            {`{
  "type": "segment_membership_changed",
  "tenant_id": "…",
  "segment_id": "…",
  "customer": { "id": "…", "traits": {}, "computed_attributes": {} },
  "change": "…",
  "occurred_at": "…"
}`}
          </Box>
          <Typography variant="body2" component="div">
            <strong>Delivery headers</strong> sent on every webhook call:
            <ul>
              <li>
                <code>X-CDP-Signature</code>: <code>sha256=&lt;hmac(secret, body)&gt;</code>
              </li>
              <li>
                <code>Idempotency-Key</code>: dedupe key (treat as unique)
              </li>
              <li>
                <code>X-CDP-Tenant-Id</code>, <code>X-CDP-Event-Id</code>,{' '}
                <code>X-CDP-Destination-Id</code>
              </li>
            </ul>
            Receivers verify <code>X-CDP-Signature</code> as HMAC-SHA256 of the raw body using the
            shared <code>secret</code>.
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Retry/backoff: transient failures (HTTP 408/429/5xx) are retried with backoff 10s →
            15min, max 5 attempts, then dead-lettered (<code>dlq</code>). Permanent failures
            (400/401/403/404) are not retried. A circuit breaker may open per destination — that
            indicator is exposed as a Prometheus metric (<code>/metrics</code> is text, not JSON) so
            the console shows it as unavailable; use Grafana.
          </Typography>
        </AccordionDetails>
      </Accordion>

      <OneTimeSecretDialog
        open={!!secret}
        title="Copy this secret now"
        label={secret?.label ?? 'Secret'}
        secret={secret?.value ?? ''}
        description="This signing secret is shown once. It cannot be retrieved again — only replaced by editing the destination."
        onClose={() => setSecret(null)}
      />
    </>
  );
}

function buildHeaders(rows: { key: string; value: string }[]): {
  headers?: Record<string, string>;
} {
  const entries = rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value] as const);
  return entries.length ? { headers: Object.fromEntries(entries) } : {};
}
