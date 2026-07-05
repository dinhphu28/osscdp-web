import { DataGrid, type DataGridProps, type GridColDef } from '@mui/x-data-grid';
import { Paper } from '@mui/material';

export type { GridColDef };

/**
 * Thin wrapper over MUI X Data Grid with the console's defaults (compact density,
 * outlined surface, sensible page sizes). Pass server-mode props through for
 * cursor-paginated tables (events). See docs/06-design-system.md.
 */
export function DataTable<R extends object>(props: DataGridProps<R> & { minHeight?: number }) {
  const { minHeight = 240, sx, ...rest } = props;
  return (
    <Paper variant="outlined" sx={{ width: '100%' }}>
      <DataGrid
        density="compact"
        disableRowSelectionOnClick
        pageSizeOptions={[10, 25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        sx={{ border: 0, minHeight, ...sx }}
        {...rest}
      />
    </Paper>
  );
}
