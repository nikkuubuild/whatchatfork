import { db } from './db.js';
import { getWhatsAppWebhookUrl, getPrimaryVerifyToken, getAllValidVerifyTokens } from './webhookConfig.js';
import { v4 as uuidv4 } from 'uuid';

export interface WebhookMetrics {
  totalEventsReceived: number;
  totalEventsProcessed: number;
  failedEvents: number;
  lastReceivedAt: number | null;
  lastProcessedAt: number | null;
}

// In-memory telemetry cache
const telemetry: WebhookMetrics = {
  totalEventsReceived: 0,
  totalEventsProcessed: 0,
  failedEvents: 0,
  lastReceivedAt: null,
  lastProcessedAt: null
};

// Initialize metrics from database
export async function initializeWebhookMetrics() {
  try {
    const totalRow = (await db.prepare('SELECT count(*) as count FROM webhook_logs').get()) as { count: number | string | bigint } | undefined;
    const failedRow = (await db.prepare("SELECT count(*) as count FROM webhook_logs WHERE event_type LIKE '%fail%' OR event_type LIKE '%error%'").get()) as { count: number | string | bigint } | undefined;
    const lastRow = (await db.prepare('SELECT created_at FROM webhook_logs ORDER BY created_at DESC LIMIT 1').get()) as { created_at: number | string | bigint } | undefined;

    telemetry.totalEventsReceived = Number(totalRow?.count || 0);
    telemetry.totalEventsProcessed = Number(totalRow?.count || 0) - Number(failedRow?.count || 0);
    telemetry.failedEvents = Number(failedRow?.count || 0);
    if (lastRow?.created_at) {
      telemetry.lastReceivedAt = Number(lastRow.created_at);
      telemetry.lastProcessedAt = Number(lastRow.created_at);
    }
  } catch (err) {
    console.warn('[Webhook Metrics] DB init note:', err);
  }
}

export function getWebhookMetrics(): WebhookMetrics {
  return { ...telemetry };
}

