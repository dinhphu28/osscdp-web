import axios, { type AxiosRequestConfig, type AxiosError } from 'axios';
import { enqueueSnackbar } from 'notistack';
import { tokenStore } from '@/lib/auth/tokenStore';
import type { ApiError } from '@/types';

/**
 * Single shared Axios instance used by BOTH the Orval-generated client (as its
 * mutator) and hand-written calls for endpoints the spec omits.
 *
 * Interceptors:
 *  - request: Authorization: Bearer <adminToken>; baseURL from the auth store.
 *  - response: parse the {error:{code,message}} envelope; 401 → clear token +
 *    signal logout; 403 → toast; 429 → toast honoring Retry-After.
 * See docs/04-api-integration.md.
 */
export const AUTH_LOGOUT_EVENT = 'osscdp:auth-logout';

export const axiosInstance = axios.create();

axiosInstance.interceptors.request.use((config) => {
  config.baseURL = tokenStore.getBaseUrl();
  const token = tokenStore.getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function parseApiError(error: AxiosError<ApiError>): { code: string; message: string } {
  const body = error.response?.data;
  if (body && typeof body === 'object' && 'error' in body && body.error) {
    return { code: body.error.code, message: body.error.message };
  }
  return { code: 'network_error', message: error.message || 'Request failed' };
}

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    const status = error.response?.status;
    const { message } = parseApiError(error);

    if (status === 401) {
      tokenStore.clear();
      window.dispatchEvent(new Event(AUTH_LOGOUT_EVENT));
    } else if (status === 403) {
      enqueueSnackbar(`Forbidden: ${message}`, { variant: 'error' });
    } else if (status === 429) {
      const retryAfter = error.response?.headers?.['retry-after'];
      enqueueSnackbar(`Rate limited${retryAfter ? ` — retry after ${retryAfter}s` : ''}`, {
        variant: 'warning',
      });
    }
    return Promise.reject(error);
  },
);

/**
 * Orval mutator. Orval-generated hooks call `apiClient<T>(config)`; hand-written
 * calls can use it too. Returns the response body (`data`) directly.
 */
export const apiClient = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const source = axios.CancelToken.source();
  const promise = axiosInstance({
    ...config,
    ...options,
    cancelToken: source.token,
  }).then(({ data }) => data as T);

  // Allow TanStack Query to cancel in-flight requests.
  (promise as Promise<T> & { cancel?: () => void }).cancel = () => {
    source.cancel('Query was cancelled by TanStack Query');
  };

  return promise;
};

export default apiClient;

/** Build an admin path scoped to a tenant, for hand-written (non-generated) calls. */
export function tenantPath(tenantId: string, suffix: string): string {
  return `/admin/v1/tenants/${tenantId}${suffix}`;
}

/** Error type alias used by Orval-generated hooks. */
export type ErrorType<Error = ApiError> = AxiosError<Error>;
export type BodyType<BodyData> = BodyData;
