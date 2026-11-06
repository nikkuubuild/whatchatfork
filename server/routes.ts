import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';
import {
  AuthenticatedRequest,
  generateToken,
  generateAdminToken,
  authenticateToken,
  requireTenant,
  requireSuperAdmin,
  requireSuperAdminAuth,
  checkMessageQuota,
  checkLoginAttempts,
  recordFailedLogin,
  resetLoginAttempts,
  logAdminAction,
  verifyToken
} from './auth.js';
import {
  getPlatformMetaConfig,
  savePlatformMetaConfig,
  connectByoMetaChannel,
  completeEmbeddedSignup
} from './whatsappConnect.js';
import {
  registerTenantSseClient,
  unregisterTenantSseClient,
  processInboundWebhookPayload,
  broadcastTenantEvent
} from './multiTenantWebhook.js';
import { logWebhookEvent } from './webhookDiagnostics.js';
import { getAppBaseUrl, loadSavedCredentials } from './webhookConfig.js';
import {
  getBillingConfig,
  saveBillingConfig,
  calculateGstBreakup,
  validateCoupon,
  createSubscriptionOrder,
  verifyAndActivateSubscription
} from './billing.js';
import {
  createAndSendWhatsAppOtp,
  verifyWhatsAppOtp,
  normalizePhoneNumber
} from './otpService.js';

export const saasRouter = Router();

// ==========================================
// 1. PUBLIC MARKETING & AUTH ROUTES
// ==========================================

// Public Plans List for Pricing Page
saasRouter.get('/plans', async (_req, res) => {
  const plans = await db.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY price_monthly ASC').all();
  res.json({ success: true, plans });
});

// Step 1: Send WhatsApp Verification OTP (with rate limiting)
saasRouter.post('/auth/send-otp', async (req, res) => {
  try {
    const { mobile, name, email, purpose = 'registration' } = req.body;
    if (!mobile) {
      return res.status(400).json({ success: false, error: 'WhatsApp mobile number is required.' });
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || '127.0.0.1';
    const normalized = normalizePhoneNumber(mobile);

    if (!normalized) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mobile number. Please enter a valid 10-digit Indian or international number.'
      });
    }

    if (purpose === 'registration') {
      // Check if phone already registered
      const existingByPhone = await db.prepare('SELECT id FROM users WHERE mobile = ?').get(normalized);
      if (existingByPhone) {
        return res.status(409).json({
          success: false,
          error: 'An account with this WhatsApp mobile number already exists. Please log in.'
        });
      }

      // Check if email already registered (if provided)
      if (email) {
        const cleanEmail = String(email).trim().toLowerCase();
        const existingByEmail = await db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
        if (existingByEmail) {
          return res.status(409).json({
            success: false,
            error: 'An account with this email already exists. Please log in.'
          });
        }
      }
    }

    const result = await createAndSendWhatsAppOtp({
      mobile: normalized,
      name: name ? String(name).trim() : 'User',
      ip: clientIp,
      purpose
    });

    if (!result.success) {
      return res.status(429).json({
        success: false,
        error: result.message,
        cooldownSeconds: result.cooldownSeconds
      });
    }

    return res.json({
      success: true,
      message: result.message,
      normalizedPhone: result.normalizedPhone,
      cooldownSeconds: result.cooldownSeconds,
      expiresInSeconds: result.expiresInSeconds,
      devOtp: result.devOtp
    });
  } catch (err: any) {
    console.error('send-otp error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to dispatch verification OTP' });
  }
});

