import crypto from 'crypto';
import { db } from './db.js';

// Resolves the permanent production base URL without trailing slash
export function getAppBaseUrl(): string {
  const envUrl = process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (envUrl && !envUrl.includes('ais-dev-') && !envUrl.includes('.trycloudflare.com')) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'https://whatchatfork.onrender.com';
}

// Webhook path (standardized to /api/whatsapp/webhook)
export function getWhatsAppWebhookPath(): string {
  const customPath = process.env.WHATSAPP_WEBHOOK_PATH;
  if (customPath && customPath.startsWith('/')) {
    return customPath.trim().replace(/\/+$/, '');
  }
  return '/api/whatsapp/webhook';
}

// Full canonical permanent production Webhook URL
export function getWhatsAppWebhookUrl(): string {
  return `${getAppBaseUrl()}${getWhatsAppWebhookPath()}`;
}

// Default fallback verify token if none configured in env or database
export const DEFAULT_VERIFY_TOKEN = 'whatchat_webhook_secret_2026';

// Primary configured verify token
export function getPrimaryVerifyToken(): string {
  return (process.env.WHATSAPP_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN).trim();
}

// Constant-time, timing-safe string comparison to prevent timing attacks
export function timingSafeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Retrieve all valid verification tokens recognized by this deployment
// (Primary env token, Super Admin platform token, and any tenant custom tokens)
export async function getAllValidVerifyTokens(): Promise<string[]> {
  const tokens = new Set<string>();

  // 1. Primary env token
  const envToken = getPrimaryVerifyToken();
  if (envToken) tokens.add(envToken);

  // 2. Default token
  tokens.add(DEFAULT_VERIFY_TOKEN);
  tokens.add('whatscloud_token'); // Legacy backward-compatibility for existing test configs

  // 3. Platform configuration table
  try {
    const row = (await db.prepare("SELECT value FROM platform_config WHERE key = 'webhook_verify_token'").get()) as { value: string } | undefined;
    if (row?.value) {
      const val = row.value.trim();
      if (val) tokens.add(val);
    }
  } catch (_) {}

  // 4. Any tenant channels with custom webhook_verify_token
  try {
    const channelRows = (await db.prepare('SELECT DISTINCT webhook_verify_token FROM whatsapp_channels WHERE webhook_verify_token IS NOT NULL').all()) as Array<{ webhook_verify_token: string }>;
    for (const r of channelRows) {
      if (r.webhook_verify_token) {
        const val = r.webhook_verify_token.trim();
        if (val) tokens.add(val);
      }
    }
  } catch (_) {}

  return Array.from(tokens);
}

// Verify an incoming GET verification token
export async function verifyWebhookToken(providedToken: string | undefined): Promise<boolean> {
  if (!providedToken) return false;
  const cleanProvided = String(providedToken).trim();
  const validTokens = await getAllValidVerifyTokens();

  for (const validToken of validTokens) {
    if (timingSafeCompare(cleanProvided, validToken)) {
      return true;
    }
  }

  return false;
}

// Resolve candidate Meta App Secrets for HMAC-SHA256 signature verification
export async function getCandidateAppSecrets(wabaId?: string, phoneNumberId?: string): Promise<string[]> {
  const secrets = new Set<string>();

  // 1. By Phone Number ID (BYOA tenant specific)
  if (phoneNumberId) {
    try {
      const row = (await db.prepare('SELECT app_secret FROM whatsapp_channels WHERE phone_number_id = ? AND app_secret IS NOT NULL').get(phoneNumberId)) as { app_secret: string } | undefined;
      if (row?.app_secret?.trim()) {
        secrets.add(row.app_secret.trim());
      }
    } catch (_) {}
  }

  // 2. By WABA ID (BYOA tenant specific)
  if (wabaId) {
    try {
      const row = (await db.prepare('SELECT app_secret FROM whatsapp_channels WHERE waba_id = ? AND app_secret IS NOT NULL').get(wabaId)) as { app_secret: string } | undefined;
      if (row?.app_secret?.trim()) {
        secrets.add(row.app_secret.trim());
      }
    } catch (_) {}
  }

  // 3. Platform configuration table (Super Admin shared Meta App)
  try {
    const row = (await db.prepare("SELECT value FROM platform_config WHERE key = 'meta_app_secret'").get()) as { value: string } | undefined;
    if (row?.value?.trim()) {
      secrets.add(row.value.trim());
    }
  } catch (_) {}

  // 4. Environment variable
  if (process.env.WHATSAPP_APP_SECRET?.trim()) {
    secrets.add(process.env.WHATSAPP_APP_SECRET.trim());
  }

  return Array.from(secrets);
}

// Verify X-Hub-Signature-256 header against raw request body
export async function verifyMetaHubSignature(params: {
  rawBody: Buffer | string | undefined;
  hubSignatureHeader: string | undefined;
  wabaId?: string;
  phoneNumberId?: string;
}): Promise<{
  isValid: boolean;
  required: boolean;
  matchedSecret?: string;
  reason?: string;
}> {
  const { rawBody, hubSignatureHeader, wabaId, phoneNumberId } = params;

  // Retrieve candidate App Secrets
  const candidateSecrets = await getCandidateAppSecrets(wabaId, phoneNumberId);

  // If no App Secrets are configured in system yet, signature check cannot be strictly enforced
  if (candidateSecrets.length === 0) {
    return {
      isValid: true,
      required: false,
      reason: 'No Meta App Secret configured; signature verification bypassed'
    };
  }

  // If App Secret is configured, header is mandatory
  if (!hubSignatureHeader) {
    return {
      isValid: false,
      required: true,
      reason: 'Missing X-Hub-Signature-256 header on webhook request'
    };
  }

  const parts = hubSignatureHeader.split('sha256=');
  if (parts.length !== 2 || !parts[1]) {
    return {
      isValid: false,
      required: true,
      reason: 'Invalid X-Hub-Signature-256 header format (expected sha256=<hex>)'
    };
  }

  const signatureHash = parts[1].trim();
  const bodyBuffer = Buffer.isBuffer(rawBody) 
    ? rawBody 
    : Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}), 'utf8');

  for (const secret of candidateSecrets) {
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(bodyBuffer)
      .digest('hex');

    if (timingSafeCompare(signatureHash, expectedHash)) {
      return {
        isValid: true,
        required: true,
        matchedSecret: `${secret.substring(0, 4)}...${secret.substring(secret.length - 2)}`
      };
    }
  }

  return {
    isValid: false,
    required: true,
    reason: 'Signature mismatch: X-Hub-Signature-256 does not match any configured App Secret'
  };
}
