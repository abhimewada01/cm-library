import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './secureSession';

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  authenticated?: boolean;
  signal?: AbortSignal;
};

/** Route-agnostic JSON transport. Endpoint paths and request/response shapes
 * belong in the API adapter once the backend's real contract is known. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL
    || 'http://192.168.1.12:4000/v1';
  const baseUrl = configuredBaseUrl?.trim().replace(/\/$/, '');
  if (!baseUrl) throw new ApiError('CM Library API is not configured.');

  const isLocalDevelopment = /^(http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))/i.test(baseUrl);
  if (!baseUrl.startsWith('https://') && !(__DEV__ && isLocalDevelopment)) {
    throw new ApiError('Use HTTPS for the CM Library API outside local development.');
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.authenticated !== false) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const send = (token?: string) => fetch(`${baseUrl}/${path.replace(/^\//, '')}`, {
    method: options.method ?? 'GET',
    headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  let response: Response;
  try {
    response = await send(headers.Authorization?.replace(/^Bearer /, ''));
    if (response.status === 401 && options.authenticated !== false && path !== 'auth/refresh') {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        const refreshed = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }), signal: options.signal });
        if (refreshed.ok) {
          const tokens = await refreshed.json() as { accessToken: string; refreshToken: string };
          await saveTokens(tokens.accessToken, tokens.refreshToken);
          response = await send(tokens.accessToken);
        } else await clearTokens();
      }
    }
  } catch {
    throw new ApiError('Could not reach the CM Library API. Check your connection.');
  }

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const serverMessage = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : `CM Library API request failed (HTTP ${response.status}).`;
    throw new ApiError(serverMessage, response.status);
  }
  return payload as T;
}
