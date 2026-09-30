/**
 * The single entry point to the backend: `apiClient.request(config)`.
 *
 * Only frontend services call it; nothing else in the app calls `fetch`. It
 * owns every transport concern — base URL, query serialisation, timeouts,
 * safe retries, the shared auth refresh and the error shape — so services only
 * say *what* to call, and a service test asserts one call shape.
 *
 * Lives at `lib/api/client.ts` (import alias `@lib/api/client`).
 */

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequest {
  method: HttpMethod;
  /** Path under the API base URL, starting with `/`. */
  path: string;
  /** Nested objects and arrays serialise in bracket notation (Strapi filters). */
  query?: Record<string, unknown>;
  /** Plain values are sent as JSON; `FormData` and `Blob` as they are. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** `'blob'` for downloads; defaults to JSON. */
  responseType?: 'json' | 'blob';
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly data: unknown,
    message = `HTTP ${status}`
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/+$/, '');
const TIMEOUT_MS = { json: 30_000, blob: 120_000 };
const MAX_RETRIES = 2;
const SAFE_METHODS = new Set<HttpMethod>(['GET', 'HEAD']);
const REFRESH_PATH = '/auth/refresh';

let onUnauthorized: () => void = () => {
  window.location.assign('/sign-in');
};

/** Called on a definitive 401/403 after the refresh failed. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

// ─────────────────────────────────────────────────────────────────────────────
// URL
// ─────────────────────────────────────────────────────────────────────────────

function appendQuery(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (value instanceof Date) {
    params.append(key, value.toISOString());
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => appendQuery(params, `${key}[${index}]`, item));
  } else if (typeof value === 'object') {
    for (const [child, item] of Object.entries(value)) {
      appendQuery(params, `${key}[${child}]`, item);
    }
  } else {
    params.append(key, String(value));
  }
}

export function buildUrl(path: string, query?: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    appendQuery(params, key, value);
  }
  const search = params.toString();
  return `${BASE_URL}${path}${search ? `?${search}` : ''}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 408/429: the server did not process the request, any method may retry.
 * Network errors, timeouts and 502/503/504: the write may already be
 * committed, so only safe methods or an idempotency-keyed request retry.
 */
function isRetryable(config: ApiRequest, failure: number | 'network'): boolean {
  if (failure === 408 || failure === 429) return true;
  const repeatable =
    SAFE_METHODS.has(config.method) ||
    Object.keys(config.headers ?? {}).some(h => h.toLowerCase() === 'idempotency-key');
  if (!repeatable) return false;
  return failure === 'network' || failure === 502 || failure === 503 || failure === 504;
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  const base = 300 * 2 ** attempt;
  return base + Math.random() * base;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Auth refresh — one shared promise for every concurrent 401
// ─────────────────────────────────────────────────────────────────────────────

type RefreshOutcome = 'refreshed' | 'rejected' | 'unavailable';

let refreshing: Promise<RefreshOutcome> | null = null;

function refreshSession(): Promise<RefreshOutcome> {
  refreshing ??= fetch(buildUrl(REFRESH_PATH), {
    method: 'POST',
    credentials: 'include',
  })
    .then((response): RefreshOutcome =>
      response.ok ? 'refreshed' : response.status >= 500 ? 'unavailable' : 'rejected'
    )
    // A network failure is transient, not a reason to sign the user out.
    .catch((): RefreshOutcome => 'unavailable')
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request
// ─────────────────────────────────────────────────────────────────────────────

function encodeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (body instanceof FormData || body instanceof Blob) return body;
  return JSON.stringify(body);
}

async function parse(response: Response, responseType: 'json' | 'blob') {
  if (response.status === 204) return undefined;
  if (responseType === 'blob') return response.blob();
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

async function send(config: ApiRequest): Promise<Response> {
  const responseType = config.responseType ?? 'json';
  const isJsonBody =
    config.body !== undefined &&
    !(config.body instanceof FormData) &&
    !(config.body instanceof Blob);

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS[responseType]);
    const abortFromCaller = () => controller.abort();
    config.signal?.addEventListener('abort', abortFromCaller);

    try {
      const response = await fetch(buildUrl(config.path, config.query), {
        method: config.method,
        credentials: 'include',
        headers: {
          Accept: responseType === 'blob' ? '*/*' : 'application/json',
          ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
          ...config.headers,
        },
        body: encodeBody(config.body),
        signal: controller.signal,
      });
      if (attempt < MAX_RETRIES && isRetryable(config, response.status)) {
        await wait(retryDelay(attempt, response.headers.get('Retry-After')));
        continue;
      }
      return response;
    } catch (error) {
      // The caller cancelled (TanStack Query unmount): do not retry.
      if (config.signal?.aborted) throw error;
      if (attempt < MAX_RETRIES && isRetryable(config, 'network')) {
        await wait(retryDelay(attempt, null));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
      config.signal?.removeEventListener('abort', abortFromCaller);
    }
  }
}

async function request<T>(config: ApiRequest): Promise<T> {
  let response = await send(config);
  let refresh: RefreshOutcome | null = null;

  if (response.status === 401 && config.path !== REFRESH_PATH) {
    refresh = await refreshSession();
    if (refresh === 'refreshed') response = await send(config);
  }

  const data = await parse(response, config.responseType ?? 'json').catch(
    () => undefined
  );

  if (!response.ok) {
    // Only a definitive auth failure signs the user out, never a transient one.
    const definitive = response.status === 403 || refresh !== 'unavailable';
    if ((response.status === 401 || response.status === 403) && definitive) {
      onUnauthorized();
    }
    const message =
      (data as { message?: string; error?: { message?: string } } | undefined)
        ?.error?.message ??
      (data as { message?: string } | undefined)?.message;
    throw new ApiError(response.status, data, message);
  }

  return data as T;
}

export const apiClient = { request };
