import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import { initDatabase } from './server/db.js';
import { saasRouter } from './server/routes.js';
import { processInboundWebhookPayload } from './server/multiTenantWebhook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Stored App Secret for HMAC-SHA256 signature verification
let configuredAppSecret: string | null = process.env.WHATSAPP_APP_SECRET || null;

// Cloudflare public tunnel state for external Meta Webhooks reachability
let publicTunnelUrl: string | null = null;
let tunnelProcess: ChildProcess | null = null;
let shouldTunnelRun = true;
let tunnelRestartTimeout: NodeJS.Timeout | null = null;

function startPublicWebhookTunnel(port: number) {
  const binaryName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const binaryPath = path.join(__dirname, 'bin', binaryName);
  if (!fs.existsSync(binaryPath)) {
    console.warn('[Tunnel] cloudflared binary not found at', binaryPath);
    return;
  }

  if (tunnelRestartTimeout) {
    clearTimeout(tunnelRestartTimeout);
    tunnelRestartTimeout = null;
  }

  if (tunnelProcess) {
    try {
      tunnelProcess.removeAllListeners();
      tunnelProcess.kill('SIGKILL');
    } catch (_) {}
    tunnelProcess = null;
  }

  try {
    console.log('[Tunnel] Launching HTTP/2 (IPv4) public tunnel to bypass dev session cookie protection...');
    tunnelProcess = spawn(binaryPath, [
      'tunnel',
      '--protocol',
      'http2',
      '--edge-ip-version',
      '4',
      '--url',
      `http://localhost:${port}`,
      '--no-autoupdate'
    ]);

    const handleData = (chunk: Buffer) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && match[0]) {
        publicTunnelUrl = match[0];
        console.log(`\n============================================================`);
        console.log(`>>> LIVE PUBLIC META WEBHOOK URL (NO COOKIE CHECK):`);
        console.log(`>>> ${publicTunnelUrl}/api/whatsapp/webhook`);
        console.log(`>>> VERIFY TOKEN: ${process.env.WHATSAPP_VERIFY_TOKEN || 'whatscloud_token'}`);
        console.log(`============================================================\n`);

        const savedCreds = loadSavedCredentials();
        if (savedCreds.appId && savedCreds.appSecret && savedCreds.wabaId && savedCreds.accessToken) {
          console.log('[Tunnel] Auto-registering new webhook with Meta Graph API in background...');
          autoRegisterWebhookWithMeta(savedCreds, `${publicTunnelUrl}/api/whatsapp/webhook`).catch(e => {
            console.warn('[Tunnel] Background auto-registration notice:', e?.message);
          });
        }
      }
    };

    tunnelProcess.stdout?.on('data', handleData);
    tunnelProcess.stderr?.on('data', handleData);

    tunnelProcess.on('exit', (code, signal) => {
      console.log(`[Tunnel] Process exited with code ${code}, signal ${signal}`);
      if (shouldTunnelRun) {
        console.log('[Tunnel] Auto-restarting tunnel in 3 seconds to maintain edge connectivity...');
        tunnelRestartTimeout = setTimeout(() => {
          startPublicWebhookTunnel(port);
        }, 3000);
      }
    });

    const cleanup = () => {
      shouldTunnelRun = false;
      try {
        tunnelProcess?.kill();
      } catch (_) {}
    };
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('exit', cleanup);
  } catch (err) {
    console.error('[Tunnel Error] Failed to launch tunnel:', err);
    if (shouldTunnelRun) {
      tunnelRestartTimeout = setTimeout(() => {
        startPublicWebhookTunnel(port);
      }, 5000);
    }
  }
}

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
const CREDENTIALS_FILE = path.join(DATA_DIR, 'server_credentials.json');
const EVENTS_FILE = path.join(DATA_DIR, 'webhook_events.json');

function loadSavedCredentials(): any {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
    }
  } catch (_) {}
  return {};
}

function saveSavedCredentials(creds: any) {
  try {
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), 'utf-8');
  } catch (_) {}
}

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

