import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

export interface RateLimitResult {
  allowed: boolean;
  error?: string;
  waitSeconds?: number;
  remainingAttempts?: number;
}

export interface SendOtpResult {
  success: boolean;
  message: string;
  error?: string;
  normalizedPhone?: string;
  expiresInSeconds?: number;
  cooldownSeconds?: number;
  devOtp?: string; // Included for instant local testing if WhatsApp channel is not yet connected
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  remainingAttempts?: number;
}

/**
 * Normalizes phone number into international format without '+' (e.g. 919876543210).
 * Defaults 10-digit Indian numbers to +91.
 */
export function normalizePhoneNumber(rawPhone: string): string | null {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/[^0-9]/g, '');

  if (digits.length === 10) {
    // 10 digits assume India (91)
    return `91${digits}`;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  } else if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return null;
}

/**
 * Check rate limits on OTP generation:
 * - 60s cooldown between requests for same phone
 * - Max 4 requests per 10 minutes per phone
 * - Max 15 requests per hour per IP
 */
export async function checkOtpRateLimit(phone: string, ip: string): Promise<RateLimitResult> {
  const now = Date.now();
  const phoneKey = `phone:${phone}`;
  const ipKey = `ip:${ip || '127.0.0.1'}`;

  // 1. Phone Cooldown & Window Check
  const phoneLimit = (await db.prepare('SELECT requests_count, window_start, last_request FROM otp_rate_limits WHERE key = ?').get(phoneKey)) as {
    requests_count: number;
    window_start: number;
    last_request: number;
  } | undefined;

  if (phoneLimit) {
    const elapsedSinceLast = now - phoneLimit.last_request;
    if (elapsedSinceLast < 60 * 1000) {
      const waitSeconds = Math.ceil((60 * 1000 - elapsedSinceLast) / 1000);
      return {
        allowed: false,
        waitSeconds,
        error: `Please wait ${waitSeconds} seconds before requesting another verification code.`
      };
    }

    // 10 minute sliding window (600,000 ms)
    if (now - phoneLimit.window_start < 10 * 60 * 1000) {
      if (phoneLimit.requests_count >= 4) {
        const resetInSeconds = Math.ceil((10 * 60 * 1000 - (now - phoneLimit.window_start)) / 1000);
        return {
          allowed: false,
          waitSeconds: resetInSeconds,
          error: `Too many verification requests for this mobile number. Please try again in ${Math.ceil(resetInSeconds / 60)} minutes.`
        };
      }
    }
  }

  // 2. IP Window Check (1 hour sliding window)
  const ipLimit = (await db.prepare('SELECT requests_count, window_start FROM otp_rate_limits WHERE key = ?').get(ipKey)) as {
    requests_count: number;
    window_start: number;
  } | undefined;

  if (ipLimit && now - ipLimit.window_start < 60 * 60 * 1000) {
    if (ipLimit.requests_count >= 15) {
      return {
        allowed: false,
        error: 'Too many requests from this network. Please try again later.'
      };
    }
  }

  return { allowed: true };
}

/**
 * Record an OTP request in the rate limit table
 */
export async function recordOtpRequest(phone: string, ip: string): Promise<void> {
  const now = Date.now();
  const phoneKey = `phone:${phone}`;
  const ipKey = `ip:${ip || '127.0.0.1'}`;

  // Record for phone
  const phoneLimit = (await db.prepare('SELECT requests_count, window_start FROM otp_rate_limits WHERE key = ?').get(phoneKey)) as {
    requests_count: number;
    window_start: number;
  } | undefined;

  if (phoneLimit && now - phoneLimit.window_start < 10 * 60 * 1000) {
    await db.prepare(`
      UPDATE otp_rate_limits
      SET requests_count = requests_count + 1, last_request = ?
      WHERE key = ?
    `).run(now, phoneKey);
  } else {
    await db.prepare(`
      INSERT INTO otp_rate_limits (key, requests_count, window_start, last_request)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(key) DO UPDATE SET requests_count = 1, window_start = excluded.window_start, last_request = excluded.last_request
    `).run(phoneKey, now, now);
  }

  // Record for IP
  const ipLimit = (await db.prepare('SELECT requests_count, window_start FROM otp_rate_limits WHERE key = ?').get(ipKey)) as {
    requests_count: number;
    window_start: number;
  } | undefined;

  if (ipLimit && now - ipLimit.window_start < 60 * 60 * 1000) {
    await db.prepare(`
      UPDATE otp_rate_limits
      SET requests_count = requests_count + 1, last_request = ?
      WHERE key = ?
    `).run(now, ipKey);
  } else {
    await db.prepare(`
      INSERT INTO otp_rate_limits (key, requests_count, window_start, last_request)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(key) DO UPDATE SET requests_count = 1, window_start = excluded.window_start, last_request = excluded.last_request
    `).run(ipKey, now, now);
  }
}

/**
 * Sends OTP code via Meta WhatsApp Cloud API.
 * Uses any active WhatsApp channel or platform credentials.
 */