// Step 2: Register New Tenant Workspace (Verifies Name, Email, Mobile with WhatsApp OTP, and Password)
saasRouter.post('/auth/register', async (req, res) => {
  try {
    const { name, businessName, email, mobile, password, otp, planSlug = 'starter' } = req.body;
    const effectiveName = (name || businessName || '').trim();

    if (!effectiveName || !email || !password || !mobile) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, WhatsApp mobile number, and password are all required.'
      });
    }

    if (!otp) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp verification code is required. Please verify your mobile number.'
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters in length.'
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const normalizedMobile = normalizePhoneNumber(mobile);
    if (!normalizedMobile) {
      return res.status(400).json({
        success: false,
        error: 'Invalid WhatsApp mobile number format. Please enter a valid 10-digit number.'
      });
    }

    // Verify the WhatsApp OTP
    const otpCheck = await verifyWhatsAppOtp(normalizedMobile, String(otp).trim(), 'registration');
    if (!otpCheck.success) {
      return res.status(400).json({
        success: false,
        error: otpCheck.error || 'Invalid or expired verification code.',
        remainingAttempts: otpCheck.remainingAttempts
      });
    }

    // Double check email or mobile uniqueness
    const existingUser = await db.prepare('SELECT id FROM users WHERE email = ? OR mobile = ?').get(cleanEmail, normalizedMobile);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'An account with this email or mobile number already exists.' });
    }

    // Resolve plan
    const plan = ((await db.prepare('SELECT * FROM plans WHERE slug = ?').get(planSlug)) as any) ||
      ((await db.prepare('SELECT * FROM plans LIMIT 1').get()) as any);

    const tenantId = `tenant_${uuidv4().substring(0, 12)}`;
    const slug = `${effectiveName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

    // Create Tenant
    await db.prepare(`
      INSERT INTO tenants (id, name, slug, plan_id, subscription_status, monthly_message_quota, messages_used_current_cycle, created_at)
      VALUES (?, ?, ?, ?, 'active', ?, 0, ?)
    `).run(tenantId, effectiveName, slug, plan ? plan.id : null, plan ? plan.monthly_message_quota : 5000, now);

    // Create Tenant Owner User with verified mobile
    const userId = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10);
    await db.prepare(`
      INSERT INTO users (id, tenant_id, email, mobile, phone_verified, password_hash, name, role, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, 'tenant_owner', ?)
    `).run(userId, tenantId, cleanEmail, normalizedMobile, passwordHash, effectiveName, now);

    const user = {
      id: userId,
      tenantId,
      email: cleanEmail,
      mobile: normalizedMobile,
      name: effectiveName,
      role: 'tenant_owner' as const
    };

    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      token,
      user,
      tenant: {
        id: tenantId,
        name: effectiveName,
        slug,
        plan: plan ? plan.name : 'Starter',
        monthlyQuota: plan ? plan.monthly_message_quota : 5000
      }
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to register account' });
  }
});

// Login (Supports either Email or WhatsApp Mobile Number + Password)
saasRouter.post('/auth/login', async (req, res) => {
  try {
    const { email, mobile, identifier, password } = req.body;
    const target = (identifier || email || mobile || '').trim();

    if (!target || !password) {
      return res.status(400).json({ success: false, error: 'Email or WhatsApp mobile and password are required.' });
    }

    const cleanEmail = target.toLowerCase();
    const normalizedMobile = normalizePhoneNumber(target) || target.replace(/[^0-9]/g, '');

    const userRow = (await db.prepare(`
      SELECT * FROM users
      WHERE email = ? OR mobile = ? OR mobile = ?
      LIMIT 1
    `).get(cleanEmail, normalizedMobile, target)) as any;

    if (!userRow || !bcrypt.compareSync(password, userRow.password_hash)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials. Please verify your email/mobile and password.'
      });
    }

    let tenantRow: any = null;
    if (userRow.tenant_id) {
      tenantRow = await db.prepare(`
        SELECT t.*, p.name as plan_name, p.monthly_message_quota as plan_quota
        FROM tenants t
        LEFT JOIN plans p ON t.plan_id = p.id
        WHERE t.id = ?
      `).get(userRow.tenant_id);
    }

    const user = {
      id: userRow.id,
      tenantId: userRow.tenant_id,
      email: userRow.email,
      mobile: userRow.mobile,
      name: userRow.name,
      role: userRow.role
    };

    const token = generateToken(user);

    return res.json({
      success: true,
      token,
      user,
      tenant: tenantRow ? {
        id: tenantRow.id,
        name: tenantRow.name,
        slug: tenantRow.slug,
        plan: tenantRow.plan_name || 'Starter',
        status: tenantRow.subscription_status,
        monthlyQuota: tenantRow.monthly_message_quota,
        messagesUsed: tenantRow.messages_used_current_cycle
      } : null
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Login failed' });
  }
});

// Current User Profile & Active Workspace Info
saasRouter.get('/auth/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  let tenant: any = null;
  let activeChannel: any = null;

  if (user.tenantId) {
    tenant = await db.prepare(`
      SELECT t.*, p.name as plan_name, p.max_whatsapp_numbers, p.max_team_members, p.coexistence_allowed
      FROM tenants t
      LEFT JOIN plans p ON t.plan_id = p.id
      WHERE t.id = ?
    `).get(user.tenantId);

    activeChannel = await db.prepare(`
      SELECT id, connection_mode, waba_id, phone_number_id, display_phone_number, verified_name, coexistence_enabled, status, connected_at, access_token
      FROM whatsapp_channels
      WHERE tenant_id = ? AND status = 'active'
      ORDER BY connected_at DESC LIMIT 1
    `).get(user.tenantId);
  }

  res.json({
    success: true,
    user,
    tenant,
    activeChannel
  });
});

// ==========================================
// 2. DUAL WHATSAPP ONBOARDING ROUTES
// ==========================================

// Get Public Embedded Signup Configuration (for FB.login frontend popup)
saasRouter.get('/whatsapp/embedded-signup/config', async (_req, res) => {
  const config = await getPlatformMetaConfig();
  res.json({
    success: true,
    appId: config.appId,
    configId: config.configId,
    partnerSolutionId: config.partnerSolutionId,
    graphVersion: config.graphVersion,
    coexistenceEnabled: config.coexistenceEnabled,
    isReady: Boolean(config.appId && config.configId)
  });
});

// List Channels for Authenticated Tenant
saasRouter.get('/whatsapp/channels', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const channels = await db.prepare(`
    SELECT id, connection_mode, waba_id, phone_number_id, display_phone_number, verified_name, coexistence_enabled, status, connected_at, updated_at
    FROM whatsapp_channels
    WHERE tenant_id = ?
    ORDER BY connected_at DESC
  `).all(req.tenantId as string);

  res.json({ success: true, channels });
});

// Method A: Connect WhatsApp via BYO Meta App
saasRouter.post('/whatsapp/connect/byo', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  try {
    const { appId, appSecret, accessToken, wabaId, phoneNumberId, coexistenceEnabled } = req.body;

    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: 'Meta Access Token and WhatsApp Phone Number ID are required.'
      });
    }

    const result = await connectByoMetaChannel({
      tenantId: req.tenantId!,
      appId,
      appSecret,
      accessToken,
      wabaId,
      phoneNumberId,
      coexistenceEnabled: Boolean(coexistenceEnabled),
      req
    });

    res.json(result);
  } catch (err: any) {
    console.error('BYO Connection error:', err);
    res.status(400).json({ success: false, error: err?.message || 'Failed to connect via BYO credentials' });
  }
});

// Method B: Complete Platform Shared Meta App Embedded Signup (Code Exchange + WABA asset mapping)
saasRouter.post('/whatsapp/connect/embedded-signup', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  try {
    const { code, wabaId, phoneNumberId, coexistenceEnabled } = req.body;

    if (!code || !wabaId) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code and WABA ID from Embedded Signup are required.'
      });
    }

    const result = await completeEmbeddedSignup({
      tenantId: req.tenantId!,
      code,
      wabaId,
      phoneNumberId,
      coexistenceEnabled: Boolean(coexistenceEnabled),
      req
    });

    res.json(result);
  } catch (err: any) {
    console.error('Embedded Signup completion error:', err);
    res.status(400).json({ success: false, error: err?.message || 'Failed to complete Embedded Signup onboarding' });
  }
});

// Disconnect a WhatsApp Channel
saasRouter.post('/whatsapp/channels/:channelId/disconnect', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const { channelId } = req.params;
  const channel = await db.prepare('SELECT id FROM whatsapp_channels WHERE id = ? AND tenant_id = ?').get(channelId as string, req.tenantId as string);

  if (!channel) {
    return res.status(404).json({ success: false, error: 'Channel not found in this workspace' });
  }

  await db.prepare("UPDATE whatsapp_channels SET status = 'disconnected' WHERE id = ?").run(channelId);
  res.json({ success: true, message: 'Channel disconnected successfully' });
});

// ==========================================
// 3. MULTI-TENANT ISOLATED SSE STREAM
// ==========================================

saasRouter.get('/whatsapp/events', async (req: AuthenticatedRequest, res: Response) => {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;
  let tenantId: string | undefined = undefined;

  let rawToken: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.substring(7).trim();
  } else if (queryToken) {
    rawToken = queryToken.trim();
  }

  if (rawToken) {
    const authUser = verifyToken(rawToken);
    if (authUser?.tenantId) {
      tenantId = authUser.tenantId;
      req.user = authUser;
    }
  }

  if (!tenantId) {
    try {
      const defaultTenant = (await db.prepare("SELECT id FROM tenants WHERE slug = 'default-workspace' LIMIT 1").get()) as { id: string } | undefined
        || (await db.prepare("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").get()) as { id: string } | undefined;
      tenantId = defaultTenant?.id || 'tenant_default_01';
    } catch (_) {
      tenantId = 'tenant_default_01';
    }
  }
  req.tenantId = tenantId;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  registerTenantSseClient(tenantId, clientId, res);

  // Send ACK with tenant context
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId, tenantId, serverTime: Date.now() })}\n\n`);

  // Send initial backlog of latest messages & conversations for this tenant (includes sent & received with full media)
  try {
    const recentMessages = (await db.prepare(`
      SELECT m.*, c.customer_phone, c.customer_name
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.tenant_id = ?
      ORDER BY m.created_at DESC LIMIT 150
    `).all(tenantId)) as any[];

    res.write(`data: ${JSON.stringify({
      type: 'backlog',
      events: recentMessages.reverse().map((m: any) => {
        let locData = undefined;
        if (m.location_json) {
          try { locData = JSON.parse(m.location_json); } catch (_) {}
        }
        return {
          id: m.meta_message_id || m.id,
          type: 'message',
          timestamp: Number(m.created_at),
          data: {
            id: m.meta_message_id || m.id,
            from: m.customer_phone,
            contactName: m.customer_name || m.customer_phone,
            fromMe: Boolean(m.from_me),
            type: m.type,
            text: m.text ? { body: m.text } : undefined,
            caption: m.media_caption || undefined,
            mediaUrl: m.media_url || undefined,
            filename: m.filename || undefined,
            location: locData,
            status: m.status || (m.from_me ? 'sent' : 'read'),
            timestamp: Number(m.created_at)
          }
        };
      })
    })}\n\n`);
  } catch (_) {}

  req.on('close', () => {
    unregisterTenantSseClient(tenantId as string, clientId);
  });
});

