import { defineConfig } from 'orval';

/**
 * Orval codegen — generates TypeScript types + TanStack Query v5 hooks from the
 * osscdp OpenAPI spec, wired through our shared Axios instance (auth + tenant +
 * error interceptors).
 *
 * Input: a vendored local copy of the backend spec at `openapi/osscdp.yaml`.
 * To regenerate from a running backend instead, point `input.target` at
 * `http://localhost:8080/openapi.yaml` (or `http://localhost:18080/openapi.yaml`
 * for the docker `stack-up` mapping).
 *
 * See docs/02-tech-stack.md §6 and docs/04-api-integration.md.
 */
export default defineConfig({
  osscdp: {
    input: {
      target: './openapi/osscdp.yaml',
    },
    output: {
      mode: 'tags-split', // one folder per OpenAPI tag
      target: 'src/lib/api/generated',
      schemas: 'src/lib/api/generated/model',
      client: 'react-query', // TanStack Query v5 hooks
      clean: true,
      prettier: true,
      override: {
        mutator: {
          // Use our Axios instance (auth + tenant + error interceptors).
          path: 'src/lib/api/axios.ts',
          name: 'apiClient',
        },
        query: {
          useQuery: true,
          useInfinite: false,
        },
      },
    },
  },
});
