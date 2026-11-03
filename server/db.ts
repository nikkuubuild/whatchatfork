import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

const databaseUrl = process.env.DATABASE_URL?.trim();
export const isConfigured = Boolean(databaseUrl && databaseUrl.length > 0);

export let pool: pg.Pool | null = null;

if (isConfigured) {
  const isLocal = databaseUrl!.includes('localhost') || databaseUrl!.includes('127.0.0.1');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('[PostgreSQL Pool Background Error]:', err?.message || err);
  });

  console.log(`[Database] PostgreSQL connection pool initialized with DATABASE_URL (${isLocal ? 'Local' : 'Live Cloud with SSL'})`);
} else {
  console.warn('================================================================');
  console.warn('[DATABASE NOTICE] DATABASE_URL environment variable is NOT set!');
  console.warn('To connect your live PostgreSQL database on Render:');
  console.warn('1. In Render Dashboard, click your Web Service ("whatchatfork")');
  console.warn('2. Go to the "Environment" tab');
  console.warn('3. Add Environment Variable:');
  console.warn('   Key:   DATABASE_URL');
  console.warn('   Value: postgres://user:password@hostname/dbname');
  console.warn('The server will start and wait for DATABASE_URL.');
  console.warn('================================================================');
}

/**
 * Translates ? placeholders to PostgreSQL $1, $2, ... placeholders.
 */
function toPgSql(sql: string): string {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}

/**
 * Sanitizes parameters: converts undefined to null so PostgreSQL parameter binding never fails
 */
function sanitizeParams(params: any[] = []): any[] {
  return params.map(p => (p === undefined ? null : p));
}

function checkPool(): pg.Pool {
  if (!pool) {
    throw new Error('Database not connected. Please set the DATABASE_URL environment variable in your Render Dashboard settings.');
  }
  return pool;
}

/**
 * Pure PostgreSQL Database Interface
 */
export const db = {
  isPostgres: () => true,

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const activePool = checkPool();
    const cleanParams = sanitizeParams(params);
    const res = await activePool.query(toPgSql(sql), cleanParams);
    return res.rows as T[];
  },

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const activePool = checkPool();
    const cleanParams = sanitizeParams(params);
    const res = await activePool.query(toPgSql(sql), cleanParams);
    return (res.rows[0] as T) || undefined;
  },

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.query<T>(sql, params);
  },

  async run(sql: string, params: any[] = []): Promise<{ changes: number }> {
    const activePool = checkPool();
    const cleanParams = sanitizeParams(params);
    const res = await activePool.query(toPgSql(sql), cleanParams);
    return { changes: res.rowCount || 0 };
  },

  async exec(sql: string): Promise<void> {
    const activePool = checkPool();
    await activePool.query(sql);
  },

  prepare(sql: string) {
    return {
      get: async <T = any>(...params: any[]): Promise<T | undefined> => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return db.get<T>(sql, flatParams);
      },
      all: async <T = any>(...params: any[]): Promise<T[]> => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return db.all<T>(sql, flatParams);
      },
      run: async (...params: any[]): Promise<{ changes: number }> => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return db.run(sql, flatParams);
      }
    };
  }
};

