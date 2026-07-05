import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/DashboardOutlined';
import SensorsIcon from '@mui/icons-material/SensorsOutlined';
import BubbleChartIcon from '@mui/icons-material/BubbleChartOutlined';
import PeopleIcon from '@mui/icons-material/PeopleOutlined';
import SegmentIcon from '@mui/icons-material/SegmentOutlined';
import SendIcon from '@mui/icons-material/SendOutlined';
import ReportProblemIcon from '@mui/icons-material/ReportProblemOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import DarkModeIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeIcon from '@mui/icons-material/LightModeOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import type { Permission } from '@/types';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useColorMode } from './providers';

const DRAWER_WIDTH = 240;

interface NavItem {
  label: string;
  segment: string;
  icon: React.ReactNode;
  perm: Permission;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', segment: 'dashboard', icon: <DashboardIcon />, perm: 'event:read' },
  { label: 'Sources', segment: 'sources', icon: <SensorsIcon />, perm: 'source:read' },
  { label: 'Events', segment: 'events', icon: <BubbleChartIcon />, perm: 'event:read' },
  { label: 'Profiles', segment: 'profiles', icon: <PeopleIcon />, perm: 'profile:read' },
  { label: 'Segments', segment: 'segments', icon: <SegmentIcon />, perm: 'segment:read' },
  { label: 'Destinations', segment: 'destinations', icon: <SendIcon />, perm: 'destination:read' },
  { label: 'DLQ', segment: 'dlq', icon: <ReportProblemIcon />, perm: 'dlq:read' },
  { label: 'Audit', segment: 'audit', icon: <HistoryIcon />, perm: 'audit:read' },
  {
    label: 'Administration',
    segment: 'administration',
    icon: <AdminPanelSettingsIcon />,
    perm: 'admin:write',
  },
];

export function AppLayout() {
  const { tenantId } = useTenant();
  const { role, can, disconnect } = useAuth();
  const { mode, toggle } = useColorMode();
  const navigate = useNavigate();

  const appName = import.meta.env.VITE_APP_NAME ?? 'osscdp console';
  const visibleItems = NAV_ITEMS.filter((item) => can(item.perm));

  const onDisconnect = () => {
    disconnect();
    navigate('/connect', { replace: true });
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        color="default"
        sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}
        elevation={0}
        variant="outlined"
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {appName}
          </Typography>
          <Chip size="small" label={`tenant: ${tenantId.slice(0, 8)}…`} variant="outlined" />
          <Box sx={{ flexGrow: 1 }} />
          {role && <Chip size="small" color="primary" label={role} />}
          <Tooltip title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}>
            <IconButton onClick={toggle} size="small">
              {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Disconnect (clear token)">
            <IconButton onClick={onDisconnect} size="small">
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {visibleItems.map((item) => (
              <ListItemButton
                key={item.segment}
                component={NavLink}
                to={`/t/${tenantId}/${item.segment}`}
                sx={{
                  '&.active': {
                    bgcolor: 'action.selected',
                    borderRight: 3,
                    borderColor: 'primary.main',
                  },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Suspense
          fallback={
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          }
        >
          <Outlet />
        </Suspense>
      </Box>
    </Box>
  );
}
