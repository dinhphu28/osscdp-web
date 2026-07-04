/* eslint-disable react-refresh/only-export-components -- route config module, not a fast-refresh boundary */
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { TenantProvider } from '@/lib/tenant/TenantProvider';
import { AppLayout } from './AppLayout';
import { Placeholder } from '@/components/Placeholder';
import { ConnectScreen } from '@/features/connect/ConnectScreen';
import { SelectTenantScreen } from '@/features/connect/SelectTenantScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/select-tenant' : '/connect'} replace />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/connect" replace />;
  return <>{children}</>;
}

/** Layout route: establishes tenant context from the URL param, guarded by auth. */
function TenantLayoutRoute() {
  const { isAuthenticated } = useAuth();
  const { tenantId } = useParams();
  if (!isAuthenticated) return <Navigate to="/connect" replace />;
  if (!tenantId) return <Navigate to="/select-tenant" replace />;
  return (
    <TenantProvider tenantId={tenantId}>
      <AppLayout />
    </TenantProvider>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/connect', element: <ConnectScreen /> },
  {
    path: '/select-tenant',
    element: (
      <RequireAuth>
        <SelectTenantScreen />
      </RequireAuth>
    ),
  },
  {
    path: '/t/:tenantId',
    element: <TenantLayoutRoute />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard', element: <DashboardScreen /> },
      {
        path: 'sources',
        element: <Placeholder title="Sources" docPath="docs/screens/03-sources.md" />,
      },
      {
        path: 'events',
        element: (
          <Placeholder title="Events Explorer" docPath="docs/screens/04-events-explorer.md" />
        ),
      },
      {
        path: 'profiles',
        element: <Placeholder title="Profiles" docPath="docs/screens/05-customer-360.md" />,
      },
      {
        path: 'profiles/:canonicalUserId',
        element: <Placeholder title="Customer 360" docPath="docs/screens/05-customer-360.md" />,
      },
      {
        path: 'segments',
        element: (
          <Placeholder title="Segments" docPath="docs/screens/06-segments-and-rule-builder.md" />
        ),
      },
      {
        path: 'segments/new',
        element: (
          <Placeholder title="New Segment" docPath="docs/screens/06-segments-and-rule-builder.md" />
        ),
      },
      {
        path: 'segments/:segmentId',
        element: (
          <Placeholder
            title="Segment Detail"
            docPath="docs/screens/06-segments-and-rule-builder.md"
          />
        ),
      },
      {
        path: 'destinations',
        element: (
          <Placeholder title="Destinations" docPath="docs/screens/07-activation-destinations.md" />
        ),
      },
      {
        path: 'destinations/:destinationId',
        element: (
          <Placeholder
            title="Destination Detail"
            docPath="docs/screens/07-activation-destinations.md"
          />
        ),
      },
      {
        path: 'dlq',
        element: <Placeholder title="DLQ Admin" docPath="docs/screens/08-dlq-admin.md" />,
      },
      {
        path: 'audit',
        element: <Placeholder title="Audit Log" docPath="docs/screens/10-audit-log.md" />,
      },
      {
        path: 'administration',
        element: <Placeholder title="Administration" docPath="docs/screens/09-administration.md" />,
      },
      {
        path: '*',
        element: <Placeholder title="Not found" docPath="docs/screens/00-screen-map.md" />,
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
