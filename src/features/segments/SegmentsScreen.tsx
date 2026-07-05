import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import { PageHeader } from '@/components/PageHeader';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Segments — entry point for rule-based audiences.
 * NOTE (backend gap): there is no list-segments endpoint, so this screen provides
 * create + open-by-ID instead of a table. See docs/screens/06-segments-and-rule-builder.md
 * and docs/10-backend-gaps-and-caveats.md.
 */
export function SegmentsScreen() {
  const { tenantId } = useTenant();
  const { can } = useAuth();
  const canWrite = can('segment:write');
  const navigate = useNavigate();

  const [openId, setOpenId] = useState('');

  const onOpen = () => {
    const id = openId.trim();
    if (id) navigate(`/t/${tenantId}/segments/${id}`);
  };

  return (
    <>
      <PageHeader
        title="Segments"
        description="Define rule-based audiences and wire them to destinations."
        action={
          <Button
            component={RouterLink}
            to={`/t/${tenantId}/segments/new`}
            variant="contained"
            startIcon={<AddIcon />}
            disabled={!canWrite}
          >
            Create segment
          </Button>
        }
      />

      {!canWrite && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Your role is read-only for segments. Creating and editing requires{' '}
          <code>segment:write</code>.
        </Alert>
      )}

      <Alert severity="warning" sx={{ mb: 3 }}>
        The backend has no list-segments endpoint yet, so existing segments can't be shown here.
        Open a segment by its ID, or create a new one. (See docs/10-backend-gaps-and-caveats.md.)
      </Alert>

      <Card sx={{ maxWidth: 560 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Open a segment
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Paste the segment ID captured at creation to view its rule, members and wired
            destinations.
          </Typography>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              label="Segment ID (UUID)"
              value={openId}
              onChange={(e) => setOpenId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpen();
              }}
              fullWidth
            />
            <Button
              variant="outlined"
              onClick={onOpen}
              disabled={!openId.trim()}
              sx={{ mt: 0.5, flexShrink: 0 }}
            >
              Open
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}
