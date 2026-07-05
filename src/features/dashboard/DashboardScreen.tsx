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
import { useGetAdminV1TenantsTenantIDStats } from '@/lib/api/generated/admin/admin';
import { GetAdminV1TenantsTenantIDDlqStatus } from '@/lib/api/generated/model';

/**
 * Dashboard — at-a-glance health and operability for the selected tenant.
 *
 * Honesty over vanity metrics: only numbers cheaply available from admin endpoints
 * are rendered (backend liveness, DLQ open count, and the per-tenant stats counts for
 * Sources/Segments/Destinations/Profiles). A stat value of -1 means the backend reports
 * the count as unavailable and is rendered as "—". Processing lag lives in Prometheus
 * text / Grafana — that is still shown as "—" with a caption, never fabricated.
 * See docs/screens/02-dashboard.md and docs/10-backend-gaps-and-caveats.md.
 */

/** A stat count of -1 (or missing) means "unavailable" — render as an em dash, never fabricate. */
function formatStat(value: number | undefined): string {
  return value === undefined || value === -1 ? '—' : String(value);
}

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

/**
 * Sources / Segments / Destinations / Profiles counts from the per-tenant stats endpoint.
 * Every read role has source:read (which the endpoint requires), so no extra gating is needed.
 */
function StatsCards({ tenantId }: { tenantId: string }) {
  const stats = useGetAdminV1TenantsTenantIDStats(tenantId);

  const cards: { label: string; value: number | undefined }[] = [
    { label: 'Sources', value: stats.data?.sources },
    { label: 'Segments', value: stats.data?.segments },
    { label: 'Destinations', value: stats.data?.destinations },
    { label: 'Profiles', value: stats.data?.profiles },
  ];

  return (
    <>
      {cards.map((card) => (
        <MetricShell key={card.label} label={card.label} caption="GET .../stats">
          {stats.isLoading ? (
            <Skeleton variant="text" width={80} height={56} />
          ) : stats.isError ? (
            <ErrorState message="Couldn't load counts." onRetry={() => void stats.refetch()} />
          ) : (
            <Typography variant="h4" fontWeight={600}>
              {formatStat(card.value)}
            </Typography>
          )}
        </MetricShell>
      ))}
    </>
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
        <StatsCards tenantId={tenantId} />
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
