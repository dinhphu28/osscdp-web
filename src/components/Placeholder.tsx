import { Link as RouterLink } from 'react-router-dom';
import { Link, Typography } from '@mui/material';
import { PageHeader } from './PageHeader';
import { EmptyState } from './EmptyState';

/**
 * Scaffold placeholder for screens not yet implemented. Each links to its spec
 * under docs/screens/. Remove as real screens land (see docs/09-build-roadmap.md).
 */
export function Placeholder({ title, docPath }: { title: string; docPath: string }) {
  return (
    <>
      <PageHeader title={title} description="Not yet implemented — scaffold placeholder." />
      <EmptyState
        title={`${title} — coming soon`}
        description="This screen is fully specified in the docs and ready to build."
        action={
          <Typography variant="body2">
            Spec:{' '}
            <Link component={RouterLink} to="#" onClick={(e) => e.preventDefault()}>
              {docPath}
            </Link>
          </Typography>
        }
      />
    </>
  );
}