export async function initDatabase() {
  if (!pool) {
    console.warn('[Database] Skipping schema init: DATABASE_URL is not set yet. The server will start and wait for DATABASE_URL.');
    return;
  }

  console.log('[Database] Initializing PostgreSQL schema & relations...');

  try {
    const ddlStatements = [
      `CREATE TABLE IF NOT EXISTS platform_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        price_monthly DOUBLE PRECISION NOT NULL DEFAULT 0,
        price_yearly DOUBLE PRECISION NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'INR',
        max_whatsapp_numbers INTEGER NOT NULL DEFAULT 1,
        max_team_members INTEGER NOT NULL DEFAULT 2,
        monthly_message_quota INTEGER NOT NULL DEFAULT 1000,
        coexistence_allowed INTEGER NOT NULL DEFAULT 1,
        campaigns_allowed INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        plan_id TEXT REFERENCES plans(id),
        subscription_status TEXT NOT NULL DEFAULT 'active',
        monthly_message_quota INTEGER NOT NULL DEFAULT 1000,
        messages_used_current_cycle INTEGER NOT NULL DEFAULT 0,
        legal_business_name TEXT,
        business_type TEXT,
        gstin TEXT,
        pan TEXT,
        registered_address TEXT,
        state TEXT,
        pincode TEXT,
        billing_contact TEXT,
        billing_contact_name TEXT,
        billing_contact_phone TEXT,
        billing_contact_email TEXT,
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'agent',
        mobile TEXT,
        phone_verified INTEGER DEFAULT 0,
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS whatsapp_channels (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        connection_mode TEXT NOT NULL DEFAULT 'byo_meta',
        waba_id TEXT,
        phone_number_id TEXT UNIQUE,
        display_phone_number TEXT,
        verified_name TEXT,
        access_token TEXT NOT NULL,
        app_id TEXT,
        app_secret TEXT,
        coexistence_enabled INTEGER NOT NULL DEFAULT 0,
        webhook_verify_token TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        connected_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        channel_id TEXT REFERENCES whatsapp_channels(id) ON DELETE SET NULL,
        customer_phone TEXT NOT NULL,
        customer_name TEXT,
        avatar_color TEXT,
        unread_count INTEGER NOT NULL DEFAULT 0,
        last_message_preview TEXT,
        assigned_to_user_id TEXT,
        internal_notes TEXT,
        tags TEXT,
        status TEXT DEFAULT 'open',
        updated_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE(tenant_id, customer_phone)
      );`,

      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        meta_message_id TEXT,
        from_me INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'text',
        text TEXT,
        media_url TEXT,
        media_caption TEXT,
        filename TEXT,
        location_json TEXT,
        status TEXT NOT NULL DEFAULT 'sent',
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS webhook_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        admin_email TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS login_attempts (
        key TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 1,
        locked_until BIGINT NOT NULL DEFAULT 0,
        last_attempt BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        order_id TEXT,
        payment_id TEXT,
        amount DOUBLE PRECISION NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'captured',
        method TEXT NOT NULL DEFAULT 'upi',
        gst_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        gstin TEXT,
        invoice_number TEXT,
        plan_id TEXT REFERENCES plans(id),
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT UNIQUE NOT NULL,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        payment_id TEXT REFERENCES payments(id),
        customer_business_name TEXT NOT NULL,
        customer_gstin TEXT,
        customer_address TEXT,
        customer_state TEXT,
        hsn_sac TEXT NOT NULL DEFAULT '998313',
        subtotal DOUBLE PRECISION NOT NULL,
        cgst_rate DOUBLE PRECISION NOT NULL DEFAULT 0.09,
        cgst_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        sgst_rate DOUBLE PRECISION NOT NULL DEFAULT 0.09,
        sgst_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        igst_rate DOUBLE PRECISION NOT NULL DEFAULT 0.18,
        igst_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        total_amount DOUBLE PRECISION NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'paid',
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        discount_percent INTEGER NOT NULL DEFAULT 0,
        discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        max_uses INTEGER NOT NULL DEFAULT 100,
        uses_count INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        name TEXT,
        email TEXT,
        tags TEXT,
        custom_attributes TEXT,
        notes TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(tenant_id, phone)
      );`,

      `CREATE TABLE IF NOT EXISTS message_templates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        meta_template_id TEXT,
        name TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en_US',
        category TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'APPROVED',
        components_json TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(tenant_id, name, language)
      );`,

      `CREATE TABLE IF NOT EXISTS otp_verifications (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        otp_plain TEXT,
        purpose TEXT NOT NULL DEFAULT 'registration',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        verified INTEGER NOT NULL DEFAULT 0,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS otp_rate_limits (
        key TEXT PRIMARY KEY,
        requests_count INTEGER NOT NULL DEFAULT 1,
        window_start BIGINT NOT NULL,
        last_request BIGINT NOT NULL
      );`,

      // PostgreSQL Indexes
      `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);`,
      `CREATE INDEX IF NOT EXISTS idx_messages_meta_id ON messages(meta_message_id);`,
      `CREATE INDEX IF NOT EXISTS idx_channels_phone_id ON whatsapp_channels(phone_number_id);`,
      `CREATE INDEX IF NOT EXISTS idx_channels_waba_id ON whatsapp_channels(waba_id);`,
      `CREATE INDEX IF NOT EXISTS idx_channels_tenant ON whatsapp_channels(tenant_id);`,
      `CREATE INDEX IF NOT EXISTS idx_conv_tenant ON conversations(tenant_id, updated_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id, updated_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(tenant_id, phone);`,
      `CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone, expires_at);`,
      `CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);`
    ];

    for (const ddl of ddlStatements) {
      try {
        await db.exec(ddl);
      } catch (err: any) {
        console.warn('[PostgreSQL DDL Notice]:', err?.message || err);
      }
    }

    // Safe schema migrations for existing columns in PostgreSQL
    const migrationColumns = [
      { table: 'users', col: 'mobile', type: 'TEXT' },
      { table: 'users', col: 'phone_verified', type: 'INTEGER DEFAULT 0' },
      { table: 'plans', col: 'currency', type: "TEXT NOT NULL DEFAULT 'INR'" },
      { table: 'tenants', col: 'legal_business_name', type: 'TEXT' },
      { table: 'tenants', col: 'business_type', type: 'TEXT' },
      { table: 'tenants', col: 'gstin', type: 'TEXT' },
      { table: 'tenants', col: 'pan', type: 'TEXT' },
      { table: 'tenants', col: 'registered_address', type: 'TEXT' },
      { table: 'tenants', col: 'state', type: 'TEXT' },
      { table: 'tenants', col: 'pincode', type: 'TEXT' },
      { table: 'tenants', col: 'billing_contact', type: 'TEXT' },
      { table: 'tenants', col: 'billing_contact_name', type: 'TEXT' },
      { table: 'tenants', col: 'billing_contact_phone', type: 'TEXT' },
      { table: 'tenants', col: 'billing_contact_email', type: 'TEXT' },
      { table: 'whatsapp_channels', col: 'webhook_verified_at', type: 'BIGINT' },
      { table: 'whatsapp_channels', col: 'webhook_url', type: 'TEXT' },
      { table: 'conversations', col: 'assigned_to_user_id', type: 'TEXT' },
      { table: 'conversations', col: 'internal_notes', type: 'TEXT' },
      { table: 'conversations', col: 'tags', type: 'TEXT' },
      { table: 'conversations', col: 'status', type: "TEXT DEFAULT 'open'" },
    ];

    for (const m of migrationColumns) {
      try {
        await db.exec(`ALTER TABLE ${m.table} ADD COLUMN IF NOT EXISTS ${m.col} ${m.type};`);
      } catch (_) {}
    }

    try {
      await seedDefaultData();
    } catch (seedErr: any) {
      console.warn('[PostgreSQL Seed Warning]:', seedErr?.message || seedErr);
    }

    console.log('[Database] PostgreSQL schema initialization and seeding complete.');
  } catch (err: any) {
    console.error('[PostgreSQL Init Notice] Could not connect to database:', err?.message || err);
    console.error('[PostgreSQL Init Notice] Please verify DATABASE_URL in your Render Dashboard settings.');
  }
}

async function seedDefaultData() {
  const now = Date.now();

  // 1. Seed or Update INR Indian Market Plans
  const upsertPlanSql = `
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
  `;

  await db.prepare(upsertPlanSql).run('plan_starter', 'Starter', 'starter', 999, 9990, 1, 2, 5000, 1, 1, now);
  await db.prepare(upsertPlanSql).run('plan_growth', 'Growth', 'growth', 2499, 24990, 3, 10, 30000, 1, 1, now);
  await db.prepare(upsertPlanSql).run('plan_pro', 'Pro', 'pro', 4999, 49990, 5, 25, 100000, 1, 1, now);
  await db.prepare(upsertPlanSql).run('plan_enterprise', 'Enterprise', 'enterprise', 0, 0, 10, 50, 500000, 1, 1, now);

  // Seed Default Discount Coupons
  const couponCheck = await db.prepare('SELECT count(*) as count FROM coupons').get() as { count: number | bigint | string } | undefined;
  if (!couponCheck || Number(couponCheck.count) === 0) {
    await db.prepare('INSERT INTO coupons (id, code, discount_percent, max_uses, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(uuidv4(), 'WELCOME50', 50, 500, now);
    await db.prepare('INSERT INTO coupons (id, code, discount_percent, max_uses, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(uuidv4(), 'STARTUP20', 20, 1000, now);
  }

  // 2. Seed Default Super Admin
  const adminCheck = await db.prepare("SELECT id FROM users WHERE role = 'super_admin'").get();
  if (!adminCheck) {
    const defaultAdminHash = bcrypt.hashSync('Admin@12345', 10);
    await db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, created_at)
      VALUES (?, NULL, ?, ?, ?, 'super_admin', ?)
    `).run(uuidv4(), 'admin@whatchat.online', defaultAdminHash, 'Platform Super Admin', now);
  }

  // 3. Seed Default / Demo Tenant for backward compatibility
  const defaultTenantCheck = await db.prepare("SELECT id FROM tenants WHERE slug = 'default-workspace'").get();
  const defaultTenantId = 'tenant_default_01';
  if (!defaultTenantCheck) {
    await db.prepare(`
      INSERT INTO tenants (id, name, slug, plan_id, subscription_status, monthly_message_quota, messages_used_current_cycle, created_at)
      VALUES (?, ?, 'default-workspace', 'plan_growth', 'active', 50000, 0, ?)
    `).run(defaultTenantId, 'Default Workspace', now);

    const defaultOwnerHash = bcrypt.hashSync('Owner@12345', 10);
    await db.prepare(`
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
        const existingChannel = await db.prepare('SELECT id FROM whatsapp_channels WHERE phone_number_id = ?').get(creds.phoneNumberId);
        if (!existingChannel) {
          await db.prepare(`
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
    console.warn('[PostgreSQL DB Seed] Legacy credentials migration notice:', err);
  }
}
