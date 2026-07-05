import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import { CopyButton } from './CopyButton';

/**
 * Shows a plaintext secret returned by the backend EXACTLY ONCE (source API key,
 * admin token, destination secret). It cannot be retrieved again — the user must
 * copy it and confirm before closing. See docs/06-design-system.md.
 */
export function OneTimeSecretDialog({
  open,
  title,
  label,
  secret,
  description,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  secret: string;
  description?: string;
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  const handleClose = () => {
    setAcknowledged(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => reason !== 'backdropClick' && handleClose()}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="warning">
            This is shown <strong>once</strong> and cannot be retrieved again. Copy it now and store
            it securely.
          </Alert>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
          <Box>
            <Typography variant="overline" color="text.secondary">
              {label}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1.5,
                bgcolor: 'action.hover',
                borderRadius: 1,
                fontFamily: 'monospace',
                fontSize: 13,
                wordBreak: 'break-all',
              }}
            >
              <Box sx={{ flexGrow: 1 }}>{secret}</Box>
              <CopyButton value={secret} title="Copy secret" />
            </Box>
          </Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
            }
            label="I have copied and stored this value securely"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={handleClose} disabled={!acknowledged}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
