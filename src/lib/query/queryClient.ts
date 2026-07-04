import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client. The pipeline is asynchronous, so we keep a short
 * staleTime and do NOT retry auth/permission failures. See docs/04-api-integration.md.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        // Never retry auth/permission/not-found; give transient errors a couple of tries.
        if (status && [400, 401, 403, 404].includes(status)) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
