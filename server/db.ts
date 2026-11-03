import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'saas_platform.sqlite');
export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    -- Platform-wide configuration (Super Admin settings)
    CREATE TABLE IF NOT EXISTS platform_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Subscription Plans
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      price_monthly REAL NOT NULL DEFAULT 0,
      price_yearly REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'INR',
      max_whatsapp_numbers INTEGER NOT NULL DEFAULT 1,
      max_team_members INTEGER NOT NULL DEFAULT 2,
      monthly_message_quota INTEGER NOT NULL DEFAULT 1000,
      coexistence_allowed INTEGER NOT NULL DEFAULT 1,
      campaigns_allowed INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    -- Tenants / Businesses / Workspaces
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      plan_id TEXT REFERENCES plans(id),
      subscription_status TEXT NOT NULL DEFAULT 'active', -- active, past_due, canceled, trial
      monthly_message_quota INTEGER NOT NULL DEFAULT 1000,
      messages_used_current_cycle INTEGER NOT NULL DEFAULT 0,
      legal_business_name TEXT,
      gstin TEXT,
      pan TEXT,
      registered_address TEXT,
      state TEXT,
      pincode TEXT,
      billing_contact TEXT,
      created_at INTEGER NOT NULL
    );

    -- Users & Team Members
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent', -- super_admin, tenant_owner, tenant_admin, agent
      created_at INTEGER NOT NULL
    );

    -- WhatsApp Business Connections / Channels
    CREATE TABLE IF NOT EXISTS whatsapp_channels (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      connection_mode TEXT NOT NULL DEFAULT 'byo_meta', -- 'byo_meta' or 'embedded_signup'
      waba_id TEXT,
      phone_number_id TEXT UNIQUE,
      display_phone_number TEXT,
      verified_name TEXT,
      access_token TEXT NOT NULL,
      app_id TEXT,
      app_secret TEXT,
      coexistence_enabled INTEGER NOT NULL DEFAULT 0,
      webhook_verify_token TEXT,
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'disconnected', 'rate_limited'
      connected_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- In-App Conversations
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      channel_id TEXT REFERENCES whatsapp_channels(id) ON DELETE SET NULL,
      customer_phone TEXT NOT NULL,
      customer_name TEXT,
      avatar_color TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_preview TEXT,
      updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(tenant_id, customer_phone)
    );

    -- Messages
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      meta_message_id TEXT,
      from_me INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'text', -- 'text', 'image', 'video', 'audio', 'document', 'location', 'template'
      text TEXT,
      media_url TEXT,
      media_caption TEXT,
      filename TEXT,
      location_json TEXT,
      status TEXT NOT NULL DEFAULT 'sent', -- 'pending', 'sent', 'delivered', 'read', 'failed'
      created_at INTEGER NOT NULL
    );

    -- Audit & Webhook Logs
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Super Admin Audit Logs
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    );

    -- Brute-Force Login Attempt Protection
    CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY, -- email or ip
      attempts INTEGER NOT NULL DEFAULT 1,
      locked_until INTEGER NOT NULL DEFAULT 0,
      last_attempt INTEGER NOT NULL
    );

    -- Indian Market Billing: Payments Ledger
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      order_id TEXT,
      payment_id TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'captured', -- created, captured, failed, refunded
      method TEXT NOT NULL DEFAULT 'upi', -- upi, card, netbanking, wallet
      gst_amount REAL NOT NULL DEFAULT 0,
      gstin TEXT,
      invoice_number TEXT,
      plan_id TEXT REFERENCES plans(id),
      billing_cycle TEXT NOT NULL DEFAULT 'monthly', -- monthly, yearly
      created_at INTEGER NOT NULL
    );

    -- GST-Compliant Tax Invoices
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      payment_id TEXT REFERENCES payments(id),
      customer_business_name TEXT NOT NULL,
      customer_gstin TEXT,
      customer_address TEXT,
      customer_state TEXT,
      hsn_sac TEXT NOT NULL DEFAULT '998313', -- Information Technology / SaaS
      subtotal REAL NOT NULL,
      cgst_rate REAL NOT NULL DEFAULT 0.09,
      cgst_amount REAL NOT NULL DEFAULT 0,
      sgst_rate REAL NOT NULL DEFAULT 0.09,
      sgst_amount REAL NOT NULL DEFAULT 0,
      igst_rate REAL NOT NULL DEFAULT 0.18,
      igst_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'paid', -- paid, void, refund_initiated
      created_at INTEGER NOT NULL
    );

    -- Promotional & Discount Coupons
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      discount_percent INTEGER NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      max_uses INTEGER NOT NULL DEFAULT 100,
      uses_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    -- CRM Contacts & Customer Segmentation
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      name TEXT,
      email TEXT,
      tags TEXT, -- JSON array of tags e.g. ["lead", "vip"]
      custom_attributes TEXT, -- JSON key-value pairs
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, phone)
    );

    -- WhatsApp Message Templates Sync & Library
    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      meta_template_id TEXT,
      name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en_US',
      category TEXT NOT NULL, -- MARKETING, UTILITY, AUTHENTICATION
      status TEXT NOT NULL DEFAULT 'APPROVED', -- APPROVED, PENDING, REJECTED
      components_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(tenant_id, name, language)
    );

    -- WhatsApp OTP Verification Records
    CREATE TABLE IF NOT EXISTS otp_verifications (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      otp_plain TEXT,
      purpose TEXT NOT NULL DEFAULT 'registration',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      verified INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- OTP Rate Limiting Table (sliding window per phone and IP)
    CREATE TABLE IF NOT EXISTS otp_rate_limits (
      key TEXT PRIMARY KEY,
      requests_count INTEGER NOT NULL DEFAULT 1,
      window_start INTEGER NOT NULL,
      last_request INTEGER NOT NULL
    );

    -- Indexes for high-speed multi-tenant queries
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_meta_id ON messages(meta_message_id);
    CREATE INDEX IF NOT EXISTS idx_channels_phone_id ON whatsapp_channels(phone_number_id);
    CREATE INDEX IF NOT EXISTS idx_channels_waba_id ON whatsapp_channels(waba_id);
    CREATE INDEX IF NOT EXISTS idx_channels_tenant ON whatsapp_channels(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_conv_tenant ON conversations(tenant_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(tenant_id, phone);
    CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone, expires_at);
  `);

  // Safe schema migrations for existing database files
  try { db.exec("ALTER TABLE users ADD COLUMN mobile TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0;"); } catch (_) {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);"); } catch (_) {}
  try { db.exec("ALTER TABLE plans ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN legal_business_name TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN business_type TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN gstin TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN pan TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN registered_address TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN state TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN pincode TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN billing_contact TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN billing_contact_name TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN billing_contact_phone TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE tenants ADD COLUMN billing_contact_email TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE conversations ADD COLUMN assigned_to_user_id TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE conversations ADD COLUMN internal_notes TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE conversations ADD COLUMN tags TEXT;"); } catch (_) {}
  try { db.exec("ALTER TABLE conversations ADD COLUMN status TEXT DEFAULT 'open';"); } catch (_) {}

  seedDefaultData();
}

function seedDefaultData() {
  const now = Date.now();

  // 1. Seed or Update INR Indian Market Plans (Prompt2 specs)
  const upsertPlan = db.prepare(`
    INSERT INTO plans (id, name, slug, price_monthly, price_yearly, currency, max_whatsapp_numbers, max_team_members, monthly_message_quota, coexistence_allowed, campaigns_allowed, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      price_monthly = excluded.price_monthly,
      price_yearly = excluded.price_yearly,
      currency = 'INR',
      max_whatsapp_numbers = excluded.max_whatsapp_numbers,
      max_team_members = excluded.max_team_members,
      monthly_message_quota = excluded.monthly_message_quota
  `);

  upsertPlan.run('plan_starter', 'Starter', 'starter', 999, 9990, 1, 2, 5000, 1, 1, now);
  upsertPlan.run('plan_growth', 'Growth', 'growth', 2499, 24990, 3, 10, 30000, 1, 1, now);
  upsertPlan.run('plan_pro', 'Pro', 'pro', 4999, 49990, 5, 25, 100000, 1, 1, now);
  upsertPlan.run('plan_enterprise', 'Enterprise', 'enterprise', 0, 0, 10, 50, 500000, 1, 1, now);

  // Seed Default Discount Coupons
  const couponCheck = db.prepare('SELECT count(*) as count FROM coupons').get() as { count: number | bigint };
  if (!couponCheck || Number(couponCheck.count) === 0) {
    db.prepare('INSERT INTO coupons (id, code, discount_percent, max_uses, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(uuidv4(), 'WELCOME50', 50, 500, now);
    db.prepare('INSERT INTO coupons (id, code, discount_percent, max_uses, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(uuidv4(), 'STARTUP20', 20, 1000, now);
  }

  // 2. Seed Default Super Admin
  const adminCheck = db.prepare("SELECT id FROM users WHERE role = 'super_admin'").get();
  if (!adminCheck) {
    const defaultAdminHash = bcrypt.hashSync('Admin@12345', 10);
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, created_at)
      VALUES (?, NULL, ?, ?, ?, 'super_admin', ?)
    `).run(uuidv4(), 'admin@whatchat.online', defaultAdminHash, 'Platform Super Admin', now);
  }

  // 3. Seed Default / Demo Tenant for backward compatibility
  const defaultTenantCheck = db.prepare("SELECT id FROM tenants WHERE slug = 'default-workspace'").get();
  let defaultTenantId = 'tenant_default_01';
  if (!defaultTenantCheck) {
    db.prepare(`
      INSERT INTO tenants (id, name, slug, plan_id, subscription_status, monthly_message_quota, messages_used_current_cycle, created_at)
      VALUES (?, ?, 'default-workspace', 'plan_growth', 'active', 50000, 0, ?)
    `).run(defaultTenantId, 'Default Workspace', now);

    const defaultOwnerHash = bcrypt.hashSync('Owner@12345', 10);
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, created_at)
      VALUES (?, ?, ?, ?, ?, 'tenant_owner', ?)
    `).run(uuidv4(), defaultTenantId, 'owner@example.com', defaultOwnerHash, 'Workspace Owner', now);
  }

  // 4. Migrate existing legacy credentials into default tenant if present
  try {
    const credsFile = path.join(DATA_DIR, 'server_credentials.json');
    if (fs.existsSync(credsFile)) {
      const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
      if (creds.phoneNumberId && creds.accessToken) {
        const existingChannel = db.prepare('SELECT id FROM whatsapp_channels WHERE phone_number_id = ?').get(creds.phoneNumberId);
        if (!existingChannel) {
          db.prepare(`
            INSERT INTO whatsapp_channels (id, tenant_id, connection_mode, waba_id, phone_number_id, display_phone_number, verified_name, access_token, app_id, app_secret, coexistence_enabled, webhook_verify_token, status, connected_at, updated_at)
            VALUES (?, ?, 'byo_meta', ?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?)
          `).run(
            uuidv4(),
            defaultTenantId,
            creds.wabaId || null,
            creds.phoneNumberId,
            creds.phoneNumber || null,
            creds.verifiedName || null,
            creds.accessToken,
            creds.appId || null,
            creds.appSecret || null,
            creds.webhookVerifyToken || 'whatscloud_token',
            now,
            now
          );
        }
      }
    }
  } catch (err) {
    console.warn('[DB Seed] Legacy credentials migration skipped:', err);
  }
}
