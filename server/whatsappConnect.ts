import { db } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import { 
  getTenantWebhookUrl, 
  getWhatsAppWebhookUrl, 
  generateTenantVerifyToken, 
  getPrimaryVerifyToken 
} from './webhookConfig.js';

export interface PlatformMetaConfig {
  appId: string;
  appSecret: string;
  configId: string;
  partnerSolutionId?: string;
  webhookVerifyToken: string;
  coexistenceEnabled: boolean;
  graphVersion: string;
}

// Retrieve platform-wide shared Meta app credentials (Super Admin managed)
export async function getPlatformMetaConfig(): Promise<PlatformMetaConfig> {
  const getVal = async (key: string, fallback: string = ''): Promise<string> => {
    const row = (await db.prepare('SELECT value FROM platform_config WHERE key = ?').get(key)) as { value: string } | undefined;
    return row ? row.value : fallback;
  };

  return {
    appId: await getVal('meta_app_id', process.env.WHATSAPP_APP_ID || ''),
    appSecret: await getVal('meta_app_secret', process.env.WHATSAPP_APP_SECRET || ''),
    configId: await getVal('meta_config_id', process.env.WHATSAPP_CONFIG_ID || ''),
    partnerSolutionId: await getVal('partner_solution_id', process.env.WHATSAPP_SOLUTION_ID || ''),
    webhookVerifyToken: await getVal('webhook_verify_token', process.env.WHATSAPP_VERIFY_TOKEN || 'whatchat_webhook_secret_2026'),
    coexistenceEnabled: (await getVal('coexistence_enabled', '1')) === '1',
    graphVersion: await getVal('graph_version', 'v21.0')
  };
}

