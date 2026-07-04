import { Alert, AlertTitle, Button, Stack } from '@mui/material';

/** Error-state with retry for data views. See docs/06-design-system.md. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Stack spacing={2}>
      <Alert severity="error">
        <AlertTitle>{title}</AlertTitle>
        {message ?? 'The request failed. Please try again.'}
      </Alert>
      {onRetry && (
        <Button variant="outlined" onClick={onRetry} sx={{ alignSelf: 'flex-start' }}>
          Retry
        </Button>
      )}
    </Stack>
  );
}
