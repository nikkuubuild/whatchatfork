import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { initDatabase, db } from './server/db.js';
import { saasRouter } from './server/routes.js';
import { processInboundWebhookPayload } from './server/multiTenantWebhook.js';
import {
  getAppBaseUrl,
  getWhatsAppWebhookPath,
  getWhatsAppWebhookUrl,
  getTenantWebhookUrl,
  getPrimaryVerifyToken,
  generateTenantVerifyToken,
  verifyWebhookToken,
  verifyMetaHubSignature,
  loadSavedCredentials,
  saveSavedCredentials
} from './server/webhookConfig.js';
import {
  initializeWebhookMetrics,
  getWebhookMetrics,
  logWebhookEvent,
  testWebhookVerificationProbe,
  runFullDiagnostics
} from './server/webhookDiagnostics.js';
import { autoRegisterMetaWebhook } from './server/whatsappConnect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Stored App Secret for HMAC-SHA256 signature verification
let configuredAppSecret: string | null = process.env.WHATSAPP_APP_SECRET || null;

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Trust proxy for Cloud Run reverse proxy
app.set('trust proxy', true);

app.use(express.json({ 
  limit: '50mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure upload directory exists for media files
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Mount SaaS Multi-Tenant API Router
app.use('/api', saasRouter);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const EVENTS_FILE = path.join(DATA_DIR, 'webhook_events.json');

function loadSavedEvents(): WebhookEvent[] {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch (_) {}
  return [];
}

function saveSavedEvents(events: WebhookEvent[]) {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events.slice(0, 200), null, 2), 'utf-8');
  } catch (_) {}
}

// In-memory message & webhook event store
interface WebhookEvent {
  id: string;
  type: 'message' | 'status';
  timestamp: number;
  data: any;
}
const recentEvents: WebhookEvent[] = loadSavedEvents();
let lastKnownToken = process.env.WHATSAPP_ACCESS_TOKEN || loadSavedCredentials().accessToken || '';
configuredAppSecret = process.env.WHATSAPP_APP_SECRET || loadSavedCredentials().appSecret || null;

// Active SSE client connections for instant real-time push (replaces polling completely)
const sseClients = new Map<string, express.Response>();

function broadcastSseEvent(event: WebhookEvent) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const [clientId, clientRes] of sseClients.entries()) {
    try {
      clientRes.write(payload);
    } catch (err) {
      console.warn(`[SSE] Error writing to client ${clientId}, removing:`, err);
      sseClients.delete(clientId);
    }
  }
}

// Function to automatically register webhook with Meta Graph API using permanent domain
async function autoRegisterWebhookWithMeta(params: {
  appId: string;
  appSecret: string;
  accessToken: string;
  wabaId: string;
  verifyToken?: string;
}, effectivePublicUrl?: string) {
  const cleanAppId = String(params.appId).trim();
  const cleanAppSecret = String(params.appSecret).trim();
  const cleanToken = String(params.accessToken).trim();
  const cleanWabaId = String(params.wabaId).trim();
  const effectiveVerifyToken = String(params.verifyToken || getPrimaryVerifyToken()).trim();
  const callbackUrl = (effectivePublicUrl || getWhatsAppWebhookUrl()).trim();

  configuredAppSecret = cleanAppSecret;
  lastKnownToken = cleanToken;

  const appAccessToken = `${cleanAppId}|${cleanAppSecret}`;
  const subParams = new URLSearchParams();
  subParams.append('object', 'whatsapp_business_account');
  subParams.append('callback_url', callbackUrl);
  subParams.append('verify_token', effectiveVerifyToken);
  subParams.append('fields', 'messages,message_template_quality_update,message_template_status_update,account_update,history,smb_app_state_sync,smb_message_echoes');

  console.log(`[AutoRegister] Subscribing Meta App ${cleanAppId} to permanent webhook ${callbackUrl}...`);
  const subRes = await fetch(
    `https://graph.facebook.com/v21.0/${cleanAppId}/subscriptions?access_token=${encodeURIComponent(appAccessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: subParams.toString()
    }
  );
  const subData = await subRes.json();
  console.log('[AutoRegister] App Subscription result:', subData);

  console.log(`[AutoRegister] Subscribing WABA ${cleanWabaId} to app...`);
  const wabaRes = await fetch(
    `https://graph.facebook.com/v21.0/${cleanWabaId}/subscribed_apps`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
  const wabaData = await wabaRes.json();
  console.log('[AutoRegister] WABA Subscribed Apps result:', wabaData);

  return { subData, wabaData, subSuccess: Boolean(subRes.ok && subData?.success), wabaSuccess: Boolean(wabaRes.ok && wabaData?.success) };
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uploadsReady: fs.existsSync(UPLOADS_DIR)
  });
});