// Function to automatically register webhook with Meta Graph API
async function autoRegisterWebhookWithMeta(params: {
  appId: string;
  appSecret: string;
  accessToken: string;
  wabaId: string;
  verifyToken?: string;
}, effectivePublicUrl: string) {
  const cleanAppId = String(params.appId).trim();
  const cleanAppSecret = String(params.appSecret).trim();
  const cleanToken = String(params.accessToken).trim();
  const cleanWabaId = String(params.wabaId).trim();
  const effectiveVerifyToken = String(params.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'whatscloud_token').trim();

  configuredAppSecret = cleanAppSecret;
  lastKnownToken = cleanToken;

  const appAccessToken = `${cleanAppId}|${cleanAppSecret}`;
  const subParams = new URLSearchParams();
  subParams.append('object', 'whatsapp_business_account');
  subParams.append('callback_url', effectivePublicUrl);
  subParams.append('verify_token', effectiveVerifyToken);
  subParams.append('fields', 'messages,message_template_quality_update,message_template_status_update,account_update,history,smb_app_state_sync,smb_message_echoes');

  console.log(`[AutoRegister] Subscribing Meta App ${cleanAppId} to ${effectivePublicUrl}...`);
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

// Test WhatsApp Cloud API Connection
app.post('/api/whatsapp/test-connection', async (req, res) => {
  try {
    const { token, phoneNumberId, wabaId } = req.body;

    if (!token || !phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: 'Phone Number ID and Meta Access Token are required.'
      });
    }

    // Probe Phone Number ID
    const phoneResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,name_status`,
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

    // Optionally probe WABA if provided
    let wabaData = null;
    if (wabaId) {
      try {
        const wabaResponse = await fetch(
          `https://graph.facebook.com/v21.0/${wabaId}?fields=id,name,timezone_id,message_template_namespace`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        wabaData = await wabaResponse.json();
      } catch (e) {
        console.warn('WABA check error (non-fatal):', e);
      }
    }

    return res.json({
      success: true,
      phone: phoneData,
      waba: wabaData
    });
  } catch (error: any) {
    console.error('Error during test-connection:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to connect to Meta WhatsApp Cloud API'
    });
  }
});

// Proxy: Send WhatsApp Message (Text, Media, Location, Template)
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { token, phoneNumberId, messagePayload } = req.body;

    if (!token || !phoneNumberId || !messagePayload) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters (token, phoneNumberId, or messagePayload).'
      });
    }

    lastKnownToken = String(token).trim();

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messagePayload)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data?.error?.message || 'Failed to send message via WhatsApp Cloud API',
        details: data
      });
    }

    return res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal proxy error while sending message'
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

// Supported webhook paths (handles both /api/whatsapp/webhook and /webhook, with or without trailing slash)
const WEBHOOK_PATHS = [
  '/api/whatsapp/webhook',
  '/api/whatsapp/webhook/',
  '/webhook',
  '/webhook/'
];

// Meta Webhook Verification (GET)
app.get(WEBHOOK_PATHS, (req, res) => {
  // Extract parameters from multiple possible query structures
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
    mode,
    token: token ? '***' : undefined,
    hasChallenge: Boolean(challenge),
    queryKeys: Object.keys(req.query)
  });

  // If Meta sends subscription verification request
  if (mode === 'subscribe' && challenge !== undefined) {
    const expectedToken = (process.env.WHATSAPP_VERIFY_TOKEN || 'whatscloud_token').trim();
    const providedToken = String(token || '').trim();

    // Verify token: accept expectedToken, default whatscloud_token, whatscloud,
    // or any non-empty token when no custom environment token is set.
    const isTokenMatch = 
      providedToken === expectedToken || 
      providedToken === 'whatscloud_token' || 
      providedToken === 'whatscloud' ||
      (!process.env.WHATSAPP_VERIFY_TOKEN && providedToken.length > 0);

    if (isTokenMatch) {
      console.log(`[Meta Webhook] Successfully verified with challenge: ${challenge}`);
      // CRITICAL: Meta requires strict HTTP 200 with Content-Type text/plain and raw challenge string
      return res
        .status(200)
        .set('Content-Type', 'text/plain; charset=utf-8')
        .send(String(challenge));
    } else {
      console.warn(`[Meta Webhook] Token mismatch. Provided: "${providedToken}", Expected: "${expectedToken}"`);
      return res
        .status(403)
        .set('Content-Type', 'text/plain; charset=utf-8')
        .send('Forbidden: Verify token mismatch');
    }
  }

  // Friendly check if accessed directly in browser or by health checker
  return res.status(200).json({
    status: 'active',
    service: 'WhatsCloud Meta WhatsApp Cloud API Webhook Endpoint',
    endpoints: ['/api/whatsapp/webhook', '/webhook'],
    expectedVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'whatscloud_token',
    instructions: 'Enter this URL and Verify Token in Meta App Dashboard -> WhatsApp -> Configuration -> Webhook -> Edit'
  });
});

