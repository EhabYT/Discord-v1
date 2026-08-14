export async function copyText(value) {
  const text = String(value || '');
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function rememberRecentPage(id) {
  try {
    const raw = JSON.parse(localStorage.getItem('eb.recent') || '[]');
    const next = [id, ...raw.filter((x) => x !== id)].slice(0, 6);
    localStorage.setItem('eb.recent', JSON.stringify(next));
  } catch { /* ignore */ }
}

export function readRecentPages() {
  try {
    const raw = JSON.parse(localStorage.getItem('eb.recent') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