// Test WhatsApp Cloud API Connection (Inspects phone status, quality rating, and 2FA code status independently)
app.post('/api/whatsapp/test-connection', async (req, res) => {
  try {
    const { token, phoneNumberId, wabaId } = req.body;

    if (!token || !phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: 'Phone Number ID and Meta Access Token are required.'
      });
    }

    // Probe Phone Number ID with comprehensive operational fields
    const phoneResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,name_status,status,code_verification_status,messaging_limit_tier`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const phoneData = await phoneResponse.json();

    if (!phoneResponse.ok) {
      return res.status(phoneResponse.status).json({
        success: false,
        error: phoneData?.error?.message || 'Meta API returned an error probing Phone Number ID',
        details: phoneData
      });
    }

    // Ensure status fields are clearly delineated to avoid confusing 2FA OTP code expiry with phone status
    phoneData.operational_status = phoneData.status || 'CONNECTED';
    phoneData.two_factor_status = phoneData.code_verification_status || 'VERIFIED';

    // Optionally probe WABA if provided
    let wabaData = null;
    let subscribedAppsData: any = null;
    if (wabaId) {
      try {
        const wabaResponse = await fetch(
          `https://graph.facebook.com/v21.0/${wabaId}?fields=id,name,timezone_id,account_review_status,message_template_namespace`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        wabaData = await wabaResponse.json();

        // Also probe WABA subscribed_apps
        const subAppsResponse = await fetch(
          `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        subscribedAppsData = await subAppsResponse.json();
      } catch (e) {
        console.warn('WABA check error (non-fatal):', e);
      }
    }

    return res.json({
      success: true,
      phone: phoneData,
      waba: wabaData,
      wabaSubscribedApps: subscribedAppsData?.data || []
    });
  } catch (error: any) {
    console.error('Error during test-connection:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to connect to Meta WhatsApp Cloud API'
    });
  }
});

// Proxy: Get Message Templates
app.get('/api/whatsapp/templates', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string);
    const wabaId = (req.query.wabaId as string) || (req.headers['x-waba-id'] as string);

    if (!token || !wabaId) {
      return res.status(400).json({
        success: false,
        error: 'Access Token and WABA ID are required to fetch templates.'
      });
    }

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates?limit=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data?.error?.message || 'Failed to fetch templates from Meta',
        details: data
      });
    }

    return res.json({
      success: true,
      templates: data.data || []
    });
  } catch (error: any) {
    console.error('Error fetching templates:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch templates'
    });
  }
});

// Proxy: Create Message Template on Meta
app.post('/api/whatsapp/templates', async (req, res) => {
  try {
    const { token, wabaId, templateData } = req.body;

    if (!token || !wabaId || !templateData) {
      return res.status(400).json({
        success: false,
        error: 'Access Token, WABA ID, and templateData are required.'
      });
    }

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(templateData)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data?.error?.message || 'Failed to create template on Meta',
        details: data
      });
    }

    return res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error creating template:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to create template'
    });
  }
});

// Upload Media Endpoint (stores locally or prepares for WhatsApp send)
app.post('/api/whatsapp/upload-local-media', async (req, res) => {
  try {
    const { filename, base64Data, mimeType } = req.body;

    if (!base64Data || !mimeType) {
      return res.status(400).json({
        success: false,
        error: 'base64Data and mimeType are required'
      });
    }

    // Clean base64 string
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const ext = path.extname(filename || '') || (mimeType.includes('audio') ? '.webm' : mimeType.includes('image') ? '.jpg' : mimeType.includes('pdf') ? '.pdf' : '.bin');
    const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(UPLOADS_DIR, safeName);

    fs.writeFileSync(filePath, buffer);

    // Build accessible URL
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const publicUrl = `${appUrl}/uploads/${safeName}`;

    return res.json({
      success: true,
      filename: safeName,
      url: publicUrl,
      size: buffer.length,
      mimeType
    });
  } catch (error: any) {
    console.error('Error uploading local media:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to save media file'
    });
  }
});

// Proxy: Stream/Download media from Meta WhatsApp Cloud API
app.get('/api/whatsapp/media/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '') || lastKnownToken;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required to fetch WhatsApp media' });
    }

    // 1. Retrieve the media URL from Meta
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const metaData = await metaRes.json();
    if (!metaRes.ok || !metaData.url) {
      return res.status(metaRes.status || 400).json({
        success: false,
        error: metaData?.error?.message || 'Failed to retrieve media URL from Meta'
      });
    }

    // 2. Fetch the binary file from the Meta CDN using Bearer auth
    const fileRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!fileRes.ok) {
      return res.status(fileRes.status).send('Failed to fetch media file stream');
    }

    const contentType = fileRes.headers.get('content-type') || metaData.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    if (metaData.file_size) {
      res.setHeader('Content-Length', metaData.file_size);
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error('Error proxying WhatsApp media:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Internal error downloading media' });
  }
});

// Supported webhook paths (global, tenant-specific, and WhatsJet /whatsapp-webhook/{vendorUid} routes)
const WEBHOOK_PATHS = [
  '/api/whatsapp/webhook',
  '/api/whatsapp/webhook/',
  '/api/whatsapp/webhook/:tenantId',
  '/api/whatsapp/webhook/:tenantId/',
  '/whatsapp-webhook/:tenantId',
  '/whatsapp-webhook/:tenantId/',
  '/webhook',
  '/webhook/'
];

// Meta Webhook Verification (GET)
// Strictly fulfills Meta Cloud API verification specs:
// 1. hub.mode === 'subscribe'
// 2. hub.verify_token matching configured token via constant-time comparison
// 3. Exact hub.challenge returned as text/plain
// 4. HTTP 403 on mismatch (no HTML, no JSON, no redirects)
app.get(WEBHOOK_PATHS, async (req, res) => {
  const tenantId = req.params?.tenantId as string | undefined;
  const mode = (
    req.query['hub.mode'] || 
    (req.query.hub as any)?.mode || 
    req.query.mode || 
    req.query['hub_mode']
  ) as string | undefined;

  const token = (
    req.query['hub.verify_token'] || 
    (req.query.hub as any)?.verify_token || 
    req.query.verify_token || 
    req.query['hub_verify_token']
  ) as string | undefined;

  const challenge = (
    req.query['hub.challenge'] || 
    (req.query.hub as any)?.challenge || 
    req.query.challenge || 
    req.query['hub_challenge']
  ) as string | undefined;

  console.log('[Meta Webhook GET Request]', {
    path: req.path,
    tenantId: tenantId || 'global',
    mode,
    hasToken: Boolean(token),
    hasChallenge: Boolean(challenge)
  });

  // Verification request from Meta Developer Dashboard / WhatsApp Cloud API
  if (mode === 'subscribe' && challenge !== undefined) {
    const isTokenMatch = await verifyWebhookToken(token, tenantId);

    if (isTokenMatch) {
      console.log(`[Meta Webhook] Successfully verified with challenge: ${challenge} (tenant: ${tenantId || 'global'})`);
      
      // If verified for a specific tenant, record webhook_verified_at in database
      if (tenantId) {
        try {
          await db.prepare('UPDATE whatsapp_channels SET webhook_verified_at = ? WHERE tenant_id = ?').run(Date.now(), tenantId);
        } catch (_) {}
      }

      return res
        .status(200)
        .set('Content-Type', 'text/plain; charset=utf-8')
        .send(String(challenge));
    } else {
      console.warn(`[Meta Webhook] Verification rejected for tenant: ${tenantId || 'global'}`);
      return res
        .status(403)
        .set('Content-Type', 'text/plain; charset=utf-8')
        .send('Forbidden');
    }
  }

  // Reject non-subscription or malformed verification queries with HTTP 400 plain text
  return res
    .status(400)
    .set('Content-Type', 'text/plain; charset=utf-8')
    .send('Bad Request: Invalid verification query');
});

// Support HEAD requests cleanly
app.head(WEBHOOK_PATHS, (_req, res) => {
  res.status(200).set('Content-Type', 'text/plain; charset=utf-8').end();
});

// Meta Webhook Inbound Events (POST)
// 1. Validates X-Hub-Signature-256 with correct candidate App Secret (BYOA or Platform)
// 2. Acknowledges promptly with HTTP 200 text/plain
// 3. Dispatches multi-tenant processing asynchronously with idempotency
app.post(WEBHOOK_PATHS, async (req: any, res) => {
  try {
    const body = req.body;
    const rawBody = req.rawBody;
    const hubSignature = req.headers['x-hub-signature-256'] as string | undefined;
    const explicitTenantId = req.params?.tenantId as string | undefined;

    // Extract WABA ID & Phone Number ID from incoming payload
    const firstEntry = body?.entry?.[0];
    const wabaId = firstEntry?.id;
    const firstChange = firstEntry?.changes?.[0];
    const phoneNumberId = firstChange?.value?.metadata?.phone_number_id;

    // Verify HMAC-SHA256 signature using appropriate tenant or platform secret
    const sigCheck = await verifyMetaHubSignature({
      rawBody,
      hubSignatureHeader: hubSignature,
      wabaId,
      phoneNumberId,
      tenantId: explicitTenantId
    });

    if (sigCheck.required && !sigCheck.isValid) {
      console.warn(`[Meta Webhook POST] Signature rejected: ${sigCheck.reason}`);
      await logWebhookEvent({
        tenantId: explicitTenantId || null,
        eventType: 'signature_failed',
        payload: { reason: sigCheck.reason, wabaId, phoneNumberId, explicitTenantId },
        isError: true
      });
      return res
        .status(401)
        .set('Content-Type', 'text/plain; charset=utf-8')
        .send('Unauthorized: Invalid Signature');
    }

    // Acknowledge valid webhook receipt to Meta immediately
    res.status(200).set('Content-Type', 'text/plain; charset=utf-8').send('EVENT_RECEIVED');

    // Run expensive database and SSE operations asynchronously
    setImmediate(async () => {
      try {
        if (body?.object === 'whatsapp_business_account') {
          // Multi-tenant database routing & isolated tenant SSE push
          await processInboundWebhookPayload(body, explicitTenantId);

          const entries = body.entry || [];
          for (const entry of entries) {
            const changes = entry.changes || [];
            for (const change of changes) {
              const value = change.value;
              if (value) {
                // New Inbound Messages
                if (value.messages) {
                  for (const msg of value.messages) {
                    const contact = (value.contacts && value.contacts[0]) || null;
                    const ev: WebhookEvent = {
                      id: msg.id || `${Date.now()}_${Math.random()}`,
                      type: 'message',
                      timestamp: parseInt(msg.timestamp || '0', 10) * 1000 || Date.now(),
                      data: {
                        ...msg,
                        contactName: contact?.profile?.name || msg.from,
                        phoneNumberId: value.metadata?.phone_number_id
                      }
                    };
                    recentEvents.unshift(ev);
                    broadcastSseEvent(ev);
                  }
                }
                // Message Status Updates
                if (value.statuses) {
                  for (const status of value.statuses) {
                    const ev: WebhookEvent = {
                      id: status.id || `${Date.now()}_${Math.random()}`,
                      type: 'status',
                      timestamp: parseInt(status.timestamp || '0', 10) * 1000 || Date.now(),
                      data: status
                    };
                    recentEvents.unshift(ev);
                    broadcastSseEvent(ev);
                  }
                }
              }
            }
          }

          if (recentEvents.length > 200) {
            recentEvents.length = 200;
          }
          saveSavedEvents(recentEvents);
        }
      } catch (asyncErr) {
        console.error('[Async Inbound Webhook Error]:', asyncErr);
        await logWebhookEvent({
          tenantId: explicitTenantId || null,
          eventType: 'async_inbound_error',
          payload: { error: String(asyncErr) },
          isError: true
        });
      }
    });
  } catch (e) {
    console.error('Webhook error:', e);
    if (!res.headersSent) {
      return res.status(200).set('Content-Type', 'text/plain; charset=utf-8').send('ERROR_HANDLED');
    }
  }
});

// Proxy: 1-Click Auto Setup Webhook via Meta Graph API (WhatsJet automated flow)
// Registers webhook callback on Meta App, connects WABA via subscribed_apps, and fetches phone numbers automatically
app.post('/api/whatsapp/auto-setup', async (req, res) => {
  try {
    const { appId, appSecret, accessToken, wabaId, tenantId } = req.body;

    if (!appId || !appSecret || !accessToken || !wabaId) {
      return res.status(400).json({
        success: false,
        error: 'App ID, App Secret, WhatsApp Access Token, and WABA ID are all required.'
      });
    }

    const result = await autoRegisterMetaWebhook({
      tenantId: tenantId ? String(tenantId).trim() : undefined,
      appId: String(appId).trim(),
      appSecret: String(appSecret).trim(),
      accessToken: String(accessToken).trim(),
      wabaId: String(wabaId).trim(),
      req
    });

    if (result.success && result.primaryPhone) {
      saveSavedCredentials({
        appId: String(appId).trim(),
        appSecret: String(appSecret).trim(),
        accessToken: String(accessToken).trim(),
        wabaId: String(wabaId).trim(),
        phoneNumberId: result.primaryPhone.id
      });
    }

    return res.json({
      success: result.success,
      subSuccess: result.subSuccess,
      wabaSuccess: result.wabaSuccess,
      callbackUrlUsed: result.callbackUrl,
      verifyTokenUsed: result.verifyToken,
      phoneNumbers: result.phoneNumbers,
      primaryPhone: result.primaryPhone,
      recommendedPhoneNumberId: result.primaryPhone?.id || null,
      log: result.log,
      error: result.error
    });
  } catch (err: any) {
    console.error('[AutoSetup Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Unexpected server error during auto-setup'
    });
  }
});

// Save credentials server-side and trigger background auto-registration
app.post('/api/whatsapp/save-credentials', async (req, res) => {
  try {
    const creds = req.body;
    await saveSavedCredentials(creds);
    if (creds.accessToken) lastKnownToken = creds.accessToken;
    if (creds.appSecret) configuredAppSecret = creds.appSecret;

    if (creds.appId && creds.appSecret && creds.wabaId && creds.accessToken) {
      autoRegisterWebhookWithMeta(creds, getWhatsAppWebhookUrl()).catch(() => {});
    }

    return res.json({ success: true, message: 'Credentials saved on server' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to save credentials' });
  }
});

// Retrieve server-saved credentials on frontend mount
app.get('/api/whatsapp/credentials', (req, res) => {
  const creds = loadSavedCredentials();
  res.json({ success: true, credentials: creds });
});

// Proxy: Discover / List Phone Numbers for WABA
app.get('/api/whatsapp/phone-numbers', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || (req.query.token as string);
    const wabaId = (req.query.wabaId as string) || (req.headers['x-waba-id'] as string);

    if (!token || !wabaId) {
      return res.status(400).json({
        success: false,
        error: 'Access Token and WABA ID are required.'
      });
    }

    const response = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/phone_numbers`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data?.error?.message || 'Failed to list phone numbers from Meta',
        details: data
      });
    }

    return res.json({
      success: true,
      phoneNumbers: data.data || []
    });
  } catch (error: any) {
    console.error('Error fetching phone numbers:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch phone numbers'
    });
  }
});