// Full Multi-Device History Sync (Syncs all conversations and complete message history for any device)
saasRouter.get('/chats/sync', async (req: AuthenticatedRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;
    let tenantId: string | undefined = undefined;

    let rawToken: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.substring(7).trim();
    } else if (queryToken) {
      rawToken = queryToken.trim();
    }

    if (rawToken) {
      const authUser = verifyToken(rawToken);
      if (authUser?.tenantId) {
        tenantId = authUser.tenantId;
      }
    }

    if (!tenantId) {
      try {
        const defaultTenant = (await db.prepare("SELECT id FROM tenants WHERE slug = 'default-workspace' LIMIT 1").get()) as { id: string } | undefined
          || (await db.prepare("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").get()) as { id: string } | undefined;
        tenantId = defaultTenant?.id || 'tenant_default_01';
      } catch (_) {
        tenantId = 'tenant_default_01';
      }
    }

    const convRows = (await db.prepare(`
      SELECT * FROM conversations
      WHERE tenant_id = ?
      ORDER BY updated_at DESC
    `).all(tenantId)) as any[];

    const msgRows = (await db.prepare(`
      SELECT m.*, c.customer_phone
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.tenant_id = ?
      ORDER BY m.created_at ASC
    `).all(tenantId)) as any[];

    const messagesByConv: Record<string, any[]> = {};
    for (const m of msgRows) {
      const cleanPhone = String(m.customer_phone || '').replace(/[^0-9]/g, '');
      const frontendConvId = cleanPhone ? `conv_${cleanPhone}` : m.conversation_id;

      if (!messagesByConv[frontendConvId]) {
        messagesByConv[frontendConvId] = [];
      }

      let locationData = undefined;
      if (m.location_json) {
        try { locationData = JSON.parse(m.location_json); } catch (_) {}
      }

      messagesByConv[frontendConvId].push({
        id: m.meta_message_id || m.id,
        metaMessageId: m.meta_message_id || undefined,
        conversationId: frontendConvId,
        fromMe: Boolean(m.from_me),
        type: m.type,
        text: m.text || '',
        mediaUrl: m.media_url || undefined,
        mediaCaption: m.media_caption || undefined,
        filename: m.filename || undefined,
        location: locationData,
        status: m.status || (m.from_me ? 'sent' : 'read'),
        timestamp: Number(m.created_at)
      });
    }

    const formattedConvs = convRows.map((c) => {
      const cleanPhone = String(c.customer_phone || '').replace(/[^0-9]/g, '');
      const frontendConvId = cleanPhone ? `conv_${cleanPhone}` : c.id;
      const convMsgs = messagesByConv[frontendConvId] || [];
      const lastMsg = convMsgs.length > 0 ? convMsgs[convMsgs.length - 1] : undefined;

      return {
        id: frontendConvId,
        phoneNumber: c.customer_phone.startsWith('+') ? c.customer_phone : `+${c.customer_phone}`,
        name: c.customer_name || c.customer_phone,
        avatarColor: c.avatar_color || '#008069',
        unreadCount: Number(c.unread_count || 0),
        updatedAt: Number(c.updated_at || c.created_at),
        lastMessage: lastMsg
      };
    });

    return res.json({
      success: true,
      tenantId,
      conversations: formattedConvs,
      messages: messagesByConv
    });
  } catch (err: any) {
    console.error('[Chats Sync Error]:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to sync chats' });
  }
});

// ==========================================
// 4. MULTI-TENANT CHAT & MESSAGING ROUTES
// ==========================================

// Get Tenant Conversations
saasRouter.get('/chats/conversations', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const convs = await db.prepare(`
    SELECT * FROM conversations
    WHERE tenant_id = ?
    ORDER BY updated_at DESC
  `).all(req.tenantId as string);

  res.json({ success: true, conversations: convs });
});

// Get Messages for a specific conversation
saasRouter.get('/chats/conversations/:convId/messages', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const { convId } = req.params;
  const messages = await db.prepare(`
    SELECT * FROM messages
    WHERE conversation_id = ? AND tenant_id = ?
    ORDER BY created_at ASC
  `).all(convId as string, req.tenantId as string);

  res.json({ success: true, messages });
});

