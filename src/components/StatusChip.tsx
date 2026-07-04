import { Chip, type ChipProps } from '@mui/material';

type Color = ChipProps['color'];

/** Maps backend status enums → chip colors. See docs/06-design-system.md. */
const STATUS_COLOR: Record<string, Color> = {
  // generic
  active: 'success',
  disabled: 'default',
  // consent
  granted: 'success',
  denied: 'error',
  unknown: 'default',
  // activation task / delivery
  pending: 'warning',
  sending: 'info',
  succeeded: 'success',
  failed_retryable: 'warning',
  failed_permanent: 'error',
  dlq: 'error',
  skipped: 'default',
  // dlq
  open: 'warning',
  retried: 'info',
  discarded: 'default',
};

export function StatusChip({ status }: { status: string }) {
  return (
    <Chip
      size="small"
      label={status}
      color={STATUS_COLOR[status] ?? 'default'}
      variant={STATUS_COLOR[status] ? 'filled' : 'outlined'}
    />
  );
}