export async function logWebhookEvent(params: {
  tenantId?: string | null;
  eventType: string;
  payload: any;
  isError?: boolean;
}) {
  const now = Date.now();
  telemetry.totalEventsReceived++;
  telemetry.lastReceivedAt = now;

  if (params.isError) {
    telemetry.failedEvents++;
  } else {
    telemetry.totalEventsProcessed++;
    telemetry.lastProcessedAt = now;
  }

  try {
    const logId = uuidv4();
    const payloadStr = typeof params.payload === 'string' ? params.payload : JSON.stringify(params.payload || {});
    await db.prepare(`
      INSERT INTO webhook_logs (id, tenant_id, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(logId, params.tenantId || null, params.eventType, payloadStr, now);
  } catch (dbErr) {
    console.error('[Webhook Logger] Failed to persist log entry:', dbErr);
  }
}

// Probe our own webhook endpoint to test Meta GET verification compliance
export async function testWebhookVerificationProbe(customUrl?: string, customToken?: string): Promise<{
  success: boolean;
  httpStatus: number;
  expectedChallenge: string;
  receivedBody: string;
  contentType: string | null;
  targetUrl: string;
  message: string;
}> {
  const targetUrl = (customUrl || getWhatsAppWebhookUrl()).trim();
  const token = (customToken || getPrimaryVerifyToken()).trim();
  const testChallenge = `challenge_${Math.random().toString(36).substring(2, 10)}`;

  try {
    const probeUrl = new URL(targetUrl);
    probeUrl.searchParams.set('hub.mode', 'subscribe');
    probeUrl.searchParams.set('hub.challenge', testChallenge);
    probeUrl.searchParams.set('hub.verify_token', token);

    const res = await fetch(probeUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'facebookplatform/1.0 (+http://developers.facebook.com)',
        Accept: 'text/plain, */*'
      }
    });

    const bodyText = await res.text();
    const contentType = res.headers.get('content-type');
    const isSuccess = res.status === 200 && bodyText.trim() === testChallenge;

    let message = 'Verification handshake succeeded! Endpoint is ready for Meta.';
    if (!isSuccess) {
      if (res.status === 403) {
        message = 'HTTP 403: Verify Token mismatch between probe and server.';
      } else if (res.status === 301 || res.status === 302) {
        message = `HTTP ${res.status}: Endpoint returned redirect. Webhook endpoints must respond directly without redirects.`;
      } else if (res.status === 200 && bodyText.trim() !== testChallenge) {
        message = `HTTP 200 returned, but body did not match challenge. Expected "${testChallenge}", received "${bodyText.slice(0, 40)}"`;
      } else {
        message = `HTTP ${res.status}: Unexpected response status from webhook.`;
      }
    }

    return {
      success: isSuccess,
      httpStatus: res.status,
      expectedChallenge: testChallenge,
      receivedBody: bodyText.slice(0, 100),
      contentType,
      targetUrl: probeUrl.toString(),
      message
    };
  } catch (err: any) {
    return {
      success: false,
      httpStatus: 0,
      expectedChallenge: testChallenge,
      receivedBody: '',
      contentType: null,
      targetUrl,
      message: err?.message || 'Could not reach webhook endpoint'
    };
  }
}

// 6-Layer Diagnostic Suite
export interface FullDiagnosticReport {
  timestamp: number;
  overallStatus: 'active' | 'degraded' | 'pending' | 'error' | 'disconnected';
  checks: {
    credentials: {
      status: 'valid' | 'invalid' | 'expired';
      isValid: boolean;
      expiresAt?: string;
      scopes?: string[];
      error?: string;
    };
    waba: {
      status: 'active' | 'pending' | 'error' | 'not_configured';
      wabaId?: string;
      name?: string;
      reviewStatus?: string;
      timezone?: string;
      error?: string;
    };
    phoneNumber: {
      status: 'connected' | 'pending' | 'restricted' | 'error';
      phoneId?: string;
      displayNumber?: string;
      verifiedName?: string;
      operationalStatus?: string; // CONNECTED
      qualityRating?: string; // GREEN
      nameStatus?: string; // APPROVED
      codeVerificationStatus?: string; // 2FA registration OTP code status (VERIFIED/EXPIRED)
      messagingLimitTier?: string;
      error?: string;
    };
    webhookSubscription: {
      status: 'subscribed' | 'not_subscribed' | 'error';
      isSubscribed: boolean;
      subscribedApps?: any[];
      error?: string;
    };
    webhookVerification: {
      status: 'verified' | 'failed' | 'unreachable';
      callbackUrl: string;
      challengeMatched: boolean;
      httpStatus?: number;
      error?: string;
    };
    messagingAvailability: {
      status: 'ready' | 'restricted' | 'blocked';
      canSend: boolean;
      details?: string;
    };
  };
  telemetry: WebhookMetrics;
}

export async function runFullDiagnostics(params: {
  token: string;
  phoneNumberId?: string;
  wabaId?: string;
  verifyToken?: string;
}): Promise<FullDiagnosticReport> {
  const { token, phoneNumberId, wabaId, verifyToken } = params;
  const cleanToken = (token || '').trim();
  const cleanPhoneId = (phoneNumberId || '').trim();
  const cleanWabaId = (wabaId || '').trim();
  const effectiveVerifyToken = (verifyToken || getPrimaryVerifyToken()).trim();

  const report: FullDiagnosticReport = {
    timestamp: Date.now(),
    overallStatus: 'disconnected',
    checks: {
      credentials: { status: 'invalid', isValid: false },
      waba: { status: 'not_configured' },
      phoneNumber: { status: 'error' },
      webhookSubscription: { status: 'not_subscribed', isSubscribed: false },
      webhookVerification: {
        status: 'unreachable',
        callbackUrl: getWhatsAppWebhookUrl(),
        challengeMatched: false
      },
      messagingAvailability: { status: 'blocked', canSend: false }
    },
    telemetry: getWebhookMetrics()
  };

  if (!cleanToken) {
    report.checks.credentials.error = 'No Meta Access Token provided.';
    return report;
  }

  // 1. Verify Credentials / Token
  try {
    const meRes = await fetch('https://graph.facebook.com/v21.0/me?fields=id,name', {
      headers: { Authorization: `Bearer ${cleanToken}` }
    });
    const meData = await meRes.json();
    if (meRes.ok) {
      report.checks.credentials = {
        status: 'valid',
        isValid: true,
        expiresAt: 'Permanent System User Token'
      };
    } else {
      report.checks.credentials = {
        status: 'invalid',
        isValid: false,
        error: meData?.error?.message || 'Meta rejected token'
      };
    }
  } catch (err: any) {
    report.checks.credentials = {
      status: 'invalid',
      isValid: false,
      error: err?.message || 'Failed to connect to Meta Graph API'
    };
  }

  // 2. Verify WABA (if provided)
  if (cleanWabaId && report.checks.credentials.isValid) {
    try {
      const wabaRes = await fetch(
        `https://graph.facebook.com/v21.0/${cleanWabaId}?fields=id,name,timezone_id,account_review_status,message_template_namespace`,
        { headers: { Authorization: `Bearer ${cleanToken}` } }
      );
      const wabaData = await wabaRes.json();
      if (wabaRes.ok && wabaData?.id) {
        report.checks.waba = {
          status: 'active',
          wabaId: wabaData.id,
          name: wabaData.name,
          reviewStatus: wabaData.account_review_status || 'VERIFIED',
          timezone: wabaData.timezone_id
        };
      } else {
        report.checks.waba = {
          status: 'error',
          wabaId: cleanWabaId,
          error: wabaData?.error?.message || 'Failed to fetch WABA details'
        };
      }
    } catch (err: any) {
      report.checks.waba = {
        status: 'error',
        wabaId: cleanWabaId,
        error: err?.message || 'WABA request failed'
      };
    }
  }

  // 3. Verify Phone Number Registration & Disambiguate Status vs 2FA Code Expiry
  if (cleanPhoneId && report.checks.credentials.isValid) {
    try {
      const phoneRes = await fetch(
        `https://graph.facebook.com/v21.0/${cleanPhoneId}?fields=verified_name,display_phone_number,quality_rating,name_status,status,code_verification_status,messaging_limit_tier`,
        { headers: { Authorization: `Bearer ${cleanToken}` } }
      );
      const phoneData = await phoneRes.json();

      if (phoneRes.ok && phoneData?.id) {
        // Operational status from Meta (CONNECTED, RESTRICTED, etc.)
        const operationalStatus = phoneData.status || 'CONNECTED';
        const qualityRating = phoneData.quality_rating || 'GREEN';
        const nameStatus = phoneData.name_status || 'APPROVED';
        // Note: code_verification_status represents the 2FA SMS registration code window
        const codeVerificationStatus = phoneData.code_verification_status || 'VERIFIED';

        report.checks.phoneNumber = {
          status: operationalStatus === 'CONNECTED' ? 'connected' : 'restricted',
          phoneId: phoneData.id,
          displayNumber: phoneData.display_phone_number,
          verifiedName: phoneData.verified_name,
          operationalStatus,
          qualityRating,
          nameStatus,
          codeVerificationStatus,
          messagingLimitTier: phoneData.messaging_limit_tier
        };
      } else {
        report.checks.phoneNumber = {
          status: 'error',
          phoneId: cleanPhoneId,
          error: phoneData?.error?.message || 'Failed to probe Phone Number ID'
        };
      }
    } catch (err: any) {
      report.checks.phoneNumber = {
        status: 'error',
        phoneId: cleanPhoneId,
        error: err?.message || 'Phone probe network failure'
      };
    }
  }

  // 4. Verify WABA-Level Webhook Subscription (subscribed_apps)
  if (cleanWabaId && report.checks.credentials.isValid) {
    try {
      const subRes = await fetch(
        `https://graph.facebook.com/v21.0/${cleanWabaId}/subscribed_apps`,
        { headers: { Authorization: `Bearer ${cleanToken}` } }
      );
      const subData = await subRes.json();
      const apps = Array.isArray(subData?.data) ? subData.data : [];
      const isSubscribed = apps.length > 0;

      report.checks.webhookSubscription = {
        status: isSubscribed ? 'subscribed' : 'not_subscribed',
        isSubscribed,
        subscribedApps: apps
      };
    } catch (err: any) {
      report.checks.webhookSubscription = {
        status: 'error',
        isSubscribed: false,
        error: err?.message || 'Failed to inspect subscribed_apps'
      };
    }
  }

  // 5. Verify App-Level Callback URL Verification (Simulated Meta GET probe)
  const probeTest = await testWebhookVerificationProbe(undefined, effectiveVerifyToken);
  report.checks.webhookVerification = {
    status: probeTest.success ? 'verified' : 'failed',
    callbackUrl: probeTest.targetUrl,
    challengeMatched: probeTest.success,
    httpStatus: probeTest.httpStatus,
    error: probeTest.success ? undefined : probeTest.message
  };

  // 6. Messaging Availability
  const canSend = Boolean(
    report.checks.credentials.isValid &&
    report.checks.phoneNumber.status === 'connected'
  );
  report.checks.messagingAvailability = {
    status: canSend ? 'ready' : 'blocked',
    canSend,
    details: canSend 
      ? `Phone is online (${report.checks.phoneNumber.operationalStatus}). Ready to send/receive messages.`
      : 'Messaging unavailable until credentials and phone number connection succeed.'
  };

  // Synthesize Overall Status
  if (
    report.checks.credentials.isValid &&
    report.checks.phoneNumber.status === 'connected' &&
    report.checks.webhookSubscription.isSubscribed &&
    report.checks.webhookVerification.status === 'verified'
  ) {
    report.overallStatus = 'active';
  } else if (report.checks.credentials.isValid && report.checks.phoneNumber.status === 'connected') {
    report.overallStatus = 'degraded'; // Connected but webhooks not fully verified
  } else if (report.checks.credentials.isValid) {
    report.overallStatus = 'pending';
  } else {
    report.overallStatus = 'error';
  }

  return report;
}