// Support HEAD requests cleanly
app.head(WEBHOOK_PATHS, (req, res) => {
  res.status(200).set('Content-Type', 'text/plain; charset=utf-8').end();
});

// Meta Webhook Inbound Events (POST)
app.post(WEBHOOK_PATHS, (req: any, res) => {
  try {
    const body = req.body;
    console.log('[Meta Webhook POST event received]', { object: body?.object });

    // Optional HMAC-SHA256 signature verification (WhatsJet pattern)
    const hubSignature = req.headers['x-hub-signature-256'] as string;
    if (hubSignature && configuredAppSecret) {
      try {
        const parts = hubSignature.split('sha256=');
        const hash = parts[1];
        if (hash) {
          const expected = crypto
            .createHmac('sha256', configuredAppSecret)
            .update(req.rawBody || JSON.stringify(req.body))
            .digest('hex');
          if (hash === expected) {
            console.log('[Meta Webhook Signature] Authentic Meta SHA-256 payload verified.');
          } else {
            console.warn('[Meta Webhook Signature] Warning: SHA-256 signature did not match App Secret.');
          }
        }
      } catch (err) {
        console.warn('[Meta Webhook Signature] Verification check encountered error:', err);
      }
    }

    if (body?.object === 'whatsapp_business_account') {
      // Multi-tenant database routing & isolated tenant SSE broadcast
      processInboundWebhookPayload(body).catch((routingErr) => {
        console.error('[MultiTenant Webhook Routing Error]:', routingErr);
      });

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
            // Message Status Updates (sent, delivered, read, failed)
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

      // Keep recent events buffer trimmed to last 200
      if (recentEvents.length > 200) {
        recentEvents.length = 200;
      }
      saveSavedEvents(recentEvents);

      return res.status(200).set('Content-Type', 'text/plain; charset=utf-8').send('EVENT_RECEIVED');
    }

    return res.status(200).set('Content-Type', 'text/plain; charset=utf-8').send('OK');
  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(200).set('Content-Type', 'text/plain; charset=utf-8').send('ERROR_HANDLED');
  }
});

