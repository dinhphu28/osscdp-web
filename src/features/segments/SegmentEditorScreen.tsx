import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { enqueueSnackbar } from 'notistack';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { PageHeader } from '@/components/PageHeader';
import { JsonViewer } from '@/components/JsonViewer';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { usePostAdminV1TenantsTenantIDSegments } from '@/lib/api/generated/segments/segments';
import type { Rule } from '@/lib/api/generated/model';
import { RuleBuilder, createDefaultRule, validateRule } from './RuleBuilder';

const metaSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});
type MetaForm = z.infer<typeof metaSchema>;

/**
 * SegmentEditorScreen — create a new rule-based audience (name, description, rule)
 * → POST /admin/v1/tenants/{tenantID}/segments (requires `segment:write`).
 * On success, navigates to the new segment's detail. See
 * docs/screens/06-segments-and-rule-builder.md.
 */
export function SegmentEditorScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const canWrite = can('segment:write');
  const navigate = useNavigate();

  const [rule, setRule] = useState<Rule>(() => createDefaultRule());
  const [ruleError, setRuleError] = useState<string | null>(null);

  const createMut = usePostAdminV1TenantsTenantIDSegments();
  const form = useForm<MetaForm>({
    resolver: zodResolver(metaSchema),
    defaultValues: { name: '', description: '' },
  });

  const onSubmit = async (values: MetaForm) => {
    const err = validateRule(rule);
    setRuleError(err);
    if (err) {
      enqueueSnackbar('Fix the rule before saving', { variant: 'error' });
      return;
    }
    try {
      const seg = await createMut.mutateAsync({
        tenantID: tenantId,
        data: { name: values.name, description: values.description || undefined, rule },
      });
      enqueueSnackbar(
        'Segment created — evaluation runs asynchronously; members may take a few seconds',
        { variant: 'success' },
      );
      navigate(seg.id ? `/t/${tenantId}/segments/${seg.id}` : `/t/${tenantId}/segments`);
    } catch {
      enqueueSnackbar('Failed to create segment', { variant: 'error' });
    }
  };

  if (!canWrite) {
    return (
      <>
        <PageHeader title="New segment" description="Create a rule-based audience." />
        <Alert severity="warning">
          Creating a segment requires <code>segment:write</code>. Your role is read-only.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New segment"
        description="Create a rule-based audience with the visual rule builder."
      />
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Details
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    label="Name"
                    {...form.register('name')}
                    error={!!form.formState.errors.name}
                    helperText={form.formState.errors.name?.message}
                  />
                  <TextField
                    label="Description"
                    {...form.register('description')}
                    multiline
                    minRows={2}
                  />
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Rule
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Build a nested AND/OR/NOT rule over profile and event fields. The behavioral
                  (time-window) leaf is beta and not yet supported by the backend.
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
              <Button type="submit" variant="contained" disabled={createMut.isPending}>
                Create segment
              </Button>
            </Box>
          </Stack>

          <Card sx={{ position: { lg: 'sticky' }, top: 16, alignSelf: 'start' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Rule JSON
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Exactly what will be posted as <code>rule</code>.
              </Typography>
              <JsonViewer value={rule} />
            </CardContent>
          </Card>
        </Box>
      </form>
    </>
  );
}
