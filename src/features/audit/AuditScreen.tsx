import {
  Alert,
  AlertTitle,
  Box,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { PageHeader } from '@/components/PageHeader';
import { DataTable, type GridColDef } from '@/components/DataTable';

/**
 * Audit Log — BLOCKED (spec-only). The backend audit log is WRITE-ONLY; there is no
 * `GET /admin/v1/tenants/{tenantID}/audit` endpoint yet, so this screen cannot load data.
 * We ship a prominent blocked banner plus a disabled preview of the intended UI so the nav
 * entry works and expectations are set. NO network calls are made.
 * See docs/screens/10-audit-log.md and docs/10-backend-gaps-and-caveats.md (gaps #2 and #8).
 */

/** Intended columns once the read endpoint lands. Rendered empty as a preview only. */
const previewColumns: GridColDef[] = [
  { field: 'created_at', headerName: 'Time', flex: 1, minWidth: 160, sortable: false },
  { field: 'actor_type', headerName: 'Actor', flex: 1, minWidth: 120, sortable: false },
  { field: 'action', headerName: 'Action', flex: 1, minWidth: 120, sortable: false },
  { field: 'resource_type', headerName: 'Resource type', flex: 1, minWidth: 140, sortable: false },
  { field: 'resource_id', headerName: 'Resource ID', flex: 1.5, minWidth: 200, sortable: false },
  { field: 'ip_address', headerName: 'IP', flex: 1, minWidth: 120, sortable: false },
];

export function AuditScreen() {
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Review of privileged admin actions (compliance & incident response)."
      />

      <Alert severity="warning" sx={{ mb: 3 }}>
        <AlertTitle>Blocked — backend endpoint missing</AlertTitle>
        The audit log is currently <strong>write-only</strong>. There is no{' '}
        <code>GET /admin/v1/tenants/&#123;tenantID&#125;/audit</code> endpoint yet, so this screen
        cannot load data. This is a Phase 2 feature pending a backend read route. The preview below
        shows the intended UI only — no requests are made. See{' '}
        <Link href="../10-backend-gaps-and-caveats.md" underline="hover">
          docs/10-backend-gaps-and-caveats.md
        </Link>{' '}
        (gaps #2 and #8).
      </Alert>

      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Intended filters (disabled — preview)
      </Typography>
      <Box
        component="fieldset"
        disabled
        sx={{ border: 0, p: 0, m: 0, mb: 3 }}
        aria-label="Audit filters preview (disabled)"
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ flexWrap: 'wrap', rowGap: 2 }}
        >
          <TextField
            label="Actor"
            placeholder="actor_type / actor_id"
            size="small"
            disabled
            sx={{ minWidth: 200 }}
          />
          <TextField label="Action" select size="small" disabled value="" sx={{ minWidth: 160 }}>
            <MenuItem value="">All actions</MenuItem>
          </TextField>
          <TextField
            label="Resource type"
            select
            size="small"
            disabled
            value=""
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All resources</MenuItem>
          </TextField>
          <TextField
            label="From"
            type="datetime-local"
            size="small"
            disabled
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200 }}
          />
          <TextField
            label="To"
            type="datetime-local"
            size="small"
            disabled
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200 }}
          />
        </Stack>
      </Box>

      <DataTable
        rows={[]}
        columns={previewColumns}
        getRowId={(row: { id: string }) => row.id}
        disableColumnMenu
        hideFooter
        localeText={{ noRowsLabel: 'No data — the audit read endpoint does not exist yet.' }}
      />

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Once <code>GET .../audit</code> ships, clicking a row will open a before/after JSON diff
        viewer (<code>before_json</code> vs <code>after_json</code>) per entry. Note:{' '}
        <code>actor_id</code> is currently unpopulated, so attribution resolves only to{' '}
        <code>actor_type</code> (coarse) until the backend populates it.
      </Typography>
    </>
  );
}
