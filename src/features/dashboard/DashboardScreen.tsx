import { Box, Card, CardContent, Typography } from '@mui/material';
import { PageHeader } from '@/components/PageHeader';
import { useTenant } from '@/lib/tenant/TenantProvider';

/**
 * Dashboard scaffold. Real metrics/health wiring is specified in
 * docs/screens/02-dashboard.md (note: /metrics is Prometheus text, not JSON —
 * embed/link Grafana; several aggregates are backend gaps).
 */
function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" fontWeight={600}>
          {value}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardScreen() {
  const { tenantId } = useTenant();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Tenant ${tenantId} — health & operability overview (scaffold).`}
      />
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
        }}
      >
        <MetricCard label="DLQ open" value="—" hint="GET .../dlq?status=open" />
        <MetricCard label="Sources" value="—" hint="TBD — list endpoint" />
        <MetricCard label="Segments" value="—" hint="TBD — list endpoint" />
        <MetricCard label="Processing lag" value="—" hint="Grafana / metrics" />
      </Box>
    </>
  );
}
