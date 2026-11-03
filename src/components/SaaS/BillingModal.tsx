import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  FileText,
  Building,
  Check,
  Zap,
  Tag,
  ShieldCheck,
  Download,
  AlertCircle,
  ExternalLink,
  Percent
} from 'lucide-react';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  token?: string;
  tenant?: any;
  onPlanUpdated?: (updatedTenant: any) => void;
}

export const BillingModal: React.FC<BillingModalProps> = ({
  isOpen,
  onClose,
  token,
  tenant,
  onPlanUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'invoices' | 'kyc'>('plans');
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string>('growth');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [couponCode, setCouponCode] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invoices state
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Business Profile / KYC State
  const [kycData, setKycData] = useState({
    legalBusinessName: '',
    businessType: 'Private Limited',
    gstin: '',
    pan: '',
    registeredAddress: '',
    state: 'MH',
    pincode: '',
    billingContactName: '',
    billingContactPhone: '',
    billingContactEmail: ''
  });
  const [kycSuccess, setKycSuccess] = useState<string | null>(null);

  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // Fetch plans on open
  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/plans')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.plans) {
          setPlans(d.plans);
        }
      })
      .catch(() => {});

    // Fetch tenant profile
    fetch('/api/tenant/profile', { headers: authHeader as any })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.tenant) {
          setKycData({
            legalBusinessName: d.tenant.legal_business_name || d.tenant.name || '',
            businessType: d.tenant.business_type || 'Private Limited',
            gstin: d.tenant.gstin || '',
            pan: d.tenant.pan || '',
            registeredAddress: d.tenant.registered_address || '',
            state: d.tenant.state || 'MH',
            pincode: d.tenant.pincode || '',
            billingContactName: d.tenant.billing_contact_name || '',
            billingContactPhone: d.tenant.billing_contact_phone || '',
            billingContactEmail: d.tenant.billing_contact_email || ''
          });
        }
      })
      .catch(() => {});

    // Fetch invoices
    fetch('/api/billing/invoices', { headers: authHeader as any })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.invoices) {
          setInvoices(d.invoices);
        }
      })
      .catch(() => {});
  }, [isOpen, token]);

  if (!isOpen) return null;

  const currentPlan = plans.find((p) => p.slug === selectedPlanSlug) || plans.find((p) => p.slug === 'growth');
  const basePrice = currentPlan ? (billingCycle === 'yearly' ? currentPlan.price_yearly : currentPlan.price_monthly) : 2499;

  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.discountPercent) {
      discountAmount = Math.round((basePrice * appliedCoupon.discountPercent) / 100);
    } else if (appliedCoupon.discountAmount) {
      discountAmount = appliedCoupon.discountAmount;
    }
  }

  const subtotal = Math.max(0, basePrice - discountAmount);
  const isIntraState = !kycData.state || kycData.state.toUpperCase() === 'MH';
  const totalGst = Math.round(subtotal * 0.18 * 100) / 100;
  const halfGst = Math.round((totalGst / 2) * 100) / 100;
  const totalPayable = Math.round((subtotal + totalGst) * 100) / 100;

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError(null);
    try {
      const res = await fetch('/api/billing/validate-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ code: couponCode })
      });
      const data = await res.json();
      if (data.success && data.valid) {
        setAppliedCoupon(data);
      } else {
        setCouponError(data.error || 'Invalid coupon code');
        setAppliedCoupon(null);
      }
    } catch {
      setCouponError('Failed to validate coupon');
    }
  };

  const handleCheckoutAndActivate = async () => {
    setIsProcessing(true);
    setPaymentMessage(null);

    try {
      // 1. Create order
      const orderRes = await fetch('/api/billing/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          planSlug: selectedPlanSlug,
          billingCycle,
          couponCode: appliedCoupon ? couponCode : undefined
        })
      });
      const orderData = await orderRes.json();

      if (!orderData.success) {
        throw new Error(orderData.error || 'Could not initiate checkout');
      }

      // 2. Complete / Verify payment
      const verifyRes = await fetch('/api/billing/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          orderId: orderData.orderId,
          paymentId: `pay_rzp_${Date.now()}`,
          planSlug: selectedPlanSlug,
          billingCycle
        })
      });
      const verifyData = await verifyRes.json();

      if (verifyData.success) {
        setPaymentMessage({
          type: 'success',
          text: `Payment successful! Activated ${verifyData.planName} plan with ${verifyData.monthlyQuota.toLocaleString()} monthly quota. Tax Invoice ${verifyData.invoiceNumber} generated.`
        });

        // Refresh invoices
        fetch('/api/billing/invoices', { headers: authHeader as any })
          .then((r) => r.json())
          .then((d) => d.success && setInvoices(d.invoices));

        if (onPlanUpdated) {
          onPlanUpdated({
            plan: verifyData.planName,
            monthlyQuota: verifyData.monthlyQuota
          });
        }
      } else {
        throw new Error(verifyData.error || 'Payment verification failed');
      }
    } catch (err: any) {
      setPaymentMessage({
        type: 'error',
        text: err?.message || 'Payment processing failed. Please try again.'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycSuccess(null);
    try {
      const res = await fetch('/api/tenant/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify(kycData)
      });
      const data = await res.json();
      if (data.success) {
        setKycSuccess('Business profile and GSTIN updated successfully.');
      } else {
        alert(data.error || 'Failed to save KYC');
      }
    } catch {
      alert('Network error while saving KYC');
    }
  };

  const indianStates = [
    { code: 'MH', name: 'Maharashtra (Home State - Intra)' },
    { code: 'DL', name: 'Delhi' },
    { code: 'KA', name: 'Karnataka' },
    { code: 'TN', name: 'Tamil Nadu' },
    { code: 'GJ', name: 'Gujarat' },
    { code: 'UP', name: 'Uttar Pradesh' },
    { code: 'TG', name: 'Telangana' },
    { code: 'WB', name: 'West Bengal' },
    { code: 'HR', name: 'Haryana' },
    { code: 'RJ', name: 'Rajasthan' },
    { code: 'KL', name: 'Kerala' },
    { code: 'MP', name: 'Madhya Pradesh' },
    { code: 'PB', name: 'Punjab' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[96vh] sm:max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span>Subscription & GST Billing</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  INR / Razorpay
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Manage your plan, GST tax invoices (HSN 998313), and business compliance details.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Quota Status Banner */}
        {tenant && (
          <div className="px-4 sm:px-6 py-2.5 bg-slate-800/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 sm:gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Workspace:</span>
              <strong className="text-white font-semibold truncate max-w-[150px] sm:max-w-none">{tenant.name || 'Workspace'}</strong>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                {tenant.plan || 'Starter'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 hidden sm:inline">Quota:</span>
                <span className="text-emerald-400 font-bold">
                  {(tenant.messagesUsed || 0).toLocaleString()} / {(tenant.monthlyQuota || 5000).toLocaleString()} msgs
                </span>
              </div>
              <div className="w-16 sm:w-24 bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (((tenant.messagesUsed || 0) / (tenant.monthlyQuota || 5000)) * 100))}%`
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-4 sm:px-6 gap-4 sm:gap-6 text-xs font-semibold bg-slate-900/60 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab('plans')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'plans'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Upgrade Plans & Pricing</span>
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'invoices'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>GST Tax Invoices ({invoices.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('kyc')}
            className={`py-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'kyc'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Business Profile & GSTIN</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {paymentMessage && (
            <div
              className={`p-4 rounded-2xl text-xs flex items-center gap-3 ${
                paymentMessage.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{paymentMessage.text}</span>
            </div>
          )}

          {/* TAB 1: PLANS & PRICING */}
          {activeTab === 'plans' && (
            <div className="space-y-6">
              {/* Billing Cycle Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2">
                <div>
                  <h3 className="text-sm font-bold text-white">Select a Plan Tailored to Your Volume</h3>
                  <p className="text-xs text-slate-400">All plans include WhatsApp Coexistence and multi-seat team inbox.</p>
                </div>
                <div className="inline-flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold self-start sm:self-auto">
                  <button
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      billingCycle === 'monthly' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBillingCycle('yearly')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      billingCycle === 'yearly' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
                    }`}
                  >
                    Annual (Save 17%)
                  </button>
                </div>
              </div>

              {/* Plans Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.filter((p) => p.slug !== 'enterprise').map((p) => {
                  const isSelected = selectedPlanSlug === p.slug;
                  const price = billingCycle === 'yearly' ? p.price_yearly : p.price_monthly;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPlanSlug(p.slug)}
                      className={`p-5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-slate-800/90 border-emerald-500 ring-2 ring-emerald-500/20'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-base">{p.name}</span>
                          {p.slug === 'growth' && (
                            <span className="text-[10px] bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 rounded-full uppercase">
                              Recommended
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-white">₹{price.toLocaleString()}</span>
                          <span className="text-slate-400 text-xs">/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                        </div>
                        <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{p.monthly_message_quota.toLocaleString()} msgs / month</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Up to {p.max_team_members} team agent seats</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{p.max_whatsapp_numbers} WhatsApp Number(s)</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WhatsApp Coexistence enabled</span>
                          </li>
                        </ul>
                      </div>

                      <div className="pt-4">
                        <div
                          className={`w-full py-2 rounded-xl text-center text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Select Plan'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Order Summary & GST Calculation Box */}
              <div className="p-3.5 sm:p-5 bg-slate-950 border border-slate-800 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Coupon & Localization</h4>
                  
                  {/* Coupon Code Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300">Discount Coupon Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. WELCOME50 or STARTUP20"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white uppercase focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCoupon}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold rounded-xl text-xs transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                    {couponError && <p className="text-[11px] text-red-400">{couponError}</p>}
                    {appliedCoupon && (
                      <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                        <Check className="w-3.5 h-3.5" />
                        Coupon applied: {appliedCoupon.discountPercent ? `${appliedCoupon.discountPercent}% OFF` : `₹${appliedCoupon.discountAmount} OFF`}
                      </p>
                    )}
                  </div>

                  {/* Customer State Selector for GST */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-300">Place of Supply (State for GST)</label>
                    <select
                      value={kycData.state}
                      onChange={(e) => setKycData((prev) => ({ ...prev, state: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {indianStates.map((s) => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Tax Breakdown */}
                <div className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800 text-xs">
                  <h4 className="font-bold text-white text-xs border-b border-slate-800 pb-2 flex items-center justify-between">
                    <span>Tax Invoice Price Breakdown</span>
                    <span className="text-[10px] text-slate-400 font-mono">SAC 998313</span>
                  </h4>
                  <div className="flex justify-between text-slate-400">
                    <span>Base Subscription ({currentPlan?.name})</span>
                    <span>₹{basePrice.toLocaleString()}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Promo Discount</span>
                      <span>- ₹{discountAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-300 font-semibold pt-1 border-t border-slate-800">
                    <span>Taxable Subtotal</span>
                    <span>₹{subtotal.toLocaleString()}</span>
                  </div>

                  {isIntraState ? (
                    <>
                      <div className="flex justify-between text-slate-400">
                        <span>CGST (9%)</span>
                        <span>₹{halfGst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>SGST (9%)</span>
                        <span>₹{halfGst.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-slate-400">
                      <span>IGST (18% Inter-state)</span>
                      <span>₹{totalGst.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-black text-white pt-2 border-t border-slate-700">
                    <span>Total Payable (INR)</span>
                    <span className="text-emerald-400">₹{totalPayable.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={handleCheckoutAndActivate}
                    disabled={isProcessing}
                    className="w-full mt-3 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{isProcessing ? 'Processing via Razorpay...' : `Pay ₹${totalPayable.toFixed(2)} & Activate Plan`}</span>
                  </button>
                  <p className="text-[10px] text-center text-slate-500">
                    Secured by Razorpay. Includes GST tax invoice and instant WhatsApp quota allocation.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GST TAX INVOICES */}
          {activeTab === 'invoices' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">GST Tax Invoices Ledger</h3>
                  <p className="text-xs text-slate-400">Download GST-compliant tax invoices for input tax credit (ITC).</p>
                </div>
              </div>

              {invoices.length === 0 ? (
                <div className="p-12 text-center text-slate-500 bg-slate-950/40 rounded-2xl border border-slate-800">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No invoices generated yet. Upgrade your plan to receive your first tax invoice.</p>
                </div>
              ) : (
                <div className="border border-slate-800 rounded-2xl overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[550px]">
                    <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-3.5">Invoice #</th>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Subtotal</th>
                        <th className="p-3.5">GST (18%)</th>
                        <th className="p-3.5">Total Paid</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5 font-bold text-white font-mono">{inv.invoice_number}</td>
                          <td className="p-3.5 text-slate-400">{new Date(inv.created_at).toLocaleDateString()}</td>
                          <td className="p-3.5 font-mono">₹{inv.subtotal.toFixed(2)}</td>
                          <td className="p-3.5 font-mono">
                            ₹{(inv.cgst_amount + inv.sgst_amount + inv.igst_amount).toFixed(2)}
                          </td>
                          <td className="p-3.5 font-bold text-emerald-400 font-mono">₹{inv.total_amount.toFixed(2)}</td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                              {inv.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => setSelectedInvoice(inv)}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>View Invoice</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BUSINESS PROFILE & KYC */}
          {activeTab === 'kyc' && (
            <form onSubmit={handleSaveKyc} className="space-y-4 max-w-2xl">
              <div className="pb-2">
                <h3 className="text-sm font-bold text-white">Indian Business Profile & GSTIN Compliance</h3>
                <p className="text-xs text-slate-400">
                  Ensure your business details and GSTIN are accurate to receive valid GST tax invoices with Input Tax Credit (ITC).
                </p>
              </div>

              {kycSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>{kycSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Legal Entity / Company Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Technologies Pvt Ltd"
                    value={kycData.legalBusinessName}
                    onChange={(e) => setKycData({ ...kycData, legalBusinessName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Business Constitution</label>
                  <select
                    value={kycData.businessType}
                    onChange={(e) => setKycData({ ...kycData, businessType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="Private Limited">Private Limited Company</option>
                    <option value="Proprietorship">Sole Proprietorship</option>
                    <option value="Partnership">Partnership Firm</option>
                    <option value="LLP">Limited Liability Partnership (LLP)</option>
                    <option value="Public Limited">Public Limited Company</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">GSTIN (15 Digits)</label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder="e.g. 27ABCDE1234F1Z5"
                    value={kycData.gstin}
                    onChange={(e) => setKycData({ ...kycData, gstin: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Company PAN (10 Digits)</label>
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g. ABCDE1234F"
                    value={kycData.pan}
                    onChange={(e) => setKycData({ ...kycData, pan: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">Registered Business Address</label>
                  <input
                    type="text"
                    placeholder="Floor, Building, Tech Park, Street"
                    value={kycData.registeredAddress}
                    onChange={(e) => setKycData({ ...kycData, registeredAddress: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">State</label>
                  <select
                    value={kycData.state}
                    onChange={(e) => setKycData({ ...kycData, state: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {indianStates.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">PIN Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 400001"
                    value={kycData.pincode}
                    onChange={(e) => setKycData({ ...kycData, pincode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Billing Contact Name</label>
                  <input
                    type="text"
                    placeholder="Rajesh Sharma"
                    value={kycData.billingContactName}
                    onChange={(e) => setKycData({ ...kycData, billingContactName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Billing Contact Phone</label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={kycData.billingContactPhone}
                    onChange={(e) => setKycData({ ...kycData, billingContactPhone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Save Business KYC Details
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Invoice View Modal */}
        {selectedInvoice && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-white text-slate-900 rounded-3xl p-8 max-w-2xl w-full space-y-6 shadow-2xl font-sans">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900">TAX INVOICE</h3>
                  <p className="text-xs text-slate-500">Original for Recipient</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-sm text-emerald-700">{selectedInvoice.invoice_number}</span>
                  <p className="text-xs text-slate-500">{new Date(selectedInvoice.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 text-xs">
                <div>
                  <h5 className="font-bold text-slate-700 uppercase tracking-wider mb-1">Supplier</h5>
                  <p className="font-bold">WhatChat Online Technologies Pvt Ltd</p>
                  <p className="text-slate-600">Tech Park, Mumbai, Maharashtra - 400001</p>
                  <p className="text-slate-600 font-mono">GSTIN: 27AABCW1234F1Z5</p>
                  <p className="text-slate-600">State: Maharashtra (Code: 27)</p>
                </div>
                <div>
                  <h5 className="font-bold text-slate-700 uppercase tracking-wider mb-1">Customer / Billed To</h5>
                  <p className="font-bold">{selectedInvoice.customer_business_name}</p>
                  <p className="text-slate-600">{selectedInvoice.customer_address || 'Address on file'}</p>
                  <p className="text-slate-600 font-mono">
                    GSTIN: {selectedInvoice.customer_gstin || 'Unregistered / B2C'}
                  </p>
                  <p className="text-slate-600">State: {selectedInvoice.customer_state}</p>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-xs text-left border">
                <thead className="bg-slate-100 font-bold border-b">
                  <tr>
                    <th className="p-2">Description</th>
                    <th className="p-2 font-mono">HSN/SAC</th>
                    <th className="p-2 text-right">Taxable Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2">WhatChat WhatsApp SaaS Platform Cloud Subscription</td>
                    <td className="p-2 font-mono">998313</td>
                    <td className="p-2 text-right font-mono">₹{selectedInvoice.subtotal.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Tax Breakup */}
              <div className="text-xs space-y-1.5 max-w-xs ml-auto">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹{selectedInvoice.subtotal.toFixed(2)}</span>
                </div>
                {selectedInvoice.cgst_amount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>CGST (9%):</span>
                    <span className="font-mono">₹{selectedInvoice.cgst_amount.toFixed(2)}</span>
                  </div>
                )}
                {selectedInvoice.sgst_amount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>SGST (9%):</span>
                    <span className="font-mono">₹{selectedInvoice.sgst_amount.toFixed(2)}</span>
                  </div>
                )}
                {selectedInvoice.igst_amount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>IGST (18%):</span>
                    <span className="font-mono">₹{selectedInvoice.igst_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-slate-900 border-t pt-2">
                  <span>Total (INR):</span>
                  <span className="font-mono">₹{selectedInvoice.total_amount.toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-between items-center">
                <span className="text-[11px] text-slate-500">Reverse Charge: No | Computer Generated Invoice</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-colors"
                  >
                    Print Invoice
                  </button>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="px-4 py-2 bg-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-300 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
