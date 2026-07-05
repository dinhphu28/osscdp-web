import { useState } from 'react';
import { IconButton, Tooltip, type IconButtonProps } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckIcon from '@mui/icons-material/CheckOutlined';

/** Copies `value` to the clipboard and briefly shows a check. See docs/06-design-system.md. */
export function CopyButton({
  value,
  title = 'Copy',
  size = 'small',
}: {
  value: string;
  title?: string;
  size?: IconButtonProps['size'];
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (insecure context) — no-op
    }
  };

  return (
    <Tooltip title={copied ? 'Copied!' : title}>
      <IconButton onClick={copy} size={size} aria-label={title}>
        {copied ? (
          <CheckIcon fontSize="inherit" color="success" />
        ) : (
          <ContentCopyIcon fontSize="inherit" />
        )}
      </IconButton>
    </Tooltip>
  );
}