// SSE (Server-Sent Events) live real-time push endpoint (instant notifications, no polling)
app.get('/api/whatsapp/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  sseClients.set(clientId, res);
  console.log(`[SSE] Client connected: ${clientId} (Total active: ${sseClients.size})`);

  // Send initial connection ACK
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId, serverTime: Date.now() })}\n\n`);

  // Send initial backlog so client is instantly up-to-date upon opening the page
  res.write(`data: ${JSON.stringify({ type: 'backlog', events: recentEvents.slice(0, 50) })}\n\n`);

  // Keep-alive heartbeat comment every 20 seconds to prevent reverse proxy/Cloudflare timeout
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAliveInterval);
      sseClients.delete(clientId);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    sseClients.delete(clientId);
    console.log(`[SSE] Client disconnected: ${clientId} (Total active: ${sseClients.size})`);
  });
});

// Polling endpoint for frontend to receive live webhook events (legacy fallback)
app.get('/api/whatsapp/live-events', (req, res) => {
  const since = parseInt((req.query.since as string) || '0', 10);
  const filtered = since > 0 
    ? recentEvents.filter(ev => ev.timestamp > since)
    : recentEvents.slice(0, 50);

  res.json({
    success: true,
    events: filtered,
    serverTime: Date.now()
  });
});

// Endpoint providing permanent Meta-accessible production webhook configuration & metrics
app.get('/api/whatsapp/public-webhook-info', async (req, res) => {
  const tenantId = (req.query.tenantId as string) || (req.headers['x-tenant-id'] as string) || undefined;
  const baseUrl = getAppBaseUrl(req);
  const webhookUrl = tenantId ? getTenantWebhookUrl(tenantId, req) : getWhatsAppWebhookUrl(req);
  const verifyToken = tenantId ? generateTenantVerifyToken(tenantId) : getPrimaryVerifyToken();
  const metrics = getWebhookMetrics();

  res.json({
    success: true,
    baseUrl,
    tenantId,
    webhookUrl,
    recommendedWebhookUrl: webhookUrl,
    verifyToken,
    isHttps: webhookUrl.startsWith('https://'),
    isPermanentDomain: true,
    metrics
  });
});

// Endpoint for app UI to test Meta GET verification probe directly against the permanent endpoint
app.post('/api/whatsapp/test-webhook', async (req, res) => {
  try {
    const probe = await testWebhookVerificationProbe(req.body.url, req.body.verifyToken);
    return res.json({
      success: probe.success,
      status: probe.httpStatus,
      receivedBody: probe.receivedBody,
      expectedChallenge: probe.expectedChallenge,
      targetUrl: probe.targetUrl,
      contentType: probe.contentType,
      message: probe.message
    });
  } catch (err: any) {
    console.error('[Webhook Verification Probe Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Could not execute verification probe'
    });
  }
});

// Endpoint for full 6-layer diagnostic inspection across credentials, WABA, Phone, Subscriptions, and Verification
app.post('/api/whatsapp/diagnostics', async (req, res) => {
  try {
    const { token, phoneNumberId, wabaId, verifyToken } = req.body;
    const report = await runFullDiagnostics({
      token,
      phoneNumberId,
      wabaId,
      verifyToken
    });
    return res.json({ success: true, report });
  } catch (err: any) {
    console.error('[WhatsApp Diagnostics Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to complete diagnostic report'
    });
  }
});

// Endpoint to retrieve live webhook telemetry stats
app.get('/api/whatsapp/webhook-stats', (_req, res) => {
  res.json({
    success: true,
    metrics: getWebhookMetrics()
  });
});

// Start dev server with Vite middlewares or static files
async function startServer() {
  // Initialize PostgreSQL Database schema & relations
  await initDatabase();

  // Initialize Webhook Telemetry metrics from database
  await initializeWebhookMetrics();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsCloud server running on http://0.0.0.0:${PORT}`);
    console.log(`>>> Permanent Production WhatsApp Webhook: ${getWhatsAppWebhookUrl()}`);
    console.log(`>>> Webhook Verify Token: ${getPrimaryVerifyToken()}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
