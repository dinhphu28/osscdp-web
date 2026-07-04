import type { ReactNode } from 'react';
import { Paper, Stack, Typography } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

/** Empty-state placeholder for data views. See docs/06-design-system.md. */
export function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Paper sx={{ p: 6 }}>
      <Stack spacing={1.5} alignItems="center" textAlign="center">
        <InboxOutlinedIcon color="disabled" sx={{ fontSize: 48 }} />
        <Typography variant="h6">{title}</Typography>
        {description && (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        )}
        {action}
      </Stack>
    </Paper>
  );
}
