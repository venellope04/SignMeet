const RECENT_CLICK_WINDOW_MS = 800;

let lastSignature = '';
let lastTimestamp = 0;

function normalizeText(value, maxLength = 120) {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function extractClickActivity(target) {
  const clickable = target?.closest?.('button, a, [data-log-action]');
  if (!clickable) {
    return null;
  }

  const action =
    clickable.dataset.logAction ||
    clickable.getAttribute('aria-label') ||
    normalizeText(clickable.textContent) ||
    clickable.tagName.toLowerCase();

  const sessionPathMatch = window.location.pathname.match(/^\/translate\/session\/([^/]+)$/);
  const payload = {
    action,
    element: clickable.tagName.toLowerCase(),
    text: normalizeText(clickable.textContent, 200),
    path: window.location.pathname,
    href: clickable.getAttribute('href') || '',
    component: clickable.dataset.logComponent || '',
    meetingId: clickable.dataset.meetingId || (sessionPathMatch ? sessionPathMatch[1] : ''),
  };

  const signature = `${payload.path}|${payload.element}|${payload.action}|${payload.href}`;
  const now = Date.now();

  if (signature === lastSignature && now - lastTimestamp < RECENT_CLICK_WINDOW_MS) {
    return null;
  }

  lastSignature = signature;
  lastTimestamp = now;
  return payload;
}

export function logActivity(payload) {
  if (!payload?.action) {
    return;
  }

  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/api/activity/log/', blob);
    return;
  }

  fetch('/api/activity/log/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body,
    keepalive: true,
  }).catch(() => {});
}
