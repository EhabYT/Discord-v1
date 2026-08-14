const BASE = '';
const TIMEOUT_MS = 18000;

function messageFromBody(status, text) {
  const t = String(text || '');
  if (
    status === 530 ||
    status === 1033 ||
    /1033|unable to resolve it|Cloudflare Tunnel error|error code 1033/i.test(t)
  ) {
    return 'Tunnel down (Error 1033). Reload in a few seconds for a new public URL.';
  }
  if (status === 429) return 'Too many requests — wait a moment.';
  if (status === 401) return 'Not authenticated.';
  if (status === 403) return 'Permission denied.';
  if (status === 404) return 'Not found.';
  try {
    const j = JSON.parse(t);
    if (j && typeof j.error === 'string' && j.error) return j.error;
    if (j && typeof j.message === 'string' && j.message) return j.message;
  } catch { /* html or empty */ }
  if (status >= 500) return `Server error (${status}).`;
  if (t.trim().startsWith('<')) return `Request failed (HTTP ${status}).`;
  const clipped = t.replace(/\s+/g, ' ').trim().slice(0, 180);
  return clipped || `Request failed (HTTP ${status}).`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch(path, options = {}, attempt = 0) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeout || TIMEOUT_MS);
  const method = (options.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json', ...options.headers };
  if (options.body != null && method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...options,
      method,
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
      signal: options.signal || ctrl.signal,
    });
    const text = await res.text();

    if (!res.ok) {
      const retryable = res.status === 502 || res.status === 503 || res.status === 530 || res.status === 1033;
      if (retryable && attempt < 1) {
        await sleep(700);
        return apiFetch(path, options, attempt + 1);
      }
      throw new Error(messageFromBody(res.status, text));
    }

    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Server returned a non-JSON response');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('Request timed out');
    const msg = err?.message || '';
    const network = /Failed to fetch|NetworkError|Load failed|network/i.test(msg);
    if (network && attempt < 1) {
      await sleep(700);
      return apiFetch(path, options, attempt + 1);
    }
    if (network) throw new Error('Network error — check the dashboard URL and try again');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
  delete: (path) => apiFetch(path, { method: 'DELETE' }),
};

export default api;
