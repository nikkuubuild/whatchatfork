import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'whatchat_saas_super_secure_jwt_secret_2026';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'whatchat_admin_isolated_super_secret_2026';

export interface AuthUser {
  id: string;
  email: string;
  mobile?: string;
  name: string;
  role: 'super_admin' | 'tenant_owner' | 'tenant_admin' | 'agent';
  tenantId?: string | null;
  isAdminSession?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  tenantId?: string;
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      mobile: user.mobile,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId || null
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// Generate short-lived (8h) isolated admin session token
export function generateAdminToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'super_admin',
      isAdminSession: true
    },
    ADMIN_JWT_SECRET,
    { expiresIn: '8h' }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export function verifyAdminToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, ADMIN_JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

// Rate Limiting on Login Attempts
export function checkLoginAttempts(key: string): { allowed: boolean; remainingLockSeconds?: number } {
  const now = Date.now();
  const record = db.prepare('SELECT attempts, locked_until FROM login_attempts WHERE key = ?').get(key) as {
    attempts: number;
    locked_until: number;
  } | undefined;

  if (record && record.locked_until > now) {
    return { allowed: false, remainingLockSeconds: Math.ceil((record.locked_until - now) / 1000) };
  }
  return { allowed: true };
}

export function recordFailedLogin(key: string) {
  const now = Date.now();
  const record = db.prepare('SELECT attempts FROM login_attempts WHERE key = ?').get(key) as { attempts: number } | undefined;
  const attempts = (record?.attempts || 0) + 1;
  const lockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : 0; // Lock 15 mins after 5 failures

  db.prepare(`
    INSERT INTO login_attempts (key, attempts, locked_until, last_attempt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until, last_attempt = excluded.last_attempt
  `).run(key, attempts, lockedUntil, now);
}

export function resetLoginAttempts(key: string) {
  db.prepare('DELETE FROM login_attempts WHERE key = ?').run(key);
}

// Super Admin Audit Logging
export function logAdminAction(params: {
  adminId: string;
  adminEmail: string;
  action: string;
  targetId?: string;
  details?: string;
  ipAddress?: string;
}) {
  db.prepare(`
    INSERT INTO admin_audit_logs (id, admin_id, admin_email, action, target_id, details, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    params.adminId,
    params.adminEmail,
    params.action,
    params.targetId || null,
    params.details || null,
    params.ipAddress || null,
    Date.now()
  );
}

// Middleware: Authenticate request via Bearer token or query parameter (for SSE)
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;

  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (queryToken) {
    token = queryToken.trim();
  }

  if (!token) {
    // Explicit guest/demo access only when explicitly requested
    if (req.query.demo === 'true') {
      const defaultTenant = db.prepare("SELECT id FROM tenants WHERE slug = 'default-workspace'").get() as { id: string } | undefined;
      if (defaultTenant) {
        req.user = {
          id: 'user_default',
          email: 'demo@whatchat.online',
          name: 'Demo Workspace',
          role: 'tenant_owner',
          tenantId: defaultTenant.id
        };
        req.tenantId = defaultTenant.id;
        return next();
      }
    }

    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session token.' });
  }

  req.user = payload;
  if (payload.tenantId) {
    req.tenantId = payload.tenantId;
  }
  next();
}

// Middleware: Strict Super Admin Authorization
export function requireSuperAdminAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Super Admin credentials required.' });
  }
  const token = authHeader.substring(7).trim();
  const payload = verifyAdminToken(token);
  if (!payload || payload.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Access denied: Super Admin privilege required.' });
  }

  const user = db.prepare("SELECT id, email, role FROM users WHERE id = ? AND role = 'super_admin'").get(payload.id);
  if (!user) {
    return res.status(403).json({ success: false, error: 'Super Admin account no longer active.' });
  }

  req.user = payload;
  next();
}

// Middleware: Strict Tenant Access Check
export function requireTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.user.role === 'super_admin') {
    // Super admin can impersonate or inspect any tenant via header or query
    const targetTenantId = (req.headers['x-tenant-id'] as string) || (req.query.tenantId as string) || req.user.tenantId;
    if (targetTenantId) {
      req.tenantId = targetTenantId;
    }
    return next();
  }

  if (!req.user.tenantId) {
    return res.status(403).json({ success: false, error: 'No workspace associated with this user.' });
  }

  req.tenantId = req.user.tenantId;
  next();
}

// Middleware: Super Admin only
export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Access denied: Super Admin privilege required.' });
  }
  next();
}

// Middleware: Check and enforce tenant message quota before dispatching
export function checkMessageQuota(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const tenantId = req.tenantId;
  if (!tenantId) {
    return res.status(400).json({ success: false, error: 'Tenant context required' });
  }

  const tenant = db.prepare('SELECT subscription_status, monthly_message_quota, messages_used_current_cycle FROM tenants WHERE id = ?').get(tenantId) as {
    subscription_status: string;
    monthly_message_quota: number;
    messages_used_current_cycle: number;
  } | undefined;

  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant workspace not found' });
  }

  if (tenant.subscription_status === 'suspended' || tenant.subscription_status === 'canceled') {
    return res.status(402).json({
      success: false,
      error: 'Subscription is inactive or suspended. Please renew to resume messaging.'
    });
  }

  if (tenant.messages_used_current_cycle >= tenant.monthly_message_quota) {
    return res.status(402).json({
      success: false,
      error: `Monthly message quota limit reached (${tenant.messages_used_current_cycle} / ${tenant.monthly_message_quota}). Please upgrade your plan.`
    });
  }

  next();
}
