/**
 * Resolves raw WhatsApp media URLs (lookaside URLs, localhost URLs, relative paths)
 * into accessible, clean endpoints for in-browser rendering.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // 1. If it's a Meta lookaside attachment URL (requires Bearer token and has 5-minute expiry)
  if (trimmed.includes('lookaside.fbsbx.com')) {
    const midMatch = trimmed.match(/mid=([0-9]+)/i);
    if (midMatch && midMatch[1]) {
      return `/api/whatsapp/media/${midMatch[1]}`;
    }
    return `/api/whatsapp/proxy-media?url=${encodeURIComponent(trimmed)}`;
  }

  // 2. If it's a localhost URL from local development (e.g. http://localhost:10000/uploads/...)
  if (trimmed.includes('localhost:') && trimmed.includes('/uploads/')) {
    const idx = trimmed.indexOf('/uploads/');
    const relativePath = trimmed.substring(idx);
    return encodeURI(decodeURI(relativePath));
  }

  // 3. If it's a full Render or custom domain URL pointing to /uploads/
  if (trimmed.includes('/uploads/')) {
    const idx = trimmed.indexOf('/uploads/');
    const relativePath = trimmed.substring(idx);
    return encodeURI(decodeURI(relativePath));
  }

  // 4. If it's already a relative /api/whatsapp/media/... or /uploads/... path
  if (trimmed.startsWith('/')) {
    return encodeURI(decodeURI(trimmed));
  }

  return trimmed;
}