// Save platform-wide shared Meta app credentials
export async function savePlatformMetaConfig(config: Partial<PlatformMetaConfig>) {
  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO platform_config (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  if (config.appId !== undefined) await upsert.run('meta_app_id', config.appId.trim(), now);
  if (config.appSecret !== undefined) await upsert.run('meta_app_secret', config.appSecret.trim(), now);
  if (config.configId !== undefined) await upsert.run('meta_config_id', config.configId.trim(), now);
  if (config.partnerSolutionId !== undefined) await upsert.run('partner_solution_id', config.partnerSolutionId.trim(), now);
  if (config.webhookVerifyToken !== undefined) await upsert.run('webhook_verify_token', config.webhookVerifyToken.trim(), now);
  if (config.coexistenceEnabled !== undefined) await upsert.run('coexistence_enabled', config.coexistenceEnabled ? '1' : '0', now);
  if (config.graphVersion !== undefined) await upsert.run('graph_version', config.graphVersion.trim(), now);
}

// WhatsJet 1-Click Automated Meta Webhook & Asset Registration
// Directly configures Meta App subscriptions, connects WABA via subscribed_apps, and fetches phone numbers in background
export async function autoRegisterMetaWebhook(params: {
  tenantId?: string;
  appId: string;
  appSecret: string;
  accessToken: string;
  wabaId: string;
  req?: any;
}) {
  const { tenantId, appId, appSecret, accessToken, wabaId, req } = params;
  const cleanAppId = String(appId).trim();
  const cleanAppSecret = String(appSecret).trim();
  const cleanToken = String(accessToken).trim();
  const cleanWabaId = String(wabaId).trim();

  // Dynamic Callback URL derived from current website address
  // If tenantId exists, use /whatsapp-webhook/{tenantId}, otherwise /api/whatsapp/webhook
  const callbackUrl = tenantId 
    ? getTenantWebhookUrl(tenantId, req) 
    : getWhatsAppWebhookUrl(req);

  // Deterministic verify token (WhatsJet pattern)
  const verifyToken = tenantId 
    ? generateTenantVerifyToken(tenantId) 
    : getPrimaryVerifyToken();

  const stepsLog: Array<{ step: string; status: 'success' | 'failed' | 'warning'; message: string; details?: any }> = [];

  // Step 1: Subscribe webhook callback URL to Meta App (connectBaseWebhook in WhatsJet)
  console.log(`[AutoConnect] Registering webhook for App ${cleanAppId} at ${callbackUrl}...`);
  const appAccessToken = `${cleanAppId}|${cleanAppSecret}`;
  const subParams = new URLSearchParams();
  subParams.append('object', 'whatsapp_business_account');
  subParams.append('callback_url', callbackUrl);
  subParams.append('verify_token', verifyToken);
  subParams.append('fields', 'messages,message_template_quality_update,message_template_status_update,account_update,history,smb_app_state_sync,smb_message_echoes');

  let subSuccess = false;
  let subError: string | null = null;

  try {
    const subRes = await fetch(
      `https://graph.facebook.com/v21.0/${cleanAppId}/subscriptions?access_token=${encodeURIComponent(appAccessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: subParams.toString()
      }
    );
    const subData = await subRes.json();
    if (subRes.ok && subData?.success) {
      subSuccess = true;
      stepsLog.push({
        step: 'app_webhook_subscription',
        status: 'success',
        message: `Registered webhook callback URL with Meta App ${cleanAppId}`,
        details: subData
      });
    } else {
      subError = subData?.error?.message || 'Meta rejected app webhook subscription.';
      stepsLog.push({
        step: 'app_webhook_subscription',
        status: 'failed',
        message: subError || 'Meta rejected app webhook subscription.',
        details: subData
      });
    }
  } catch (err: any) {
    subError = err?.message || 'Failed to call Meta subscriptions API';
    stepsLog.push({
      step: 'app_webhook_subscription',
      status: 'failed',
      message: subError || 'Network failure connecting to Meta'
    });
  }

  // Step 2: Subscribe the WhatsApp Business Account (WABA) to the App (subscribed_apps)
  console.log(`[AutoConnect] Subscribing WABA ${cleanWabaId} to app...`);
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
      stepsLog.push({
        step: 'waba_subscribed_apps',
        status: 'success',
        message: `Connected WhatsApp Business Account (${cleanWabaId}) to Webhook events`,
        details: wabaData
      });
    } else {
      wabaError = wabaData?.error?.message || 'Failed to subscribe WABA to app';
      stepsLog.push({
        step: 'waba_subscribed_apps',
        status: 'failed',
        message: wabaError || 'Failed to subscribe WABA to app',
        details: wabaData
      });
    }
  } catch (err: any) {
    wabaError = err?.message || 'Failed to connect WABA to app';
    stepsLog.push({
      step: 'waba_subscribed_apps',
      status: 'failed',
      message: wabaError || 'Failed to connect WABA'
    });
  }

  // Step 3: Discover Phone Numbers registered under WABA
  console.log(`[AutoConnect] Discovering registered phone numbers under WABA ${cleanWabaId}...`);
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
    if (phoneRes.ok && Array.isArray(phoneData.data)) {
      phoneNumbers = phoneData.data;
      stepsLog.push({
        step: 'discover_phone_numbers',
        status: 'success',
        message: `Found ${phoneNumbers.length} phone number(s) in WhatsApp Business Account`,
        details: phoneNumbers
      });
    }
  } catch (err: any) {
    stepsLog.push({
      step: 'discover_phone_numbers',
      status: 'warning',
      message: err?.message || 'Failed to discover phone numbers'
    });
  }

  return {
    success: subSuccess && wabaSuccess,
    subSuccess,
    wabaSuccess,
    callbackUrl,
    verifyToken,
    phoneNumbers,
    primaryPhone: phoneNumbers.length > 0 ? phoneNumbers[0] : null,
    log: stepsLog,
    error: !subSuccess ? subError : !wabaSuccess ? wabaError : null
  };
}

// Onboarding Method A: Bring Your Own Meta App (BYO)
export async function connectByoMetaChannel(params: {
  tenantId: string;
  appId?: string;
  appSecret?: string;
  accessToken: string;
  wabaId?: string;
  phoneNumberId?: string;
  coexistenceEnabled?: boolean;
  req?: any;
}) {
  const { tenantId, appId, appSecret, accessToken, wabaId, coexistenceEnabled, req } = params;
  const cleanToken = accessToken.trim();
  let targetPhoneId = params.phoneNumberId?.trim() || '';

  // 1. If App ID, App Secret, and WABA ID provided, trigger 1-Click Automated Registration (WhatsJet flow)
  let autoResult: any = null;
  if (appId?.trim() && appSecret?.trim() && wabaId?.trim()) {
    try {
      autoResult = await autoRegisterMetaWebhook({
        tenantId,
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        accessToken: cleanToken,
        wabaId: wabaId.trim(),
        req
      });

      if (!targetPhoneId && autoResult.primaryPhone?.id) {
        targetPhoneId = autoResult.primaryPhone.id;
      }
    } catch (e) {
      console.warn('[BYO Connect] Auto-setup note:', e);
    }
  }

  if (!targetPhoneId) {
    throw new Error('WhatsApp Phone Number ID is required or must be discoverable under authorized WABA ID.');
  }

  // Validate phone number via Meta Graph API
  const probeRes = await fetch(
    `https://graph.facebook.com/v21.0/${targetPhoneId}?fields=verified_name,display_phone_number,quality_rating,name_status,status`,
    { headers: { Authorization: `Bearer ${cleanToken}` } }
  );
  const phoneData = await probeRes.json();

  if (!probeRes.ok) {
    throw new Error(phoneData?.error?.message || 'Failed to verify WhatsApp Phone Number ID with Meta API');
  }

  const displayNumber = phoneData.display_phone_number || targetPhoneId;
  const verifiedName = phoneData.verified_name || null;
  const now = Date.now();
  const verifyToken = autoResult?.verifyToken || generateTenantVerifyToken(tenantId);
  const callbackUrl = autoResult?.callbackUrl || getTenantWebhookUrl(tenantId, req);

  // Check if channel already exists for this phone number
  const existing = (await db.prepare('SELECT id, tenant_id FROM whatsapp_channels WHERE phone_number_id = ?').get(targetPhoneId)) as { id: string; tenant_id: string } | undefined;

  if (existing && existing.tenant_id !== tenantId) {
    throw new Error('This WhatsApp Phone Number is already connected to another workspace.');
  }

  const channelId = existing ? existing.id : uuidv4();
  if (existing) {
    await db.prepare(`
      UPDATE whatsapp_channels
      SET connection_mode = 'byo_meta',
          waba_id = ?,
          display_phone_number = ?,
          verified_name = ?,
          access_token = ?,
          app_id = ?,
          app_secret = ?,
          coexistence_enabled = ?,
          webhook_verify_token = ?,
          webhook_url = ?,
          webhook_verified_at = COALESCE(?, webhook_verified_at),
          status = 'active',
          updated_at = ?
      WHERE id = ?
    `).run(
      wabaId?.trim() || null,
      displayNumber,
      verifiedName,
      cleanToken,
      appId?.trim() || null,
      appSecret?.trim() || null,
      coexistenceEnabled ? 1 : 0,
      verifyToken,
      callbackUrl,
      autoResult?.subSuccess ? now : null,
      now,
      channelId
    );
  } else {
    await db.prepare(`
      INSERT INTO whatsapp_channels (id, tenant_id, connection_mode, waba_id, phone_number_id, display_phone_number, verified_name, access_token, app_id, app_secret, coexistence_enabled, webhook_verify_token, webhook_url, webhook_verified_at, status, connected_at, updated_at)
      VALUES (?, ?, 'byo_meta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      channelId,
      tenantId,
      wabaId?.trim() || null,
      targetPhoneId,
      displayNumber,
      verifiedName,
      cleanToken,
      appId?.trim() || null,
      appSecret?.trim() || null,
      coexistenceEnabled ? 1 : 0,
      verifyToken,
      callbackUrl,
      autoResult?.subSuccess ? now : null,
      now,
      now
    );
  }

  return {
    success: true,
    channelId,
    phoneNumberId: targetPhoneId,
    displayNumber,
    verifiedName,
    autoRegistration: autoResult
  };
}

// Onboarding Method B: Meta Embedded Signup (OAuth Code Exchange + Asset Mapping)
export async function completeEmbeddedSignup(params: {
  tenantId: string;
  code: string;
  wabaId: string;
  phoneNumberId?: string;
  coexistenceEnabled?: boolean;
  req?: any;
}) {
  const { tenantId, code, wabaId, phoneNumberId, coexistenceEnabled, req } = params;
  const platformConfig = await getPlatformMetaConfig();

  if (!platformConfig.appId || !platformConfig.appSecret) {
    throw new Error('Platform Meta App ID and App Secret are not configured. Please contact Super Admin.');
  }

  console.log(`[Embedded Signup] Exchanging OAuth code for tenant ${tenantId}...`);

  // Step 1: Exchange temporary OAuth code for a permanent System User Access Token
  const tokenUrl = new URL(`https://graph.facebook.com/${platformConfig.graphVersion}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', platformConfig.appId);
  tokenUrl.searchParams.set('client_secret', platformConfig.appSecret);
  tokenUrl.searchParams.set('code', code.trim());

  const tokenRes = await fetch(tokenUrl.toString(), { method: 'POST' });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error('[Embedded Signup Token Exchange Error]:', tokenData);
    throw new Error(tokenData?.error?.message || 'Failed to exchange authorization code for Meta Access Token');
  }

  const tenantAccessToken = tokenData.access_token;
  console.log('[Embedded Signup] Token exchanged successfully.');

  // Step 2: Retrieve authorized phone numbers under the WABA
  const phonesRes = await fetch(
    `https://graph.facebook.com/${platformConfig.graphVersion}/${wabaId}/phone_numbers`,
    {
      headers: { Authorization: `Bearer ${tenantAccessToken}` }
    }
  );
  const phonesData = await phonesRes.json();
  const phoneList = Array.isArray(phonesData.data) ? phonesData.data : [];

  // Match the specific phone number or pick the first registered number
  const selectedPhone = phoneNumberId
    ? phoneList.find((p: any) => p.id === phoneNumberId) || phoneList[0]
    : phoneList[0];

  const targetPhoneId = selectedPhone?.id || phoneNumberId;
  if (!targetPhoneId) {
    throw new Error('No WhatsApp phone numbers found in the authorized Business Account.');
  }

  const displayNumber = selectedPhone?.display_phone_number || targetPhoneId;
  const verifiedName = selectedPhone?.verified_name || null;
  const now = Date.now();
  const verifyToken = generateTenantVerifyToken(tenantId);
  const callbackUrl = getTenantWebhookUrl(tenantId, req);

  // Step 3: Subscribe platform app to customer's WABA
  let subSuccess = false;
  try {
    const subRes = await fetch(
      `https://graph.facebook.com/${platformConfig.graphVersion}/${wabaId}/subscribed_apps`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tenantAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const subData = await subRes.json();
    subSuccess = Boolean(subRes.ok && subData?.success);
    console.log('[Embedded Signup] WABA Subscribed Apps status:', subData);
  } catch (err) {
    console.warn('[Embedded Signup] Subscribed apps warning:', err);
  }

  // Step 4: Save the connection against the tenant in the database
  const existing = (await db.prepare('SELECT id, tenant_id FROM whatsapp_channels WHERE phone_number_id = ?').get(targetPhoneId)) as { id: string; tenant_id: string } | undefined;

  if (existing && existing.tenant_id !== tenantId) {
    throw new Error('This phone number is already attached to another workspace.');
  }

  const channelId = existing ? existing.id : uuidv4();
  if (existing) {
    await db.prepare(`
      UPDATE whatsapp_channels
      SET connection_mode = 'embedded_signup',
          waba_id = ?,
          display_phone_number = ?,
          verified_name = ?,
          access_token = ?,
          coexistence_enabled = ?,
          webhook_verify_token = ?,
          webhook_url = ?,
          webhook_verified_at = COALESCE(?, webhook_verified_at),
          status = 'active',
          updated_at = ?
      WHERE id = ?
    `).run(
      wabaId.trim(),
      displayNumber,
      verifiedName,
      tenantAccessToken,
      coexistenceEnabled ? 1 : 0,
      verifyToken,
      callbackUrl,
      subSuccess ? now : null,
      now,
      channelId
    );
  } else {
    await db.prepare(`
      INSERT INTO whatsapp_channels (id, tenant_id, connection_mode, waba_id, phone_number_id, display_phone_number, verified_name, access_token, coexistence_enabled, webhook_verify_token, webhook_url, webhook_verified_at, status, connected_at, updated_at)
      VALUES (?, ?, 'embedded_signup', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      channelId,
      tenantId,
      wabaId.trim(),
      targetPhoneId,
      displayNumber,
      verifiedName,
      tenantAccessToken,
      coexistenceEnabled ? 1 : 0,
      verifyToken,
      callbackUrl,
      subSuccess ? now : null,
      now,
      now
    );
  }

  return {
    success: true,
    channelId,
    phoneNumberId: targetPhoneId,
    displayNumber,
    verifiedName,
    coexistenceEnabled: Boolean(coexistenceEnabled)
  };
}
