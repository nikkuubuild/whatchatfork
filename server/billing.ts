import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db.js';

export interface BillingConfig {
  razorpayKeyId: string;
  razorpayKeySecret: string;
  companyName: string;
  companyGstin: string;
  companyState: string; // e.g. 'MH' or 'DL'
  companyAddress: string;
}

export async function getBillingConfig(): Promise<BillingConfig> {
  const getVal = async (key: string, fallback: string = ''): Promise<string> => {
    const row = (await db.prepare('SELECT value FROM platform_config WHERE key = ?').get(key)) as { value: string } | undefined;
    return row ? row.value : fallback;
  };

  return {
    razorpayKeyId: await getVal('razorpay_key_id', process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_whatchat'),
    razorpayKeySecret: await getVal('razorpay_key_secret', process.env.RAZORPAY_KEY_SECRET || 'mock_secret_key_12345'),
    companyName: await getVal('company_legal_name', 'WhatChat Online Technologies Pvt Ltd'),
    companyGstin: await getVal('company_gstin', '27AABCW1234F1Z5'),
    companyState: await getVal('company_state', 'MH'),
    companyAddress: await getVal('company_address', 'Tech Park, Mumbai, Maharashtra - 400001')
  };
}

export async function saveBillingConfig(config: Partial<BillingConfig>) {
  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO platform_config (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  if (config.razorpayKeyId !== undefined) await upsert.run('razorpay_key_id', config.razorpayKeyId.trim(), now);
  if (config.razorpayKeySecret !== undefined) await upsert.run('razorpay_key_secret', config.razorpayKeySecret.trim(), now);
  if (config.companyName !== undefined) await upsert.run('company_legal_name', config.companyName.trim(), now);
  if (config.companyGstin !== undefined) await upsert.run('company_gstin', config.companyGstin.trim(), now);
  if (config.companyState !== undefined) await upsert.run('company_state', config.companyState.trim().toUpperCase(), now);
  if (config.companyAddress !== undefined) await upsert.run('company_address', config.companyAddress.trim(), now);
}

// Calculate GST Tax Breakup (18% GST: CGST+SGST for intra-state, IGST for inter-state)
export function calculateGstBreakup(subtotal: number, customerState?: string, companyState: string = 'MH') {
  const isIntraState = !customerState || customerState.trim().toUpperCase() === companyState.toUpperCase();
  const totalGst = Math.round(subtotal * 0.18 * 100) / 100;

  if (isIntraState) {
    const halfGst = Math.round((totalGst / 2) * 100) / 100;
    return {
      subtotal,
      cgstRate: 0.09,
      cgstAmount: halfGst,
      sgstRate: 0.09,
      sgstAmount: halfGst,
      igstRate: 0,
      igstAmount: 0,
      totalGst,
      totalAmount: Math.round((subtotal + totalGst) * 100) / 100
    };
  } else {
    return {
      subtotal,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: 0.18,
      igstAmount: totalGst,
      totalGst,
      totalAmount: Math.round((subtotal + totalGst) * 100) / 100
    };
  }
}

// Generate Next Sequential GST Tax Invoice Number (INV-YYYY-XXXX)
export async function generateNextInvoiceNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const countRecord = (await db.prepare('SELECT count(*) as count FROM invoices').get()) as { count: number | bigint | string } | undefined;
  const nextNum = (Number(countRecord?.count || 0) + 1).toString().padStart(4, '0');
  return `INV-${currentYear}-${nextNum}`;
}

// Validate Coupon Code
export async function validateCoupon(code: string) {
  const cleanCode = code.trim().toUpperCase();
  const coupon = (await db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(cleanCode)) as any;

  if (!coupon) {
    return { valid: false, error: 'Invalid or expired coupon code' };
  }
  if (coupon.uses_count >= coupon.max_uses) {
    return { valid: false, error: 'Coupon usage limit has been reached' };
  }

  return {
    valid: true,
    discountPercent: coupon.discount_percent,
    discountAmount: coupon.discount_amount
  };
}

// Create Razorpay or Simulated Order
export async function createSubscriptionOrder(params: {
  tenantId: string;
  planSlug: string;
  billingCycle: 'monthly' | 'yearly';
  couponCode?: string;
  customerState?: string;
  customerGstin?: string;
}) {
  const { tenantId, planSlug, billingCycle, couponCode, customerState, customerGstin } = params;

  const plan = (await db.prepare('SELECT * FROM plans WHERE slug = ?').get(planSlug)) as any;
  if (!plan) {
    throw new Error('Selected plan not found');
  }

  let basePrice = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
  let discountAmount = 0;

  if (couponCode) {
    const couponRes = await validateCoupon(couponCode);
    if (couponRes.valid) {
      if (couponRes.discountPercent) {
        discountAmount = Math.round((basePrice * couponRes.discountPercent) / 100);
      } else if (couponRes.discountAmount) {
        discountAmount = couponRes.discountAmount;
      }
    }
  }

  const config = await getBillingConfig();
  const subtotal = Math.max(0, basePrice - discountAmount);
  const tax = calculateGstBreakup(subtotal, customerState, config.companyState);

  // Generate order ID
  const orderId = `order_${uuidv4().replace(/-/g, '').substring(0, 14)}`;

  // If live Razorpay keys are configured (not dummy mock keys), invoke Razorpay API
  let razorpayOrder: any = null;
  const isLiveRazorpay = !config.razorpayKeyId.includes('mock') && config.razorpayKeySecret.length > 10;

  if (isLiveRazorpay) {
    try {
      const authHeader = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: Math.round(tax.totalAmount * 100), // in paise
          currency: 'INR',
          receipt: orderId,
          notes: {
            tenantId,
            planSlug,
            billingCycle,
            customerGstin: customerGstin || ''
          }
        })
      });

      if (rzpRes.ok) {
        razorpayOrder = await rzpRes.json();
      }
    } catch (err) {
      console.warn('[Razorpay Order API Warning]:', err);
    }
  }

  const effectiveOrderId = razorpayOrder?.id || orderId;

  return {
    success: true,
    orderId: effectiveOrderId,
    amountPaise: Math.round(tax.totalAmount * 100),
    amountRupees: tax.totalAmount,
    currency: 'INR',
    planName: plan.name,
    billingCycle,
    pricingBreakup: {
      basePrice,
      discountAmount,
      ...tax
    },
    razorpayKeyId: config.razorpayKeyId,
    isTestMode: !isLiveRazorpay
  };
}

