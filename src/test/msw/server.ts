import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Shared MSW server for component tests. Lifecycle is wired in vitest.setup.ts. */
export const server = setupServer(...handlers);