// Send WhatsApp Message (Protected with Quota Check, supports SaaS, BYO Meta & Direct credentials)
saasRouter.post('/whatsapp/send-message', async (req: AuthenticatedRequest, res) => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;
    let authUser: any = null;
    let tenantId: string | undefined = undefined;

    // 1. Authenticate if Bearer token or query token is provided
    let rawToken: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.substring(7).trim();
    } else if (queryToken) {
      rawToken = queryToken.trim();
    }

    if (rawToken) {
      authUser = verifyToken(rawToken);
      if (authUser?.tenantId) {
        tenantId = authUser.tenantId;
        req.user = authUser;
        req.tenantId = tenantId;
      }
    }

    // 2. Resolve Effective Meta Credentials (supports client credentials, DB channels, server storage, and ENV)
    const bodyPayload = req.body.messagePayload;
    let effectiveToken = req.body.token?.trim() || null;
    let effectivePhoneId = req.body.phoneNumberId?.trim() || null;

    // If tenantId is not yet resolved, try resolving via phoneNumberId in database
    if (!tenantId && effectivePhoneId) {
      try {
        const chan = (await db.prepare('SELECT tenant_id FROM whatsapp_channels WHERE phone_number_id = ? LIMIT 1').get(effectivePhoneId)) as { tenant_id: string } | undefined;
        if (chan?.tenant_id) {
          tenantId = chan.tenant_id;
        }
      } catch (_) {}
    }

    // If still no tenantId, fall back to default workspace tenant
    if (!tenantId) {
      try {
        const defaultTenant = (await db.prepare("SELECT id FROM tenants WHERE slug = 'default-workspace' LIMIT 1").get()) as { id: string } | undefined
          || (await db.prepare("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").get()) as { id: string } | undefined;
        tenantId = defaultTenant?.id || 'tenant_default_01';
      } catch (_) {
        tenantId = 'tenant_default_01';
      }
    }
    req.tenantId = tenantId;

    // Check quota if tenant exists and has an active subscription plan
    if (tenantId) {
      try {
        const tenantRecord = (await db.prepare('SELECT subscription_status, monthly_message_quota, messages_used_current_cycle FROM tenants WHERE id = ?').get(tenantId)) as any;
        if (tenantRecord) {
          if (tenantRecord.subscription_status === 'suspended' || tenantRecord.subscription_status === 'canceled') {
            return res.status(402).json({
              success: false,
              error: 'Subscription is inactive or suspended. Please renew in Billing.'
            });
          }
          if (tenantRecord.monthly_message_quota > 0 && tenantRecord.messages_used_current_cycle >= tenantRecord.monthly_message_quota) {
            return res.status(402).json({
              success: false,
              error: `Monthly message quota limit reached (${tenantRecord.messages_used_current_cycle} / ${tenantRecord.monthly_message_quota}). Please upgrade your plan.`
            });
          }
        }
      } catch (_) {}
    }

    // Query active channel in database
    let channel: any = null;
    if (tenantId) {
      try {
        channel = (await db.prepare(`
          SELECT * FROM whatsapp_channels
          WHERE tenant_id = ? AND access_token IS NOT NULL AND access_token != ''
          ORDER BY connected_at DESC LIMIT 1
        `).get(tenantId)) as any;
      } catch (_) {}
    }

    if (!channel && effectivePhoneId) {
      try {
        channel = (await db.prepare(`
          SELECT * FROM whatsapp_channels
          WHERE phone_number_id = ? AND access_token IS NOT NULL AND access_token != ''
          ORDER BY connected_at DESC LIMIT 1
        `).get(effectivePhoneId)) as any;
      } catch (_) {}
    }

    if (!channel) {
      try {
        channel = (await db.prepare(`
          SELECT * FROM whatsapp_channels
          WHERE access_token IS NOT NULL AND access_token != ''
          ORDER BY connected_at DESC LIMIT 1
        `).get()) as any;
      } catch (_) {}
    }

    if (channel) {
      if (!effectiveToken && channel.access_token) {
        effectiveToken = channel.access_token.trim();
      }
      if (!effectivePhoneId && channel.phone_number_id) {
        effectivePhoneId = channel.phone_number_id.trim();
      }
      if (channel.tenant_id) {
        tenantId = channel.tenant_id;
        req.tenantId = tenantId;
      }
    }

    // Fall back to server saved credentials
    if (!effectiveToken || !effectivePhoneId) {
      const saved = loadSavedCredentials();
      if (!effectiveToken && saved?.accessToken) effectiveToken = saved.accessToken.trim();
      if (!effectivePhoneId && saved?.phoneNumberId) effectivePhoneId = saved.phoneNumberId.trim();
    }

    // Fall back to environment variables
    if (!effectiveToken && process.env.WHATSAPP_ACCESS_TOKEN) {
      effectiveToken = process.env.WHATSAPP_ACCESS_TOKEN.trim();
    }
    if (!effectivePhoneId && process.env.WHATSAPP_PHONE_NUMBER_ID) {
      effectivePhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID.trim();
    }

    if (!effectiveToken || !effectivePhoneId) {
      return res.status(400).json({
        success: false,
        error: 'No active WhatsApp Cloud API credentials found. Please configure your Access Token and Phone Number ID in Settings.'
      });
    }

    // Ensure tenantId exists in tenants table to satisfy database foreign keys
    try {
      const existingTenant = (await db.prepare('SELECT id FROM tenants WHERE id = ? LIMIT 1').get(tenantId)) as any;
      if (!existingTenant) {
        const defaultTenant = (await db.prepare("SELECT id FROM tenants WHERE slug = 'default-workspace' LIMIT 1").get()) as { id: string } | undefined
          || (await db.prepare("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").get()) as { id: string } | undefined;
        if (defaultTenant) {
          tenantId = defaultTenant.id;
          req.tenantId = tenantId;
        } else {
          const seedId = 'tenant_default_01';
          await db.prepare(`
            INSERT INTO tenants (id, name, slug, plan_id, subscription_status, monthly_message_quota, messages_used_current_cycle, created_at)
            VALUES (?, 'Default Workspace', 'default-workspace', 'plan_growth', 'active', 50000, 0, ?)
          `).run(seedId, Date.now());
          tenantId = seedId;
          req.tenantId = tenantId;
        }
      }
    } catch (_) {}

    // 3. Resolve Recipient Phone Number
    const rawTo = req.body.to || bodyPayload?.to;
    if (!rawTo) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }
    const cleanTo = String(rawTo).replace(/[^0-9]/g, '');
    if (!cleanTo || cleanTo.length < 5) {
      return res.status(400).json({ success: false, error: 'Invalid recipient phone number. Must contain country code and phone digits.' });
    }

    const type = req.body.type || bodyPayload?.type || 'text';
    const text = req.body.text || bodyPayload?.text?.body || '';
    const mediaUrl = req.body.mediaUrl;
    const mediaCaption = req.body.mediaCaption;
    const filename = req.body.filename;
    const location = req.body.location;
    const template = req.body.template;

    // 4. Construct or Normalize Meta Cloud API Payload
    let finalPayload: any = bodyPayload;
    if (!finalPayload || typeof finalPayload !== 'object') {
      finalPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo
      };

      if (template) {
        finalPayload.type = 'template';
        finalPayload.template = template;
      } else if (type === 'image' && mediaUrl) {
        const fullMediaUrl = mediaUrl.startsWith('/') ? `${getAppBaseUrl(req)}${mediaUrl}` : mediaUrl;
        finalPayload.type = 'image';
        finalPayload.image = { link: fullMediaUrl, caption: mediaCaption || '' };
      } else if (type === 'video' && mediaUrl) {
        const fullMediaUrl = mediaUrl.startsWith('/') ? `${getAppBaseUrl(req)}${mediaUrl}` : mediaUrl;
        finalPayload.type = 'video';
        finalPayload.video = { link: fullMediaUrl, caption: mediaCaption || '' };
      } else if (type === 'audio' && mediaUrl) {
        const fullMediaUrl = mediaUrl.startsWith('/') ? `${getAppBaseUrl(req)}${mediaUrl}` : mediaUrl;
        finalPayload.type = 'audio';
        finalPayload.audio = { link: fullMediaUrl };
      } else if (type === 'document' && mediaUrl) {
        const fullMediaUrl = mediaUrl.startsWith('/') ? `${getAppBaseUrl(req)}${mediaUrl}` : mediaUrl;
        finalPayload.type = 'document';
        finalPayload.document = { link: fullMediaUrl, caption: mediaCaption || '', filename: filename || 'file' };
      } else if (type === 'location' && location) {
        finalPayload.type = 'location';
        finalPayload.location = location;
      } else {
        finalPayload.type = 'text';
        finalPayload.text = { body: text || '' };
        if (text && /(https?:\/\/[^\s]+)/gi.test(text)) {
          finalPayload.text.preview_url = true;
        }
      }
    } else {
      // Normalize incoming pre-built payload
      finalPayload.to = cleanTo;
      finalPayload.messaging_product = 'whatsapp';
      finalPayload.recipient_type = 'individual';

      // If media link is relative, make it absolute using public URL
      for (const mType of ['image', 'document', 'audio', 'video'] as const) {
        if (finalPayload[mType]?.link && String(finalPayload[mType].link).startsWith('/')) {
          finalPayload[mType].link = `${getAppBaseUrl(req)}${finalPayload[mType].link}`;
        }
      }

      // Safeguard preview_url on text payload
      if (finalPayload.type === 'text' && finalPayload.text?.preview_url) {
        if (!finalPayload.text.body || !/(https?:\/\/[^\s]+)/gi.test(finalPayload.text.body)) {
          delete finalPayload.text.preview_url;
        }
      }
    }

    // 5. Dispatch Outbound Message to Meta Graph API
    console.log(`[WhatsApp Outbound] Dispatching ${finalPayload.type || 'text'} message to ${cleanTo} via Phone ID ${effectivePhoneId}...`);
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${effectivePhoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${effectiveToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(finalPayload)
    });

    const metaData = await metaRes.json();
    if (!metaRes.ok) {
      console.error(`[WhatsApp Outbound Error] Meta API HTTP ${metaRes.status}:`, JSON.stringify(metaData));
      const errorMsg = metaData?.error?.message || 'Meta API rejected message';
      const isTokenExpired = metaData?.error?.code === 190 || 
        errorMsg.toLowerCase().includes('expired') || 
        errorMsg.toLowerCase().includes('oauthexception') ||
        errorMsg.toLowerCase().includes('session has expired');

      return res.status(metaRes.status).json({
        success: false,
        isTokenExpired,
        errorCode: metaData?.error?.code || metaRes.status,
        error: isTokenExpired
          ? `Meta Access Token Expired (Code 190): ${errorMsg}. Please paste a new or permanent System User token in Settings.`
          : errorMsg,
        details: metaData
      });
    }

    const metaMsgId = metaData.messages?.[0]?.id || `msg_${uuidv4()}`;
    const now = Date.now();

    // 6. Upsert Conversation and Message in Database (safeguarded so DB glitches don't mask successful dispatch)
    try {
      let conv = (await db.prepare(`
        SELECT id FROM conversations 
        WHERE tenant_id = ? AND (customer_phone = ? OR customer_phone = ? OR customer_phone = ?)
        LIMIT 1
      `).get(tenantId, cleanTo, `+${cleanTo}`, rawTo)) as any;
      let convId = conv ? conv.id : uuidv4();

      const previewText = text || (finalPayload.type === 'template' ? `Template: ${template?.name || 'template'}` : `[${type}]`);

      if (conv) {
        await db.prepare(`
          UPDATE conversations
          SET last_message_preview = ?, updated_at = ?
          WHERE id = ?
        `).run(previewText, now, convId);
      } else {
        const colors = ['#008069', '#128C7E', '#25D366', '#075E54', '#34B7F1'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        await db.prepare(`
          INSERT INTO conversations (id, tenant_id, channel_id, customer_phone, customer_name, avatar_color, unread_count, last_message_preview, updated_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `).run(convId, tenantId, channel?.id || null, cleanTo, cleanTo, randomColor, previewText, now, now);
      }

      // 7. Record Outbound Message in Database
      const locationJson = location ? JSON.stringify(location) : null;
      await db.prepare(`
        INSERT INTO messages (id, tenant_id, conversation_id, meta_message_id, from_me, type, text, media_url, media_caption, filename, location_json, status, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'sent', ?)
      `).run(
        uuidv4(),
        tenantId,
        convId,
        metaMsgId,
        type,
        text || '',
        mediaUrl || null,
        mediaCaption || null,
        filename || null,
        locationJson,
        now
      );

      // 8. Increment Tenant Message Usage
      try {
        await db.prepare(`
          UPDATE tenants
          SET messages_used_current_cycle = messages_used_current_cycle + 1
          WHERE id = ?
        `).run(tenantId);
      } catch (_) {}

      // 9. Broadcast Outbound Event to SSE Clients & Audit Log
      try {
        if (tenantId) {
          broadcastTenantEvent(tenantId, {
            id: metaMsgId,
            type: 'message',
            timestamp: now,
            data: {
              id: metaMsgId,
              fromMe: true,
              to: cleanTo,
              text: text || previewText,
              type,
              status: 'sent',
              timestamp: now
            }
          });
        }
        await logWebhookEvent({
          tenantId: tenantId || 'tenant_default_01',
          eventType: 'outbound_message',
          payload: { metaMsgId, to: cleanTo, phoneId: effectivePhoneId, type }
        });
      } catch (_) {}
    } catch (dbErr) {
      console.error('[WhatsApp Outbound DB Sync Error]:', dbErr);
    }

    console.log(`[WhatsApp Outbound Success] Message dispatched! WAMID: ${metaMsgId}`);
    return res.json({
      success: true,
      data: metaData,
      metaMessageId: metaMsgId
    });
  } catch (err: any) {
    console.error('[WhatsApp Outbound Exception]:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to dispatch message' });
  }
});

