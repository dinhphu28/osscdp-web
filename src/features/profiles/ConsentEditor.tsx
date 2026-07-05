import { useState } from 'react';
import { enqueueSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { StatusChip } from '@/components/StatusChip';
import { ErrorState } from '@/components/ErrorState';
import { absoluteTime } from '@/lib/format/datetime';
import {
  useGetAdminV1TenantsTenantIDProfilesCanonicalUserIDConsent,
  usePutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsent,
  getGetAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentQueryKey,
} from '@/lib/api/generated/consent/consent';
import {
  PutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentBodyChannel as Channel,
  PutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentBodyPurpose as Purpose,
  PutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentBodyStatus as Status,
} from '@/lib/api/generated/model';
import type {
  PutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentBodyChannel,
  PutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentBodyPurpose,
  PutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentBodyStatus,
} from '@/lib/api/generated/model';

type ChannelT = PutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentBodyChannel;
type PurposeT = PutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentBodyPurpose;
type StatusT = PutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentBodyStatus;

const CHANNELS: ChannelT[] = [
  Channel.email,
  Channel.sms,
  Channel.push,
  Channel.ads,
  Channel.webhook,
];
const PURPOSES: PurposeT[] = [
  Purpose.marketing,
  Purpose.analytics,
  Purpose.personalization,
  Purpose.transactional,
];
const STATUSES: StatusT[] = [Status.granted, Status.denied, Status.unknown];

interface Cell {
  status: StatusT;
  source?: string;
  updatedAt?: string;
}

/**
 * Consent editor — a channel × purpose grid. Absence of a record = "unknown".
 * Read requires profile:read; editing a cell requires consent:write (gated by
 * the caller passing canWrite). See docs/screens/05-customer-360.md.
 */
export function ConsentEditor({
  tenantId,
  canonicalUserId,
  canWrite,
}: {
  tenantId: string;
  canonicalUserId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const consentQuery = useGetAdminV1TenantsTenantIDProfilesCanonicalUserIDConsent(
    tenantId,
    canonicalUserId,
  );
  const putMut = usePutAdminV1TenantsTenantIDProfilesCanonicalUserIDConsent();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  if (consentQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress />
      </Stack>
    );
  }

  if (consentQuery.isError) {
    return (
      <ErrorState
        message="Failed to load consent records."
        onRetry={() => consentQuery.refetch()}
      />
    );
  }

  const records = consentQuery.data?.consent ?? [];
  const cells = new Map<string, Cell>();
  for (const r of records) {
    if (!r.channel || !r.purpose) continue;
    const status = (STATUSES as string[]).includes(r.status ?? '')
      ? (r.status as StatusT)
      : Status.unknown;
    cells.set(`${r.channel}:${r.purpose}`, {
      status,
      source: r.source,
      updatedAt: r.updated_at,
    });
  }

  const cellFor = (channel: ChannelT, purpose: PurposeT): Cell =>
    cells.get(`${channel}:${purpose}`) ?? { status: Status.unknown };

  const onChange = async (channel: ChannelT, purpose: PurposeT, status: StatusT) => {
    const key = `${channel}:${purpose}`;
    setPendingKey(key);
    try {
      await putMut.mutateAsync({
        tenantID: tenantId,
        canonicalUserID: canonicalUserId,
        data: { channel, purpose, status, source: 'admin_console' },
      });
      enqueueSnackbar(`Consent updated: ${channel} · ${purpose} → ${status}`, {
        variant: 'success',
      });
      await queryClient.invalidateQueries({
        queryKey: getGetAdminV1TenantsTenantIDProfilesCanonicalUserIDConsentQueryKey(
          tenantId,
          canonicalUserId,
        ),
      });
    } catch {
      enqueueSnackbar('Failed to update consent', { variant: 'error' });
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Activation <strong>skips</strong> any channel/purpose marked <code>denied</code> — the task
        is recorded as <code>skipped</code>, not delivered. Absence of a record counts as{' '}
        <code>unknown</code>.
      </Alert>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Channel \ Purpose</TableCell>
              {PURPOSES.map((p) => (
                <TableCell key={p} sx={{ textTransform: 'capitalize' }}>
                  {p}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {CHANNELS.map((channel) => (
              <TableRow key={channel}>
                <TableCell sx={{ textTransform: 'capitalize', fontWeight: 600 }}>
                  {channel}
                </TableCell>
                {PURPOSES.map((purpose) => {
                  const key = `${channel}:${purpose}`;
                  const cell = cellFor(channel, purpose);
                  const busy = pendingKey === key && putMut.isPending;
                  const tip = cell.updatedAt
                    ? `Updated ${absoluteTime(cell.updatedAt)}${
                        cell.source ? ` · source: ${cell.source}` : ''
                      }`
                    : 'No record (defaults to unknown)';
                  return (
                    <TableCell key={purpose}>
                      <Tooltip title={tip}>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                          {canWrite ? (
                            <Select
                              size="small"
                              value={cell.status}
                              disabled={busy}
                              onChange={(e) =>
                                onChange(channel, purpose, e.target.value as StatusT)
                              }
                              sx={{ minWidth: 120 }}
                            >
                              {STATUSES.map((s) => (
                                <MenuItem key={s} value={s}>
                                  {s}
                                </MenuItem>
                              ))}
                            </Select>
                          ) : (
                            <StatusChip status={cell.status} />
                          )}
                          {busy && <CircularProgress size={16} />}
                        </Box>
                      </Tooltip>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {!canWrite && (
        <Typography variant="body2" color="text.secondary">
          Editing consent requires <code>consent:write</code>. Showing read-only values.
        </Typography>
      )}
    </Stack>
  );
}