// Verify Payment & Complete Activation
export async function verifyAndActivateSubscription(params: {
  tenantId: string;
  orderId: string;
  paymentId: string;
  signature?: string;
  planSlug: string;
  billingCycle: 'monthly' | 'yearly';
  customerBusinessName?: string;
  customerGstin?: string;
  customerState?: string;
  customerAddress?: string;
}) {
  const {
    tenantId,
    orderId,
    paymentId,
    signature,
    planSlug,
    billingCycle,
    customerBusinessName,
    customerGstin,
    customerState,
    customerAddress
  } = params;

  const config = await getBillingConfig();
  const plan = (await db.prepare('SELECT * FROM plans WHERE slug = ?').get(planSlug)) as any;
  if (!plan) {
    throw new Error('Plan not found for activation');
  }

  const isLiveRazorpay = !config.razorpayKeyId.includes('mock') && config.razorpayKeySecret.length > 10;

  // Verify HMAC signature if live Razorpay
  if (isLiveRazorpay && signature) {
    const expectedSig = crypto
      .createHmac('sha256', config.razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSig !== signature) {
      throw new Error('Payment signature verification failed. Untrusted callback.');
    }
  }

  const basePrice = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
  const tax = calculateGstBreakup(basePrice, customerState, config.companyState);
  const invoiceNumber = await generateNextInvoiceNumber();
  const now = Date.now();
  const paymentRecordId = uuidv4();
  const invoiceRecordId = uuidv4();

  // 1. Record Payment
  await db.prepare(`
    INSERT INTO payments (id, tenant_id, order_id, payment_id, amount, currency, status, method, gst_amount, gstin, invoice_number, plan_id, billing_cycle, created_at)
    VALUES (?, ?, ?, ?, ?, 'INR', 'captured', 'upi', ?, ?, ?, ?, ?, ?)
  `).run(
    paymentRecordId,
    tenantId,
    orderId,
    paymentId,
    tax.totalAmount,
    tax.totalGst,
    customerGstin || null,
    invoiceNumber,
    plan.id,
    billingCycle,
    now
  );

  // 2. Generate GST Tax Invoice
  await db.prepare(`
    INSERT INTO invoices (id, invoice_number, tenant_id, payment_id, customer_business_name, customer_gstin, customer_address, customer_state, hsn_sac, subtotal, cgst_rate, cgst_amount, sgst_rate, sgst_amount, igst_rate, igst_amount, total_amount, currency, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '998313', ?, ?, ?, ?, ?, ?, ?, ?, 'INR', 'paid', ?)
  `).run(
    invoiceRecordId,
    invoiceNumber,
    tenantId,
    paymentRecordId,
    customerBusinessName || 'Valued Business Customer',
    customerGstin || null,
    customerAddress || null,
    customerState || config.companyState,
    tax.subtotal,
    tax.cgstRate,
    tax.cgstAmount,
    tax.sgstRate,
    tax.sgstAmount,
    tax.igstRate,
    tax.igstAmount,
    tax.totalAmount,
    now
  );

  // 3. Activate Plan & Quota for Tenant
  await db.prepare(`
    UPDATE tenants
    SET plan_id = ?,
        subscription_status = 'active',
        monthly_message_quota = ?,
        messages_used_current_cycle = 0,
        legal_business_name = COALESCE(?, legal_business_name),
        gstin = COALESCE(?, gstin),
        state = COALESCE(?, state)
    WHERE id = ?
  `).run(
    plan.id,
    plan.monthly_message_quota,
    customerBusinessName || null,
    customerGstin || null,
    customerState || null,
    tenantId
  );

  return {
    success: true,
    invoiceNumber,
    planName: plan.name,
    monthlyQuota: plan.monthly_message_quota,
    totalPaid: tax.totalAmount,
    currency: 'INR'
  };
}