// ==========================================
// 5. SUPER ADMIN CONTROL PANEL & AUTH ROUTES
// ==========================================

// Dedicated Super Admin Login with Brute-Force Rate Limiting
saasRouter.post('/admin/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    // 1. Check Brute-force Lockout
    const lockCheck = await checkLoginAttempts(cleanEmail);
    if (!lockCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `Too many failed login attempts. Account temporarily locked for ${lockCheck.remainingLockSeconds} seconds.`
      });
    }

    // 2. Fetch User & Verify role
    const adminUser = (await db.prepare("SELECT * FROM users WHERE email = ? AND role = 'super_admin'").get(cleanEmail)) as any;

    if (!adminUser || !bcrypt.compareSync(password, adminUser.password_hash)) {
      await recordFailedLogin(cleanEmail);
      return res.status(401).json({ success: false, error: 'Invalid Super Admin credentials.' });
    }

    // 3. Reset failed attempts & log audit
    await resetLoginAttempts(cleanEmail);
    await logAdminAction({
      adminId: adminUser.id,
      adminEmail: adminUser.email,
      action: 'ADMIN_LOGIN',
      details: 'Super Admin successfully authenticated.',
      ipAddress: clientIp
    });

    // 4. Generate 8-hour admin token
    const token = generateAdminToken({
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: 'super_admin'
    });

    res.json({
      success: true,
      token,
      admin: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role
      }
    });
  } catch (err: any) {
    console.error('Admin login error:', err);
    res.status(500).json({ success: false, error: err?.message || 'Login failed' });
  }
});

