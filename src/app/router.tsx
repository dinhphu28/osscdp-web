/* eslint-disable react-refresh/only-export-components -- route config module, not a fast-refresh boundary */
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { TenantProvider } from '@/lib/tenant/TenantProvider';
import { AppLayout } from './AppLayout';
import { Placeholder } from '@/components/Placeholder';
import { ConnectScreen } from '@/features/connect/ConnectScreen';
import { SelectTenantScreen } from '@/features/connect/SelectTenantScreen';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { SourcesScreen } from '@/features/sources/SourcesScreen';
import { EventsScreen } from '@/features/events/EventsScreen';
import { ProfilesScreen } from '@/features/profiles/ProfilesScreen';
import { Customer360Screen } from '@/features/profiles/Customer360Screen';
import { SegmentsScreen } from '@/features/segments/SegmentsScreen';
import { SegmentEditorScreen } from '@/features/segments/SegmentEditorScreen';
import { SegmentDetailScreen } from '@/features/segments/SegmentDetailScreen';
import { DestinationsScreen } from '@/features/activation/DestinationsScreen';
import { DestinationDetailScreen } from '@/features/activation/DestinationDetailScreen';
import { DlqScreen } from '@/features/dlq/DlqScreen';
import { AdministrationScreen } from '@/features/administration/AdministrationScreen';
import { AuditScreen } from '@/features/audit/AuditScreen';

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
      { path: 'sources', element: <SourcesScreen /> },
      { path: 'events', element: <EventsScreen /> },
      { path: 'profiles', element: <ProfilesScreen /> },
      { path: 'profiles/:canonicalUserId', element: <Customer360Screen /> },
      { path: 'segments', element: <SegmentsScreen /> },
      { path: 'segments/new', element: <SegmentEditorScreen /> },
      { path: 'segments/:segmentId', element: <SegmentDetailScreen /> },
      { path: 'destinations', element: <DestinationsScreen /> },
      { path: 'destinations/:destinationId', element: <DestinationDetailScreen /> },
      { path: 'dlq', element: <DlqScreen /> },
      { path: 'audit', element: <AuditScreen /> },
      { path: 'administration', element: <AdministrationScreen /> },
      {
        path: '*',
        element: <Placeholder title="Not found" docPath="docs/screens/00-screen-map.md" />,
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
