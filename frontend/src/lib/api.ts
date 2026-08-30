/**
 * Shared FastAPI client for the Face Attendance frontend.
 * All protected business data flows through FastAPI — not direct Supabase table access.
 */

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  kind: 'http' | 'network' | 'parse';

  constructor(
    status: number,
    message: string,
    detail?: unknown,
    kind: 'http' | 'network' | 'parse' = status === 0 ? 'network' : 'http'
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.kind = kind;
  }
}

function extractDetail(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    return (payload as { detail: unknown }).detail;
  }
  return payload;
}

export function formatApiErrorMessage(status: number, detail: unknown): string {
  if (status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (status === 403) {
    return "You don't have permission to perform this action.";
  }
  if (status === 409) {
    if (typeof detail === 'string' && detail.trim()) return detail;
    return 'Already exists.';
  }
  if (status === 422) {
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'msg' in item) {
            return String((item as { msg: unknown }).msg);
          }
          return '';
        })
        .filter(Boolean);
      if (msgs.length) return msgs.join('; ');
    }
    return 'Please check the submitted information.';
  }
  if (status >= 500) {
    return 'Something went wrong. Please try again.';
  }
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return '';
      })
      .filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  return 'Request failed. Please try again.';
}

type ApiRequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { method = 'GET', token, body, formData, headers = {}, signal } = options;
  const url = path.startsWith('http') ? path : `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  const reqHeaders: Record<string, string> = { ...headers };
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: payload,
      signal,
    });
  } catch (err) {
    const message =
      err instanceof TypeError
        ? 'The API request was blocked by the browser. Check that the backend is running and that CORS allows this frontend origin.'
        : 'Network error. Please check your connection and try again.';
    console.error('API network error:', url, err);
    throw new ApiError(0, message, err, 'network');
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = isJson ? await res.json() : await res.text();
    } catch {
      parsed = null;
    }
    const detail = extractDetail(parsed);
    throw new ApiError(res.status, formatApiErrorMessage(res.status, detail), detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (isJson) {
    try {
      return (await res.json()) as T;
    } catch (err) {
      console.error('API response parse error:', url, err);
      throw new ApiError(0, 'The API returned invalid JSON.', err, 'parse');
    }
  }

  return (await res.blob()) as T;
}

export async function apiDownload(
  path: string,
  token: string,
  filename: string
): Promise<void> {
  const url = path.startsWith('http') ? path : `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    const message =
      err instanceof TypeError
        ? 'The API request was blocked by the browser. Check that the backend is running and that CORS allows this frontend origin.'
        : 'Network error. Please check your connection and try again.';
    console.error('API network error:', url, err);
    throw new ApiError(0, message, err, 'network');
  }

  if (!res.ok) {
    let parsed: unknown = null;
    try {
      const contentType = res.headers.get('content-type') || '';
      parsed = contentType.includes('application/json') ? await res.json() : await res.text();
    } catch {
      parsed = null;
    }
    const detail = extractDetail(parsed);
    throw new ApiError(res.status, formatApiErrorMessage(res.status, detail), detail);
  }

  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}
