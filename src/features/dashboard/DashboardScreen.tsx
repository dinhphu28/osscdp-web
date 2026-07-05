import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNewOutlined';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGetHealthz } from '@/lib/api/generated/ingress/ingress';
import { useGetAdminV1TenantsTenantIDDlq } from '@/lib/api/generated/dlq/dlq';
import { GetAdminV1TenantsTenantIDDlqStatus } from '@/lib/api/generated/model';

/**
 * Dashboard — at-a-glance health and operability for the selected tenant.
 *
 * Honesty over vanity metrics: only numbers cheaply available from admin endpoints
 * are rendered (backend liveness, DLQ open count). Sources/Segments/Destinations
 * counts have no list endpoint (backend gap) and processing lag lives in Prometheus
 * text / Grafana — those are shown as "—" with a caption, never fabricated.
 * See docs/screens/02-dashboard.md and docs/10-backend-gaps-and-caveats.md.
 */

function MetricShell({
  label,
  children,
  caption,
  action,
}: {
  label: string;
  children: ReactNode;
  caption?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        {children}
        {caption && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            {caption}
          </Typography>
        )}
      </CardContent>
      {action && <CardActions sx={{ px: 2, pb: 2, pt: 0 }}>{action}</CardActions>}
    </Card>
  );
}

/** Placeholder metric card for values with no JSON source yet (backend gap). */
function GapMetricCard({ label, caption }: { label: string; caption: string }) {
  return (
    <MetricShell label={label} caption={caption}>
      <Typography variant="h4" fontWeight={600} color="text.disabled">
        —
      </Typography>
    </MetricShell>
  );
}

function HealthCard() {
  const health = useGetHealthz({ query: { retry: false } });

  let body: ReactNode;
  if (health.isLoading) {
    body = <CircularProgress size={28} sx={{ mt: 1 }} />;
  } else if (health.isError) {
    body = <Chip label="failing" color="error" sx={{ mt: 0.5 }} />;
  } else {
    body = <Chip label="OK" color="success" sx={{ mt: 0.5 }} />;
  }

  return (
    <MetricShell
      label="Backend health"
      caption="GET /healthz (liveness)"
      action={
        health.isError ? (
          <Button size="small" onClick={() => void health.refetch()}>
            Retry
          </Button>
        ) : undefined
      }
    >
      <Box>{body}</Box>
    </MetricShell>
  );
}

function DlqOpenCard({ tenantId, canRead }: { tenantId: string; canRead: boolean }) {
  const dlq = useGetAdminV1TenantsTenantIDDlq(
    tenantId,
    { status: GetAdminV1TenantsTenantIDDlqStatus.open },
    { query: { enabled: canRead } },
  );

  if (!canRead) {
    // Permission missing → hide the card (not an error), per spec.
    return null;
  }

  if (dlq.isLoading) {
    return (
      <MetricShell label="DLQ open" caption="GET .../dlq?status=open">
        <Skeleton variant="text" width={80} height={56} />
      </MetricShell>
    );
  }

  if (dlq.isError) {
    return (
      <MetricShell label="DLQ open">
        <ErrorState message="Couldn't load the DLQ backlog." onRetry={() => void dlq.refetch()} />
      </MetricShell>
    );
  }

  const count = dlq.data?.events?.length ?? 0;

  return (
    <MetricShell
      label="DLQ open"
      caption={count === 0 ? 'No backlog — nothing to triage.' : 'Dead-lettered events to triage.'}
      action={
        <Button
          size="small"
          component={RouterLink}
          to={`/t/${tenantId}/dlq?status=open`}
          disabled={count === 0}
        >
          Open DLQ
        </Button>
      }
    >
      <Typography
        variant="h4"
        fontWeight={600}
        color={count === 0 ? 'success.main' : 'warning.main'}
      >
        {count}
      </Typography>
    </MetricShell>
  );
}

function QuickAction({
  label,
  to,
  perm,
  granted,
}: {
  label: string;
  to: string;
  perm: string;
  granted: boolean;
}) {
  if (granted) {
    return (
      <Button variant="outlined" component={RouterLink} to={to}>
        {label}
      </Button>
    );
  }
  return (
    <Tooltip title={`Requires ${perm}`}>
      <span>
        <Button variant="outlined" disabled>
          {label}
        </Button>
      </span>
    </Tooltip>
  );
}

export function DashboardScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Health and operability overview for the selected tenant."
        action={
          <Button
            variant="text"
            endIcon={<OpenInNewIcon />}
            href="http://localhost:3000"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Grafana
          </Button>
        }
      />

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
          mb: 3,
        }}
      >
        <HealthCard />
        <DlqOpenCard tenantId={tenantId} canRead={can('dlq:read')} />
        <GapMetricCard label="Sources" caption="no list endpoint (backend gap)" />
        <GapMetricCard label="Segments" caption="no list endpoint (backend gap)" />
        <GapMetricCard label="Destinations" caption="no list endpoint (backend gap)" />
        <GapMetricCard label="Processing lag" caption="see Grafana / /metrics (Prometheus text)" />
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Quick actions
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Shortcuts into common workflows. Actions your role can't perform are disabled.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <QuickAction
              label="Create source"
              to={`/t/${tenantId}/sources`}
              perm="source:write"
              granted={can('source:write')}
            />
            <QuickAction
              label="Look up profile"
              to={`/t/${tenantId}/profiles`}
              perm="profile:read"
              granted={can('profile:read')}
            />
            <QuickAction
              label="Create segment"
              to={`/t/${tenantId}/segments/new`}
              perm="segment:write"
              granted={can('segment:write')}
            />
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}