// Verify Super Admin Session
saasRouter.get('/admin/auth/me', requireSuperAdminAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    admin: req.user
  });
});

// Change Super Admin Password
saasRouter.post('/admin/auth/change-password', requireSuperAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Current password and a new password with at least 8 characters are required.'
      });
    }

    const admin = (await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id)) as any;
    if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user!.id);

    await logAdminAction({
      adminId: req.user!.id,
      adminEmail: req.user!.email,
      action: 'PASSWORD_CHANGE',
      details: 'Super Admin password was updated.'
    });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update password' });
  }
});

// Super Admin Audit Logs
saasRouter.get('/admin/audit-logs', requireSuperAdminAuth, async (_req, res) => {
  const logs = await db.prepare('SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 100').all();
  res.json({ success: true, logs });
});

// Get Platform Meta Configuration
saasRouter.get('/admin/config', requireSuperAdminAuth, async (_req, res) => {
  const config = await getPlatformMetaConfig();
  res.json({
    success: true,
    config: {
      ...config,
      appSecret: config.appSecret ? '••••••••' + config.appSecret.slice(-4) : ''
    }
  });
});

// Save Platform Meta Configuration
saasRouter.post('/admin/config', requireSuperAdminAuth, async (req: AuthenticatedRequest, res) => {
  const { appId, appSecret, configId, partnerSolutionId, webhookVerifyToken, coexistenceEnabled, graphVersion } = req.body;

  await savePlatformMetaConfig({
    appId,
    appSecret: appSecret && !appSecret.includes('••••') ? appSecret : undefined,
    configId,
    partnerSolutionId,
    webhookVerifyToken,
    coexistenceEnabled,
    graphVersion
  });

  await logAdminAction({
    adminId: req.user!.id,
    adminEmail: req.user!.email,
    action: 'UPDATE_META_CONFIG',
    details: `Updated Meta App ID: ${appId || 'unchanged'}`
  });

  res.json({ success: true, message: 'Platform Meta configuration updated successfully.' });
});

// List All Tenants (Super Admin)
saasRouter.get('/admin/tenants', requireSuperAdminAuth, async (_req, res) => {
  const tenants = await db.prepare(`
    SELECT t.*, p.name as plan_name,
           (SELECT count(*) FROM whatsapp_channels wc WHERE wc.tenant_id = t.id) as channel_count,
           (SELECT count(*) FROM users u WHERE u.tenant_id = t.id) as user_count
    FROM tenants t
    LEFT JOIN plans p ON t.plan_id = p.id
    ORDER BY t.created_at DESC
  `).all();

  res.json({ success: true, tenants });
});

// Update Tenant Status (Activate / Suspend)
saasRouter.post('/admin/tenants/:id/status', requireSuperAdminAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { status, monthlyQuota } = req.body;

  if (status) {
    await db.prepare('UPDATE tenants SET subscription_status = ? WHERE id = ?').run(status, id);
  }
  if (typeof monthlyQuota === 'number') {
    await db.prepare('UPDATE tenants SET monthly_message_quota = ? WHERE id = ?').run(monthlyQuota, id);
  }

  await logAdminAction({
    adminId: req.user!.id,
    adminEmail: req.user!.email,
    action: 'UPDATE_TENANT_STATUS',
    targetId: id as string,
    details: `Status set to ${status || 'unchanged'}, quota: ${monthlyQuota ?? 'unchanged'}`
  });

  res.json({ success: true, message: 'Tenant updated successfully.' });
});

// ==========================================
// 6. CUSTOMER ONBOARDING & TENANT PROFILE (KYC)
// ==========================================

saasRouter.get('/tenant/profile', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId as string);
  res.json({ success: true, tenant });
});

saasRouter.put('/tenant/profile', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      legalBusinessName,
      businessType,
      gstin,
      pan,
      registeredAddress,
      state,
      pincode,
      billingContactName,
      billingContactPhone,
      billingContactEmail
    } = req.body;

    let cleanPan = pan ? String(pan).trim().toUpperCase() : null;
    if (cleanPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
      return res.status(400).json({ success: false, error: 'Invalid PAN format. Must be 10 characters (e.g. ABCDE1234F).' });
    }

    let cleanGstin = gstin ? String(gstin).trim().toUpperCase() : null;
    if (cleanGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanGstin)) {
      return res.status(400).json({ success: false, error: 'Invalid GSTIN format. Must be 15 alphanumeric characters.' });
    }

    await db.prepare(`
      UPDATE tenants
      SET legal_business_name = COALESCE(?, legal_business_name),
          business_type = COALESCE(?, business_type),
          gstin = COALESCE(?, gstin),
          pan = COALESCE(?, pan),
          registered_address = COALESCE(?, registered_address),
          state = COALESCE(?, state),
          pincode = COALESCE(?, pincode),
          billing_contact_name = COALESCE(?, billing_contact_name),
          billing_contact_phone = COALESCE(?, billing_contact_phone),
          billing_contact_email = COALESCE(?, billing_contact_email)
      WHERE id = ?
    `).run(
      legalBusinessName || null,
      businessType || null,
      cleanGstin,
      cleanPan,
      registeredAddress || null,
      state ? String(state).trim().toUpperCase() : null,
      pincode || null,
      billingContactName || null,
      billingContactPhone || null,
      billingContactEmail || null,
      req.tenantId as string
    );

    const updated = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId as string);
    res.json({ success: true, message: 'Business profile updated successfully', tenant: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update business profile' });
  }
});

// ==========================================
// 7. INDIAN MARKET BILLING & RAZORPAY ROUTES
// ==========================================

saasRouter.post('/billing/order', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  try {
    const { planSlug, billingCycle = 'monthly', couponCode } = req.body;
    if (!planSlug) {
      return res.status(400).json({ success: false, error: 'Plan slug is required.' });
    }

    const tenant = (await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId as string)) as any;

    const orderData = await createSubscriptionOrder({
      tenantId: req.tenantId!,
      planSlug,
      billingCycle,
      couponCode,
      customerState: tenant?.state,
      customerGstin: tenant?.gstin
    });

    res.json(orderData);
  } catch (err: any) {
    console.error('Order creation error:', err);
    res.status(400).json({ success: false, error: err?.message || 'Failed to create subscription order' });
  }
});

