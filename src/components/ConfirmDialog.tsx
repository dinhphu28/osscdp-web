import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';

/**
 * Confirmation dialog for destructive/irreversible actions. When `confirmPhrase`
 * is set, the user must type it exactly (e.g. the canonical_user_id for a GDPR
 * delete). See docs/06-design-system.md.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmColor = 'error',
  confirmPhrase,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: 'error' | 'primary' | 'warning';
  confirmPhrase?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const canConfirm = !confirmPhrase || typed === confirmPhrase;

  const handleClose = () => {
    setTyped('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>{message}</DialogContentText>
          {confirmPhrase && (
            <>
              <Alert severity="warning">
                This action is irreversible. Type <code>{confirmPhrase}</code> to confirm.
              </Alert>
              <TextField
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={confirmPhrase}
                autoFocus
                label="Confirmation"
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={onConfirm}
          disabled={!canConfirm || loading}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
