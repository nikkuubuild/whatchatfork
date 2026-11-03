import { db } from './db.js';
import { v4 as uuidv4 } from 'uuid';

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
    webhookVerifyToken: await getVal('webhook_verify_token', process.env.WHATSAPP_VERIFY_TOKEN || 'whatscloud_token'),
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

// Onboarding Method A: Bring Your Own Meta App (BYO)
export async function connectByoMetaChannel(params: {
  tenantId: string;
  appId?: string;
  appSecret?: string;
  accessToken: string;
  wabaId?: string;
  phoneNumberId: string;
  coexistenceEnabled?: boolean;
}) {
  const { tenantId, appId, appSecret, accessToken, wabaId, phoneNumberId, coexistenceEnabled } = params;
  const cleanToken = accessToken.trim();
  const cleanPhoneId = phoneNumberId.trim();

  // Validate phone number via Meta Graph API
  const probeRes = await fetch(`https://graph.facebook.com/v21.0/${cleanPhoneId}`, {
    headers: { Authorization: `Bearer ${cleanToken}` }
  });
  const phoneData = await probeRes.json();

  if (!probeRes.ok) {
    throw new Error(phoneData?.error?.message || 'Failed to verify WhatsApp Phone Number ID with Meta API');
  }

  const displayNumber = phoneData.display_phone_number || cleanPhoneId;
  const verifiedName = phoneData.verified_name || null;
  const now = Date.now();

  // Check if channel already exists for this phone number
  const existing = (await db.prepare('SELECT id, tenant_id FROM whatsapp_channels WHERE phone_number_id = ?').get(cleanPhoneId)) as { id: string; tenant_id: string } | undefined;

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
      now,
      channelId
    );
  } else {
    await db.prepare(`
      INSERT INTO whatsapp_channels (id, tenant_id, connection_mode, waba_id, phone_number_id, display_phone_number, verified_name, access_token, app_id, app_secret, coexistence_enabled, webhook_verify_token, status, connected_at, updated_at)
      VALUES (?, ?, 'byo_meta', ?, ?, ?, ?, ?, ?, ?, ?, 'whatscloud_token', 'active', ?, ?)
    `).run(
      channelId,
      tenantId,
      wabaId?.trim() || null,
      cleanPhoneId,
      displayNumber,
      verifiedName,
      cleanToken,
      appId?.trim() || null,
      appSecret?.trim() || null,
      coexistenceEnabled ? 1 : 0,
      now,
      now
    );
  }

  // Auto-subscribe WABA if credentials provided
  if (appId && appSecret && wabaId) {
    try {
      await autoSubscribeWaba({
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        wabaId: wabaId.trim(),
        accessToken: cleanToken
      });
    } catch (e) {
      console.warn('[BYO Connect] WABA subscription warning:', e);
    }
  }

  return {
    success: true,
    channelId,
    phoneNumberId: cleanPhoneId,
    displayNumber,
    verifiedName
  };
}

// Onboarding Method B: Meta Embedded Signup (OAuth Code Exchange + Asset Mapping)
export async function completeEmbeddedSignup(params: {
  tenantId: string;
  code: string;
  wabaId: string;
  phoneNumberId?: string;
  coexistenceEnabled?: boolean;
}) {
  const { tenantId, code, wabaId, phoneNumberId, coexistenceEnabled } = params;
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

  // Step 3: Subscribe platform app to customer's WABA
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
          status = 'active',
          updated_at = ?
      WHERE id = ?
    `).run(
      wabaId.trim(),
      displayNumber,
      verifiedName,
      tenantAccessToken,
      coexistenceEnabled ? 1 : 0,
      now,
      channelId
    );
  } else {
    await db.prepare(`
      INSERT INTO whatsapp_channels (id, tenant_id, connection_mode, waba_id, phone_number_id, display_phone_number, verified_name, access_token, coexistence_enabled, webhook_verify_token, status, connected_at, updated_at)
      VALUES (?, ?, 'embedded_signup', ?, ?, ?, ?, ?, ?, 'whatscloud_token', 'active', ?, ?)
    `).run(
      channelId,
      tenantId,
      wabaId.trim(),
      targetPhoneId,
      displayNumber,
      verifiedName,
      tenantAccessToken,
      coexistenceEnabled ? 1 : 0,
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

// Helper: Auto-subscribe WABA for BYO
async function autoSubscribeWaba(params: {
  appId: string;
  appSecret: string;
  wabaId: string;
  accessToken: string;
}) {
  await fetch(
    `https://graph.facebook.com/v21.0/${params.wabaId}/subscribed_apps`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
}