saasRouter.post('/billing/verify', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  try {
    const { orderId, paymentId, signature, planSlug, billingCycle = 'monthly' } = req.body;
    if (!orderId || !paymentId || !planSlug) {
      return res.status(400).json({ success: false, error: 'orderId, paymentId, and planSlug are required.' });
    }

    const tenant = (await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId as string)) as any;

    const activationResult = await verifyAndActivateSubscription({
      tenantId: req.tenantId!,
      orderId,
      paymentId,
      signature,
      planSlug,
      billingCycle,
      customerBusinessName: tenant?.legal_business_name || tenant?.name,
      customerGstin: tenant?.gstin,
      customerState: tenant?.state,
      customerAddress: tenant?.registered_address
    });

    res.json(activationResult);
  } catch (err: any) {
    console.error('Payment verification error:', err);
    res.status(400).json({ success: false, error: err?.message || 'Payment verification failed' });
  }
});

saasRouter.post('/billing/validate-coupon', authenticateToken, async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, error: 'Coupon code required' });
  }
  const result = await validateCoupon(String(code));
  res.json({ success: result.valid, ...result });
});

saasRouter.get('/billing/invoices', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const invoices = await db.prepare('SELECT * FROM invoices WHERE tenant_id = ? ORDER BY created_at DESC').all(req.tenantId as string);
  res.json({ success: true, invoices });
});

saasRouter.get('/billing/invoices/:id', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const invoice = await db.prepare('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?').get(req.params.id as string, req.tenantId as string);
  if (!invoice) {
    return res.status(404).json({ success: false, error: 'Invoice not found' });
  }
  const config = await getBillingConfig();
  res.json({
    success: true,
    invoice,
    company: {
      name: config.companyName,
      gstin: config.companyGstin,
      address: config.companyAddress,
      state: config.companyState
    }
  });
});

// ==========================================
// 8. CRM CONTACTS & SEGMENTATION
// ==========================================

saasRouter.get('/contacts', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const { q, tag } = req.query;
  let sql = 'SELECT * FROM contacts WHERE tenant_id = ?';
  const params: any[] = [req.tenantId as string];

  if (q) {
    sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const searchPattern = `%${String(q).trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }
  if (tag) {
    sql += ' AND tags LIKE ?';
    params.push(`%${String(tag).trim()}%`);
  }

  sql += ' ORDER BY updated_at DESC LIMIT 200';
  const contacts = await db.prepare(sql).all(...params);
  res.json({ success: true, contacts });
});

saasRouter.post('/contacts', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  try {
    const { phone, name, email, tags, notes, customAttributes } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required.' });
    }

    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const now = Date.now();
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : (tags || '[]');
    const customJson = typeof customAttributes === 'object' ? JSON.stringify(customAttributes) : (customAttributes || '{}');

    const existing = (await db.prepare('SELECT id FROM contacts WHERE tenant_id = ? AND phone = ?').get(req.tenantId as string, cleanPhone)) as any;
    const contactId = existing?.id || uuidv4();

    if (existing) {
      await db.prepare(`
        UPDATE contacts
        SET name = COALESCE(?, name),
            email = COALESCE(?, email),
            tags = ?,
            custom_attributes = ?,
            notes = COALESCE(?, notes),
            updated_at = ?
        WHERE id = ?
      `).run(name || null, email || null, tagsJson, customJson, notes || null, now, contactId);
    } else {
      await db.prepare(`
        INSERT INTO contacts (id, tenant_id, phone, name, email, tags, custom_attributes, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(contactId, req.tenantId as string, cleanPhone, name || cleanPhone, email || null, tagsJson, customJson, notes || null, now, now);
    }

    const contact = await db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    res.json({ success: true, contact });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save contact' });
  }
});

saasRouter.post('/contacts/import-csv', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  try {
    const { contacts } = req.body;
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, error: 'Array of contacts is required.' });
    }

    const now = Date.now();
    let imported = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO contacts (id, tenant_id, phone, name, email, tags, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, phone) DO UPDATE SET
        name = COALESCE(excluded.name, contacts.name),
        email = COALESCE(excluded.email, contacts.email),
        tags = excluded.tags,
        updated_at = excluded.updated_at
    `);

    for (const c of contacts) {
      const cleanPhone = String(c.phone || '').replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 7) {
        const tagsJson = Array.isArray(c.tags) ? JSON.stringify(c.tags) : JSON.stringify([c.tags || 'imported']);
        await upsertStmt.run(
          uuidv4(),
          req.tenantId as string,
          cleanPhone,
          c.name || cleanPhone,
          c.email || null,
          tagsJson,
          c.notes || null,
          now,
          now
        );
        imported++;
      }
    }

    res.json({ success: true, count: imported, message: `Successfully imported ${imported} contacts.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to import contacts' });
  }
});

saasRouter.delete('/contacts/:id', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  await db.prepare('DELETE FROM contacts WHERE id = ? AND tenant_id = ?').run(req.params.id as string, req.tenantId as string);
  res.json({ success: true, message: 'Contact deleted.' });
});

// ==========================================
// 9. TEAM COLLABORATION & CONVERSATION MANAGEMENT
// ==========================================

saasRouter.get('/team/members', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const members = await db.prepare(`
    SELECT id, email, name, role, created_at
    FROM users
    WHERE tenant_id = ?
    ORDER BY created_at ASC
  `).all(req.tenantId as string);

  res.json({ success: true, members });
});

saasRouter.post('/team/members', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  try {
    const { email, name, role = 'agent', password } = req.body;
    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'Email and name are required.' });
    }

    const tenant = (await db.prepare(`
      SELECT t.*, p.max_team_members
      FROM tenants t
      LEFT JOIN plans p ON t.plan_id = p.id
      WHERE t.id = ?
    `).get(req.tenantId as string)) as any;

    const currentMemberCount = (await db.prepare('SELECT count(*) as count FROM users WHERE tenant_id = ?').get(req.tenantId as string)) as { count: number | bigint | string } | undefined;
    const maxAllowed = tenant?.max_team_members || 2;

    if (Number(currentMemberCount?.count || 0) >= maxAllowed) {
      return res.status(403).json({
        success: false,
        error: `Your subscription allows up to ${maxAllowed} team members. Please upgrade your plan in Billing.`
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ success: false, error: 'A user with this email already exists.' });
    }

    const defaultPwd = password || 'Welcome@123';
    const pwdHash = bcrypt.hashSync(defaultPwd, 10);
    const userId = uuidv4();
    const now = Date.now();

    await db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, req.tenantId as string, cleanEmail, pwdHash, name.trim(), role, now);

    res.status(201).json({
      success: true,
      member: { id: userId, email: cleanEmail, name: name.trim(), role, created_at: now }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to add team member' });
  }
});

saasRouter.delete('/team/members/:id', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  if (req.user!.id === req.params.id) {
    return res.status(400).json({ success: false, error: 'Cannot remove yourself from the workspace.' });
  }

  await db.prepare('DELETE FROM users WHERE id = ? AND tenant_id = ?').run(req.params.id as string, req.tenantId as string);
  res.json({ success: true, message: 'Team member removed.' });
});