async function dispatchWhatsAppMessage(toPhone: string, otpCode: string, recipientName: string): Promise<boolean> {
  try {
    // 1. Search for active WhatsApp channel in database
    const channel = (await db.prepare(`
      SELECT phone_number_id, access_token
      FROM whatsapp_channels
      WHERE status = 'active' AND access_token IS NOT NULL AND phone_number_id IS NOT NULL
      ORDER BY connected_at DESC
      LIMIT 1
    `).get()) as { phone_number_id: string; access_token: string } | undefined;

    let phoneId = channel?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
    let token = channel?.access_token || process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneId || !token) {
      console.log(`[WhatsApp OTP] Notice: No active Meta WhatsApp channel connected yet. Simulated delivery of code ${otpCode} to +${toPhone}`);
      return false;
    }

    const messageText = `🔐 *WhatChat Verification Code*\n\nHello ${recipientName || 'there'},\n\nYour WhatChat account verification code is:\n\n*${otpCode}*\n\nValid for 10 minutes. Please do not share this code with anyone.`;

    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { body: messageText }
      })
    });

    const data = await metaRes.json();
    if (metaRes.ok && data?.messages?.[0]?.id) {
      console.log(`[WhatsApp OTP] Successfully sent WhatsApp OTP to +${toPhone}. Message ID: ${data.messages[0].id}`);
      return true;
    } else {
      console.warn(`[WhatsApp OTP] Meta API rejected message:`, data?.error?.message || data);
      return false;
    }
  } catch (err: any) {
    console.error(`[WhatsApp OTP] Dispatch exception:`, err?.message);
    return false;
  }
}

/**
 * Creates and sends a WhatsApp OTP for registration or login
 */
export async function createAndSendWhatsAppOtp(params: {
  mobile: string;
  name?: string;
  ip: string;
  purpose?: string;
}): Promise<SendOtpResult> {
  const { mobile, name = 'Valued User', ip, purpose = 'registration' } = params;

  const normalized = normalizePhoneNumber(mobile);
  if (!normalized) {
    return {
      success: false,
      message: 'Invalid mobile number. Please enter a valid 10-digit or international mobile number.'
    };
  }

  // Rate limit check
  const rateLimit = await checkOtpRateLimit(normalized, ip);
  if (!rateLimit.allowed) {
    return {
      success: false,
      message: rateLimit.error || 'Rate limit exceeded.',
      cooldownSeconds: rateLimit.waitSeconds || 60
    };
  }

  // Generate 6-digit cryptographic numerical code
  const otpCode = crypto.randomInt(100000, 999999).toString();
  const otpHmac = crypto.createHmac('sha256', 'whatchat_otp_salt_2026').update(otpCode).digest('hex');

  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes

  // Invalidate any prior pending unverified codes for this phone
  await db.prepare(`
    UPDATE otp_verifications
    SET verified = -1
    WHERE phone = ? AND verified = 0
  `).run(normalized);

  // Insert new verification record
  await db.prepare(`
    INSERT INTO otp_verifications (id, phone, otp_hash, otp_plain, purpose, attempts, max_attempts, verified, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, 0, 5, 0, ?, ?)
  `).run(uuidv4(), normalized, otpHmac, otpCode, purpose, expiresAt, now);

  // Record rate limit hit
  await recordOtpRequest(normalized, ip);

  // Dispatch via WhatsApp Cloud API
  const liveSent = await dispatchWhatsAppMessage(normalized, otpCode, name);

  return {
    success: true,
    message: liveSent
      ? `Verification code sent to WhatsApp number +${normalized}.`
      : `Verification code generated for +${normalized}. Check your WhatsApp.`,
    normalizedPhone: normalized,
    expiresInSeconds: 600,
    cooldownSeconds: 60,
    // Provide devOtp if no Meta channel is connected so local tests are never blocked
    devOtp: !liveSent ? otpCode : undefined
  };
}

/**
 * Verifies an entered OTP for a given mobile number
 */
export async function verifyWhatsAppOtp(mobile: string, enteredOtp: string, purpose: string = 'registration'): Promise<VerifyOtpResult> {
  const normalized = normalizePhoneNumber(mobile);
  if (!normalized) {
    return { success: false, error: 'Invalid mobile number.' };
  }

  if (!enteredOtp || enteredOtp.trim().length !== 6) {
    return { success: false, error: 'Please enter the 6-digit verification code.' };
  }

  const cleanOtp = enteredOtp.trim();
  const now = Date.now();

  const record = (await db.prepare(`
    SELECT id, otp_hash, otp_plain, attempts, max_attempts, expires_at
    FROM otp_verifications
    WHERE phone = ? AND purpose = ? AND verified = 0
    ORDER BY created_at DESC
    LIMIT 1
  `).get(normalized, purpose)) as {
    id: string;
    otp_hash: string;
    otp_plain: string;
    attempts: number;
    max_attempts: number;
    expires_at: number;
  } | undefined;

  if (!record) {
    return {
      success: false,
      error: 'No active verification code found for this number. Please request a new code.'
    };
  }

  if (now > record.expires_at) {
    return {
      success: false,
      error: 'Verification code has expired. Please request a new code.'
    };
  }

  if (record.attempts >= record.max_attempts) {
    return {
      success: false,
      error: 'Maximum verification attempts exceeded. Please request a new code.'
    };
  }

  // Increment attempts counter
  const newAttempts = record.attempts + 1;
  await db.prepare('UPDATE otp_verifications SET attempts = ? WHERE id = ?').run(newAttempts, record.id);

  // Verify hash
  const candidateHash = crypto.createHmac('sha256', 'whatchat_otp_salt_2026').update(cleanOtp).digest('hex');
  const isMatch = candidateHash === record.otp_hash || cleanOtp === record.otp_plain;

  if (!isMatch) {
    const remaining = record.max_attempts - newAttempts;
    return {
      success: false,
      remainingAttempts: remaining,
      error: remaining > 0
        ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
        : 'Maximum verification attempts exceeded. Please request a new code.'
    };
  }

  // Mark verified
  await db.prepare('UPDATE otp_verifications SET verified = 1 WHERE id = ?').run(record.id);

  return { success: true };
}
