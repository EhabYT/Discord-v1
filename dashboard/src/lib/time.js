// Shared relative-time formatter. Every page had its own copy returning
// English "5s ago" strings; this one renders through the locale dictionaries
// (`time.sAgo` etc. with a `{n}` placeholder) and falls back to the browser's
// localized date for older timestamps.
export function timeAgo(ts, t) {
  if (!ts) return '';
  const fmt = (key, fallback, n) => {
    const pattern = t ? t(key, fallback) : fallback;
    return String(pattern).replace('{n}', String(n));
  };
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return t ? t('time.justNow', 'just now') : 'just now';
  if (s < 60) return fmt('time.sAgo', '{n}s ago', Math.max(0, s));
  if (s < 3600) return fmt('time.mAgo', '{n}m ago', Math.floor(s / 60));
  if (s < 86400) return fmt('time.hAgo', '{n}h ago', Math.floor(s / 3600));
  if (s < 604800) return fmt('time.dAgo', '{n}d ago', Math.floor(s / 86400));
  return new Date(ts).toLocaleDateString();
}
