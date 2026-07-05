/* eslint-disable react-refresh/only-export-components -- route config module, not a fast-refresh boundary */
import { lazy } from 'react';
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthProvider';
import { TenantProvider } from '@/lib/tenant/TenantProvider';
import { AppLayout } from './AppLayout';
import { Placeholder } from '@/components/Placeholder';
import { ConnectScreen } from '@/features/connect/ConnectScreen';
import { SelectTenantScreen } from '@/features/connect/SelectTenantScreen';

/**
 * Tenant-scoped screens are code-split (each becomes its own chunk, loaded on
 * demand). This keeps the initial bundle — Connect + shell — small and moves the
 * heavy DataGrid/rule-builder screens out of the critical path. The AppLayout
 * chrome stays mounted while a child chunk loads (Suspense lives around the
 * Outlet). See docs/03-architecture.md §7.
 */
const named = <T extends string>(name: T) =>
  <M extends Record<T, React.ComponentType>>(m: M) => ({ default: m[name] });

const DashboardScreen = lazy(() =>
  import('@/features/dashboard/DashboardScreen').then(named('DashboardScreen')),
);
const SourcesScreen = lazy(() =>
  import('@/features/sources/SourcesScreen').then(named('SourcesScreen')),
);
const EventsScreen = lazy(() => import('@/features/events/EventsScreen').then(named('EventsScreen')));
const ProfilesScreen = lazy(() =>
  import('@/features/profiles/ProfilesScreen').then(named('ProfilesScreen')),
);
const Customer360Screen = lazy(() =>
  import('@/features/profiles/Customer360Screen').then(named('Customer360Screen')),
);
const SegmentsScreen = lazy(() =>
  import('@/features/segments/SegmentsScreen').then(named('SegmentsScreen')),
);
const SegmentEditorScreen = lazy(() =>
  import('@/features/segments/SegmentEditorScreen').then(named('SegmentEditorScreen')),
);
const SegmentDetailScreen = lazy(() =>
  import('@/features/segments/SegmentDetailScreen').then(named('SegmentDetailScreen')),
);
const DestinationsScreen = lazy(() =>
  import('@/features/activation/DestinationsScreen').then(named('DestinationsScreen')),
);
const DestinationDetailScreen = lazy(() =>
  import('@/features/activation/DestinationDetailScreen').then(named('DestinationDetailScreen')),
);
const DlqScreen = lazy(() => import('@/features/dlq/DlqScreen').then(named('DlqScreen')));
const AdministrationScreen = lazy(() =>
  import('@/features/administration/AdministrationScreen').then(named('AdministrationScreen')),
);
const AuditScreen = lazy(() => import('@/features/audit/AuditScreen').then(named('AuditScreen')));

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
