import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { useTenant } from '@/lib/tenant/TenantProvider';
import { relativeTime } from '@/lib/format/datetime';
import { useGetAdminV1TenantsTenantIDProfiles } from '@/lib/api/generated/profiles/profiles';
import type { GetAdminV1TenantsTenantIDProfilesParams } from '@/lib/api/generated/model';

type Mode = 'email' | 'phone';

/**
 * Customer 360 — search entry point. Look up a customer by email OR phone
 * (exactly one filter; the API returns 400 if neither is supplied) or open a
 * profile directly by its canonical_user_id. See docs/screens/05-customer-360.md.
 */
export function ProfilesScreen() {
  const { tenantId } = useTenant();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('email');
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState<GetAdminV1TenantsTenantIDProfilesParams | null>(null);
  const [directId, setDirectId] = useState('');

  const searchQuery = useGetAdminV1TenantsTenantIDProfiles(tenantId, submitted ?? undefined, {
    query: { enabled: !!submitted },
  });

  const canSubmit = value.trim().length > 0;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setSubmitted(mode === 'email' ? { email: v } : { phone: v });
  };

  const onOpenDirect = (e: React.FormEvent) => {
    e.preventDefault();
    const id = directId.trim();
    if (!id) return;
    navigate(`/t/${tenantId}/profiles/${encodeURIComponent(id)}`);
  };

  const profiles = searchQuery.data?.profiles ?? [];
  const isBadRequest = searchQuery.error?.response?.status === 400;

  return (
    <>
      <PageHeader
        title="Customer 360"
        description="Find a customer by email or phone, or open a profile directly by its canonical user ID."
      />

      <Box
        sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, mb: 3 }}
      >
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Search by email or phone
            </Typography>
            <form onSubmit={onSubmit} noValidate>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={mode}
                  onChange={(_, next: Mode | null) => next && setMode(next)}
                  aria-label="search mode"
                >
                  <ToggleButton value="email">Email</ToggleButton>
                  <ToggleButton value="phone">Phone</ToggleButton>
                </ToggleButtonGroup>
                <Box
                  component="input"
                  placeholder={mode === 'email' ? 'name@example.com' : '+849...'}
                  value={value}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
                  sx={{
                    flex: 1,
                    minWidth: 220,
                    p: 1.25,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    fontSize: 14,
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                  }}
                />
                <Button type="submit" variant="contained" disabled={!canSubmit}>
                  Search
                </Button>
              </Stack>
            </form>

            <Divider sx={{ my: 3 }} />

            <SearchResults
              tenantId={tenantId}
              hasSearched={!!submitted}
              isLoading={searchQuery.isLoading}
              isError={searchQuery.isError}
              isBadRequest={isBadRequest}
              profiles={profiles}
              onRetry={() => searchQuery.refetch()}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Open by canonical user ID
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Paste a <code>canonical_user_id</code> to jump straight to the profile.
            </Typography>
            <form onSubmit={onOpenDirect} noValidate>
              <Stack spacing={2}>
                <Box
                  component="input"
                  placeholder="canonical_user_id (UUID)"
                  value={directId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDirectId(e.target.value)}
                  sx={{
                    p: 1.25,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    fontSize: 14,
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                  }}
                />
                <Button
                  type="submit"
                  variant="outlined"
                  disabled={!directId.trim()}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Open profile
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>
      </Box>
    </>
  );
}

function SearchResults({
  tenantId,
  hasSearched,
  isLoading,
  isError,
  isBadRequest,
  profiles,
  onRetry,
}: {
  tenantId: string;
  hasSearched: boolean;
  isLoading: boolean;
  isError: boolean;
  isBadRequest: boolean;
  profiles: {
    canonical_user_id?: string;
    identity_cluster_id?: string;
    last_seen_at?: string | null;
  }[];
  onRetry: () => void;
}) {
  if (!hasSearched) {
    return (
      <Typography variant="body2" color="text.secondary">
        Enter an email or phone above to search. The customer pipeline is asynchronous — a newly
        seen customer may take a few seconds to appear.
      </Typography>
    );
  }

  if (isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (isBadRequest) {
    return <Alert severity="warning">Enter an email or a phone number to search.</Alert>;
  }

  if (isError) {
    return <ErrorState message="Failed to search profiles." onRetry={onRetry} />;
  }

  if (profiles.length === 0) {
    return (
      <EmptyState
        title="No matching customer"
        description="No profile matched that identifier (it may still be processing — try again shortly)."
      />
    );
  }

  return (
    <List disablePadding>
      {profiles.map((p, i) => {
        const cuid = p.canonical_user_id ?? '';
        return (
          <ListItemButton
            key={cuid || i}
            component={RouterLink}
            to={`/t/${tenantId}/profiles/${encodeURIComponent(cuid)}`}
            divider
          >
            <ListItemText
              primary={
                <Link component="span" underline="hover">
                  {cuid || '(unknown id)'}
                </Link>
              }
              secondary={`cluster ${p.identity_cluster_id ?? '—'} · last seen ${relativeTime(
                p.last_seen_at,
              )}`}
            />
          </ListItemButton>
        );
      })}
    </List>
  );
}