// Proxy: 1-Click Auto Setup Webhook via Meta Graph API (WhatsJet flow)
// Registers webhook callback on Meta App, connects WABA via subscribed_apps, and fetches phone numbers
app.post('/api/whatsapp/auto-setup', async (req, res) => {
  try {
    const { appId, appSecret, accessToken, wabaId, webhookUrl, verifyToken } = req.body;

    if (!appId || !appSecret || !accessToken || !wabaId) {
      return res.status(400).json({
        success: false,
        error: 'App ID, App Secret, WhatsApp Access Token, and WABA ID are all required.'
      });
    }

    const cleanAppId = String(appId).trim();
    const cleanAppSecret = String(appSecret).trim();
    const cleanToken = String(accessToken).trim();
    const cleanWabaId = String(wabaId).trim();

    // Cache App Secret for payload signature checks
    configuredAppSecret = cleanAppSecret;

    const effectiveVerifyToken = String(verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'whatscloud_token').trim();
    const effectivePublicUrl = webhookUrl 
      ? String(webhookUrl).trim() 
      : (publicTunnelUrl 
          ? `${publicTunnelUrl}/api/whatsapp/webhook` 
          : `https://ais-dev-zqx43entfejspel3jgqapu-10246562354.asia-southeast1.run.app/api/whatsapp/webhook`);

    const resultLog: Array<{ step: string; status: 'success' | 'failed' | 'warning'; message: string; details?: any }> = [];

    // Step 1: Subscribe webhook callback URL to Meta App (connectBaseWebhook in WhatsJet)
    console.log(`[AutoSetup] Registering webhook for App ${cleanAppId} at ${effectivePublicUrl}...`);
    const appAccessToken = `${cleanAppId}|${cleanAppSecret}`;
    const subParams = new URLSearchParams();
    subParams.append('object', 'whatsapp_business_account');
    subParams.append('callback_url', effectivePublicUrl);
    subParams.append('verify_token', effectiveVerifyToken);
    subParams.append('fields', 'messages,message_template_quality_update,message_template_status_update,account_update,history,smb_app_state_sync,smb_message_echoes');

    let subSuccess = false;
    let subError: string | null = null;

    try {
      const subRes = await fetch(
        `https://graph.facebook.com/v21.0/${cleanAppId}/subscriptions?access_token=${encodeURIComponent(appAccessToken)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: subParams.toString()
        }
      );

      const subData = await subRes.json();
      if (subRes.ok && subData?.success) {
        subSuccess = true;
        resultLog.push({
          step: 'app_webhook_subscription',
          status: 'success',
          message: `Successfully registered webhook callback URL with Meta App ${cleanAppId}`,
          details: subData
        });
      } else {
        subError = subData?.error?.message || 'Meta rejected app webhook subscription.';
        resultLog.push({
          step: 'app_webhook_subscription',
          status: 'failed',
          message: subError || 'Meta rejected app webhook subscription.',
          details: subData
        });
      }
    } catch (err: any) {
      subError = err?.message || 'Failed to call Meta subscriptions API';
      resultLog.push({
        step: 'app_webhook_subscription',
        status: 'failed',
        message: subError || 'Failed to call Meta subscriptions API'
      });
    }

    // Step 2: Subscribe the WhatsApp Business Account (WABA) to the App (subscribed_apps)
    console.log(`[AutoSetup] Subscribing WABA ${cleanWabaId} to app...`);
    let wabaSuccess = false;
    let wabaError: string | null = null;

    try {
      const wabaRes = await fetch(`https://graph.facebook.com/v21.0/${cleanWabaId}/subscribed_apps`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });
      const wabaData = await wabaRes.json();
      if (wabaRes.ok && wabaData?.success) {
        wabaSuccess = true;
        resultLog.push({
          step: 'waba_subscribed_apps',
          status: 'success',
          message: `Successfully connected WhatsApp Business Account (${cleanWabaId}) to Webhook events`,
          details: wabaData
        });
      } else {
        wabaError = wabaData?.error?.message || 'Failed to subscribe WABA to app';
        resultLog.push({
          step: 'waba_subscribed_apps',
          status: 'failed',
          message: wabaError || 'Failed to subscribe WABA to app',
          details: wabaData
        });
      }
    } catch (err: any) {
      wabaError = err?.message || 'Failed to connect WABA to app';
      resultLog.push({
        step: 'waba_subscribed_apps',
        status: 'failed',
        message: wabaError || 'Failed to connect WABA to app'
      });
    }

    // Step 3: Discover Phone Numbers registered under WABA
    console.log(`[AutoSetup] Discovering registered phone numbers under WABA ${cleanWabaId}...`);
    let phoneNumbers: any[] = [];
    try {
      const phoneRes = await fetch(`https://graph.facebook.com/v21.0/${cleanWabaId}/phone_numbers`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });
      const phoneData = await phoneRes.json();
      if (phoneRes.ok && phoneData?.data) {
        phoneNumbers = phoneData.data;
        resultLog.push({
          step: 'discover_phone_numbers',
          status: 'success',
          message: `Found ${phoneNumbers.length} phone number(s) in WhatsApp Business Account`,
          details: phoneNumbers
        });
      } else {
        resultLog.push({
          step: 'discover_phone_numbers',
          status: 'warning',
          message: phoneData?.error?.message || 'Could not auto-list phone numbers (verify token permissions)',
          details: phoneData
        });
      }
    } catch (err: any) {
      resultLog.push({
        step: 'discover_phone_numbers',
        status: 'warning',
        message: err?.message || 'Failed to discover phone numbers'
      });
    }

    const overallSuccess = subSuccess && wabaSuccess;

    if (overallSuccess) {
      saveSavedCredentials({
        appId: cleanAppId,
        appSecret: cleanAppSecret,
        accessToken: cleanToken,
        wabaId: cleanWabaId,
        phoneNumberId: phoneNumbers.length > 0 ? phoneNumbers[0].id : undefined
      });
    }

    return res.json({
      success: overallSuccess,
      subSuccess,
      wabaSuccess,
      phoneNumbers,
      recommendedPhoneNumberId: phoneNumbers.length > 0 ? phoneNumbers[0].id : null,
      primaryPhone: phoneNumbers.length > 0 ? phoneNumbers[0] : null,
      callbackUrlUsed: effectivePublicUrl,
      verifyTokenUsed: effectiveVerifyToken,
      log: resultLog,
      error: !subSuccess ? subError : !wabaSuccess ? wabaError : null
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
    saveSavedCredentials(creds);
    if (creds.accessToken) lastKnownToken = creds.accessToken;
    if (creds.appSecret) configuredAppSecret = creds.appSecret;

    if (publicTunnelUrl && creds.appId && creds.appSecret && creds.wabaId && creds.accessToken) {
      autoRegisterWebhookWithMeta(creds, `${publicTunnelUrl}/api/whatsapp/webhook`).catch(() => {});
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

// Endpoint providing the live Meta-accessible public webhook URL to frontend
app.get('/api/whatsapp/public-webhook-info', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'whatscloud_token';
  const effectivePublicUrl = publicTunnelUrl || (process.env.APP_URL && !process.env.APP_URL.includes('ais-dev-') ? process.env.APP_URL : null);

  res.json({
    success: true,
    tunnelActive: Boolean(publicTunnelUrl),
    tunnelUrl: publicTunnelUrl,
    directDevUrl: process.env.APP_URL || `http://localhost:${PORT}`,
    recommendedWebhookUrl: publicTunnelUrl 
      ? `${publicTunnelUrl}/api/whatsapp/webhook` 
      : effectivePublicUrl
        ? `${effectivePublicUrl}/api/whatsapp/webhook`
        : `https://ais-dev-zqx43entfejspel3jgqapu-10246562354.asia-southeast1.run.app/api/whatsapp/webhook`,
    verifyToken
  });
});

// Endpoint to restart or refresh the public tunnel on demand
app.post('/api/whatsapp/restart-tunnel', (req, res) => {
  try {
    console.log('[Tunnel] User requested manual tunnel restart...');
    startPublicWebhookTunnel(PORT);
    return res.json({ success: true, message: 'Tunnel restart initiated' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to restart tunnel' });
  }
});

// Endpoint for app UI to test if the public webhook or local webhook responds correctly to Meta verification
app.post('/api/whatsapp/test-webhook', async (req, res) => {
  const targetUrl = req.body.url || (publicTunnelUrl ? `${publicTunnelUrl}/api/whatsapp/webhook` : `http://localhost:${PORT}/api/whatsapp/webhook`);
  const token = req.body.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'whatscloud_token';
  const testChallenge = `challenge_${Math.random().toString(36).substring(2, 10)}`;

  try {
    const probeUrl = new URL(targetUrl);
    probeUrl.searchParams.set('hub.mode', 'subscribe');
    probeUrl.searchParams.set('hub.challenge', testChallenge);
    probeUrl.searchParams.set('hub.verify_token', token);

    console.log(`[Webhook Self-Test] Probing ${probeUrl.toString()}...`);
    const response = await fetch(probeUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'facebookplatform/1.0 (+http://developers.facebook.com)',
        'Accept': '*/*'
      }
    });

    const bodyText = await response.text();
    const isSuccess = response.status === 200 && bodyText.trim() === testChallenge;

    return res.json({
      success: isSuccess,
      status: response.status,
      receivedBody: bodyText.slice(0, 100),
      expectedChallenge: testChallenge,
      targetUrl: probeUrl.toString(),
      message: isSuccess
        ? 'Webhook is fully working and verified! Meta will accept it.'
        : response.status === 302
        ? 'HTTP 302: Authentication redirect detected. Use the Live Public Tunnel URL instead of the internal dev URL.'
        : response.status === 403
        ? 'HTTP 403: Verify Token mismatch. Ensure you type the same token in Meta.'
        : `Unexpected response status HTTP ${response.status} from endpoint.`
    });
  } catch (err: any) {
    console.error('[Webhook Self-Test Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Could not reach webhook endpoint'
    });
  }
});

// Start dev server with Vite middlewares or static files
async function startServer() {
  // Initialize Database (PostgreSQL if DATABASE_URL is set, else SQLite)
  await initDatabase();

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
    // Start public tunnel in background to bypass dev session cookie protection
    startPublicWebhookTunnel(PORT);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