saasRouter.post('/chats/conversations/:id/assign', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const { assignedToUserId } = req.body;
  await db.prepare('UPDATE conversations SET assigned_to_user_id = ? WHERE id = ? AND tenant_id = ?')
    .run(assignedToUserId || null, req.params.id as string, req.tenantId as string);
  res.json({ success: true, message: 'Conversation assignment updated.' });
});

saasRouter.post('/chats/conversations/:id/notes', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const { notes } = req.body;
  await db.prepare('UPDATE conversations SET internal_notes = ? WHERE id = ? AND tenant_id = ?')
    .run(notes || null, req.params.id as string, req.tenantId as string);
  res.json({ success: true, message: 'Internal notes saved.' });
});

saasRouter.post('/chats/conversations/:id/status', authenticateToken, requireTenant, async (req: AuthenticatedRequest, res) => {
  const { status } = req.body;
  await db.prepare('UPDATE conversations SET status = ? WHERE id = ? AND tenant_id = ?')
    .run(status || 'open', req.params.id as string, req.tenantId as string);
  res.json({ success: true, message: 'Conversation status updated.' });
});

// ==========================================
// 10. SUPER ADMIN BI ANALYTICS & BILLING CONFIG
// ==========================================

saasRouter.get('/admin/analytics', requireSuperAdminAuth, async (_req, res) => {
  try {
    const totalTenantsRow = (await db.prepare('SELECT count(*) as count FROM tenants').get()) as { count: number | bigint | string } | undefined;
    const activeSubscribersRow = (await db.prepare("SELECT count(*) as count FROM tenants WHERE subscription_status = 'active'").get()) as { count: number | bigint | string } | undefined;
    const totalMessagesRow = (await db.prepare('SELECT count(*) as count FROM messages').get()) as { count: number | bigint | string } | undefined;
    const totalPaymentsRow = (await db.prepare("SELECT COALESCE(SUM(amount), 0) as total, count(*) as count FROM payments WHERE status = 'captured'").get()) as { total: number | string, count: number | bigint | string } | undefined;
    const totalChannelsRow = (await db.prepare('SELECT count(*) as count FROM whatsapp_channels').get()) as { count: number | bigint | string } | undefined;
    const activeChannelsRow = (await db.prepare("SELECT count(*) as count FROM whatsapp_channels WHERE status = 'active'").get()) as { count: number | bigint | string } | undefined;
    const failedWebhooksRow = (await db.prepare("SELECT count(*) as count FROM webhook_logs WHERE event_type LIKE '%fail%' OR event_type LIKE '%error%'").get()) as { count: number | bigint | string } | undefined;

    const planDistribution = await db.prepare(`
      SELECT p.name, p.slug, p.price_monthly, count(t.id) as subscriber_count
      FROM plans p
      LEFT JOIN tenants t ON t.plan_id = p.id
      GROUP BY p.id, p.name, p.slug, p.price_monthly
    `).all();

    let mrr = 0;
    (planDistribution as any[]).forEach((p) => {
      mrr += (p.price_monthly || 0) * (Number(p.subscriber_count) || 0);
    });
    const arr = mrr * 12;

    const recentPayments = await db.prepare(`
      SELECT p.*, t.name as tenant_name
      FROM payments p
      LEFT JOIN tenants t ON p.tenant_id = t.id
      ORDER BY p.created_at DESC LIMIT 10
    `).all();

    res.json({
      success: true,
      analytics: {
        totalTenants: Number(totalTenantsRow?.count || 0),
        activeSubscribers: Number(activeSubscribersRow?.count || 0),
        totalMessages: Number(totalMessagesRow?.count || 0),
        totalRevenue: Number(totalPaymentsRow?.total || 0),
        paymentsCount: Number(totalPaymentsRow?.count || 0),
        mrr,
        arr,
        totalChannels: Number(totalChannelsRow?.count || 0),
        activeChannels: Number(activeChannelsRow?.count || 0),
        failedWebhooks: Number(failedWebhooksRow?.count || 0),
        planDistribution,
        recentPayments
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to load analytics' });
  }
});

saasRouter.get('/admin/billing/config', requireSuperAdminAuth, async (_req, res) => {
  const config = await getBillingConfig();
  res.json({
    success: true,
    config: {
      ...config,
      razorpayKeySecret: config.razorpayKeySecret ? '••••••••' + config.razorpayKeySecret.slice(-4) : ''
    }
  });
});

saasRouter.post('/admin/billing/config', requireSuperAdminAuth, async (req: AuthenticatedRequest, res) => {
  const { razorpayKeyId, razorpayKeySecret, companyName, companyGstin, companyState, companyAddress } = req.body;
  await saveBillingConfig({
    razorpayKeyId,
    razorpayKeySecret: razorpayKeySecret && !razorpayKeySecret.includes('••••') ? razorpayKeySecret : undefined,
    companyName,
    companyGstin,
    companyState,
    companyAddress
  });

  await logAdminAction({
    adminId: req.user!.id,
    adminEmail: req.user!.email,
    action: 'UPDATE_BILLING_CONFIG',
    details: `Updated Billing & GST settings for ${companyName || 'platform'}`
  });

  res.json({ success: true, message: 'Billing and GST configuration updated.' });
});

saasRouter.get('/admin/plans', requireSuperAdminAuth, async (_req, res) => {
  const plans = await db.prepare('SELECT * FROM plans ORDER BY price_monthly ASC').all();
  res.json({ success: true, plans });
});

saasRouter.put('/admin/plans/:id', requireSuperAdminAuth, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { name, priceMonthly, priceYearly, maxNumbers, maxMembers, monthlyQuota, coexistenceAllowed, isActive } = req.body;

  await db.prepare(`
    UPDATE plans
    SET name = COALESCE(?, name),
        price_monthly = COALESCE(?, price_monthly),
        price_yearly = COALESCE(?, price_yearly),
        max_whatsapp_numbers = COALESCE(?, max_whatsapp_numbers),
        max_team_members = COALESCE(?, max_team_members),
        monthly_message_quota = COALESCE(?, monthly_message_quota),
        coexistence_allowed = COALESCE(?, coexistence_allowed),
        is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    name || null,
    priceMonthly ?? null,
    priceYearly ?? null,
    maxNumbers ?? null,
    maxMembers ?? null,
    monthlyQuota ?? null,
    coexistenceAllowed !== undefined ? (coexistenceAllowed ? 1 : 0) : null,
    isActive !== undefined ? (isActive ? 1 : 0) : null,
    id as string
  );

  await logAdminAction({
    adminId: req.user!.id,
    adminEmail: req.user!.email,
    action: 'UPDATE_PLAN',
    targetId: id as string,
    details: `Updated plan ${id} settings`
  });

  res.json({ success: true, message: 'Plan updated successfully.' });
});
