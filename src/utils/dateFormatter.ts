/**
 * Safe, universal timestamp parser and formatter.
 * Guarantees that "Invalid Date" or NaN is never displayed in any UI component.
 */

export function safeTimestamp(ts: any): number {
  if (!ts) return Date.now();
  if (typeof ts === 'number') {
    if (isNaN(ts) || !isFinite(ts)) return Date.now();
    return ts < 1e12 ? ts * 1000 : ts;
  }
  const str = String(ts).trim();
  if (!str || str === 'Invalid Date' || str === 'NaN' || str === 'undefined' || str === 'null') {
    return Date.now();
  }

  // Pure numeric string (e.g. "1730935200" or "1730935200000")
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    if (!isNaN(num) && isFinite(num)) {
      return num < 1e12 ? num * 1000 : num;
    }
  }

  // ISO or standard date string (e.g. "2026-11-06T15:20:00.000Z")
  const parsed = Date.parse(str);
  if (!isNaN(parsed) && isFinite(parsed)) {
    return parsed;
  }

  return Date.now();
}

export function formatMessageTime(ts: any): string {
  const ms = safeTimestamp(ts);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatChatListTime(ts: any): string {
  const ms = safeTimestamp(ts);
  const date = new Date(ms);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
