/**
 * Safe post-login return navigation.
 *
 * Login/Register accept `?return=` (alias `?redirect=`). Because the value
 * ends up in window.location, it must be strictly validated to avoid open
 * redirects — only two shapes are allowed:
 *   - `#<page>`  a dashboard hash page (unknown slugs safely fall back to
 *                 Overview via App.getHashPage normalisation)
 *   - `/<path>`  a known account/auth path route (see PATH_ROUTES)
 * Anything else (absolute URLs, protocol-relative URLs, schemes such as
 * `javascript:`, backslashes, whitespace) is rejected and the caller falls
 * back to its default destination.
 */

export const PATH_ROUTES = {
  '/profile': 'profile',
  '/login': 'login',
  '/register': 'register',
  '/forgot-password': 'forgotPassword',
  '/reset-password': 'resetPassword',
  '/verify-email': 'verifyEmail',
  '/settings': 'accountSettings',
  '/settings/security': 'accountSecurity',
};

const HASH_SLUG = /^[A-Za-z0-9-]{1,40}$/;
const RETURN_KEY = 'eb.return';

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Raw `?return=` / `?redirect=` value from the current (or given) query string. */
export function readReturnParam(search) {
  try {
    const params = new window.URLSearchParams(
      typeof search === 'string' ? search : window.location.search
    );
    return params.get('return') || params.get('redirect') || '';
  } catch {
    return '';
  }
}

/**
 * Validate a return value.
 * @returns {{kind:'hash',target:string}|{kind:'path',target:string}|null}
 */
export function sanitizeReturn(raw) {
  const value = String(raw || '').trim().slice(0, 200);
  if (!value || /[\s\\]/.test(value)) return null;
  if (value.startsWith('//')) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return null;
  if (value.startsWith('#')) {
    const page = value.slice(1);
    return HASH_SLUG.test(page) ? { kind: 'hash', target: page } : null;
  }
  if (value.startsWith('/')) {
    const clean = value.split('?')[0].split('#')[0];
    return hasOwn(PATH_ROUTES, clean) ? { kind: 'path', target: clean } : null;
  }
  return null;
}

/** Navigate to a sanitized return target. Returns false when invalid. */
export function applyReturn(sanitized) {
  if (!sanitized) return false;
  if (sanitized.kind === 'hash') {
    window.location.replace(`/#${sanitized.target}`);
    return true;
  }
  window.location.replace(sanitized.target);
  return true;
}

/** Persist the raw return across the Discord OAuth round-trip. */
export function rememberReturn(raw) {
  try {
    if (raw) window.sessionStorage.setItem(RETURN_KEY, String(raw).slice(0, 200));
  } catch {
    /* storage unavailable — OAuth still lands on the default page */
  }
}

/** One-shot read of the OAuth-preserved return value. */
export function consumeReturn() {
  try {
    const value = window.sessionStorage.getItem(RETURN_KEY) || '';
    window.sessionStorage.removeItem(RETURN_KEY);
    return value;
  } catch {
    return '';
  }
}

/** Drop a preserved return (e.g. user signed in with credentials instead). */
export function clearReturn() {
  try {
    window.sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* ignore */
  }
}
