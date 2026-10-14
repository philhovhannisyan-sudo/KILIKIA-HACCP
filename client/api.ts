// Обёртка над fetch: ошибки сервера приходят как { error, params, message } и переводятся ключом `error.<code>`.
export class ApiError extends Error {
  constructor(public status: number, public code: string, public params: Record<string, unknown>, message: string) {
    super(message);
  }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener = () => {};
export const setUnauthorizedListener = (l: UnauthorizedListener) => { onUnauthorized = l; };

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, { ...init, headers, body, credentials: 'same-origin' });
  if (!res.ok) {
    let payload: { error?: string; params?: Record<string, unknown>; message?: string } = {};
    try { payload = await res.json(); } catch { /* тело не JSON */ }
    if (res.status === 401 && !url.startsWith('/api/auth/login')) onUnauthorized();
    throw new ApiError(res.status, payload.error ?? 'internal', payload.params ?? {}, payload.message ?? res.statusText);
  }
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? res.json() : res.blob()) as Promise<T>;
}
