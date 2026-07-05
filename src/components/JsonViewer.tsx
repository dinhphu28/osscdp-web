import { Box } from '@mui/material';
import { CopyButton } from './CopyButton';

/** Read-only pretty-printed JSON with a copy button. See docs/06-design-system.md. */
export function JsonViewer({
  value,
  maxHeight = 420,
}: {
  value: unknown;
  maxHeight?: number | string;
}) {
  const text = safeStringify(value);
  return (
    <Box sx={{ position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}>
        <CopyButton value={text} title="Copy JSON" />
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          maxHeight,
          overflow: 'auto',
          bgcolor: 'action.hover',
          borderRadius: 1,
          fontFamily: 'monospace',
          fontSize: 12.5,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </Box>
    </Box>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
