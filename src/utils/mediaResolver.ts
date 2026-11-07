/**
 * Resolves raw WhatsApp media URLs (lookaside URLs, localhost URLs, relative paths, Meta media IDs)
 * into accessible, clean endpoints for in-browser rendering.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim();
  if (!trimmed) return '';

  // 1. If it's a pure numeric Meta media ID (e.g. "103948572019485")
  if (/^\d{8,}$/.test(trimmed)) {
    trimmed = `/api/whatsapp/media/${trimmed}`;
  }

  // 2. If it's an absolute URL pointing to /api/whatsapp/media/ or /api/whatsapp/proxy-media
  if (trimmed.includes('/api/whatsapp/media/') || trimmed.includes('/api/whatsapp/proxy-media')) {
    const idx = trimmed.indexOf('/api/whatsapp/');
    if (idx > 0) {
      trimmed = trimmed.substring(idx);
    }
  }

  // 3. If it's a Meta lookaside attachment URL (requires Bearer token and has 5-minute expiry)
  if (trimmed.includes('lookaside.fbsbx.com')) {
    const midMatch = trimmed.match(/mid=([0-9]+)/i);
    if (midMatch && midMatch[1]) {
      trimmed = `/api/whatsapp/media/${midMatch[1]}`;
    } else {
      trimmed = `/api/whatsapp/proxy-media?url=${encodeURIComponent(trimmed)}`;
    }
  }

  // 4. If it's a localhost or absolute domain URL pointing to /uploads/
  if (trimmed.includes('/uploads/')) {
    const idx = trimmed.indexOf('/uploads/');
    const relativePath = trimmed.substring(idx);
    return encodeURI(decodeURI(relativePath));
  }

  // 5. For Meta media proxy endpoints, append client Meta access token to query params so <img> tags authenticate
  if (trimmed.startsWith('/api/whatsapp/media/') || trimmed.startsWith('/api/whatsapp/proxy-media')) {
    let clientToken = '';
    try {
      if (typeof localStorage !== 'undefined') {
        const credsStr = localStorage.getItem('whatchat_credentials');
        if (credsStr) {
          const creds = JSON.parse(credsStr);
          if (creds?.accessToken) clientToken = creds.accessToken.trim();
        }
      }
    } catch (_) {}

    if (clientToken && !trimmed.includes('token=')) {
      trimmed += `${trimmed.includes('?') ? '&' : '?'}token=${encodeURIComponent(clientToken)}`;
    }
    return trimmed;
  }

  // 6. If it's already a relative /uploads/... or other path
  if (trimmed.startsWith('/')) {
    return encodeURI(decodeURI(trimmed));
  }

  return trimmed;
}
