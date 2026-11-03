import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Building2,
  Save,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Key,
  Search,
  Lock,
  LogOut,
  History,
  TrendingUp,
  CreditCard,
  Layers,
  IndianRupee,
  Activity,
  Users,
  Check
} from 'lucide-react';

interface SuperAdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  token?: string;
}

export const SuperAdminPanel: React.FC<SuperAdminPanelProps> = ({ isOpen, onClose }) => {
  const [adminToken, setAdminToken] = useState<string>(localStorage.getItem('whatchat_admin_token') || '');
  const [adminUser, setAdminUser] = useState<any>(null);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'analytics' | 'tenants' | 'plans' | 'billing' | 'meta' | 'audit'>('analytics');

  // Analytics state
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Platform Meta Config state
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [configId, setConfigId] = useState('');
  const [partnerSolutionId, setPartnerSolutionId] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('whatscloud_token');
  const [coexistenceEnabled, setCoexistenceEnabled] = useState(true);
  const [graphVersion, setGraphVersion] = useState('v21.0');

  // Billing Config state
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyGstin, setCompanyGstin] = useState('');
  const [companyState, setCompanyState] = useState('MH');
  const [companyAddress, setCompanyAddress] = useState('');

  // Plans Management state
  const [plans, setPlans] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tenants list state
  const [tenants, setTenants] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Check admin session on mount / token change
  useEffect(() => {
    if (!isOpen) return;

    if (adminToken) {
      fetch('/api/admin/auth/me', {
        headers: { Authorization: `Bearer ${adminToken}` }
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.admin) {
            setAdminUser(data.admin);
            fetchAllData(adminToken);
          } else {
            handleLogout();
          }
        })
        .catch(() => handleLogout());
    }
  }, [isOpen, adminToken]);

  const fetchAllData = (token: string) => {
    fetchAnalytics(token);
    fetchConfig(token);
    fetchBillingConfig(token);
    fetchPlans(token);
    fetchTenants(token);
    fetchAuditLogs(token);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();

      if (data.success && data.token) {
        setAdminToken(data.token);
        setAdminUser(data.admin);
        localStorage.setItem('whatchat_admin_token', data.token);
        fetchAllData(data.token);
      } else {
        setLoginError(data.error || 'Invalid admin credentials');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Network error logging in');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setAdminToken('');
    setAdminUser(null);
    localStorage.removeItem('whatchat_admin_token');
  };

  const fetchAnalytics = async (token: string) => {
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.analytics) {
        setAnalytics(data.analytics);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const fetchConfig = async (token: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.config) {
        setAppId(data.config.appId || '');
        setAppSecret(data.config.appSecret || '');
        setConfigId(data.config.configId || '');
        setPartnerSolutionId(data.config.partnerSolutionId || '');
        setWebhookVerifyToken(data.config.webhookVerifyToken || 'whatscloud_token');
        setCoexistenceEnabled(Boolean(data.config.coexistenceEnabled));
        setGraphVersion(data.config.graphVersion || 'v21.0');
      }
    } catch (err) {
      console.warn('Failed to fetch config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBillingConfig = async (token: string) => {
    try {
      const res = await fetch('/api/admin/billing/config', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.config) {
        setRazorpayKeyId(data.config.razorpayKeyId || '');
        setRazorpayKeySecret(data.config.razorpayKeySecret || '');
        setCompanyName(data.config.companyName || '');
        setCompanyGstin(data.config.companyGstin || '');
        setCompanyState(data.config.companyState || 'MH');
        setCompanyAddress(data.config.companyAddress || '');
      }
    } catch {
      // silent
    }
  };

  const fetchPlans = async (token: string) => {
    try {
      const res = await fetch('/api/admin/plans', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.plans) {
        setPlans(data.plans);
      }
    } catch {
      // silent
    }
  };

  const fetchTenants = async (token: string) => {
    try {
      const res = await fetch('/api/admin/tenants', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.tenants) {
        setTenants(data.tenants);
      }
    } catch {
      // silent
    }
  };

  const fetchAuditLogs = async (token: string) => {
    try {
      const res = await fetch('/api/admin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.logs) {
        setAuditLogs(data.logs);
      }
    } catch {
      // silent
    }
  };

  const handleSaveMetaConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          appId,
          appSecret,
          configId,
          partnerSolutionId,
          webhookVerifyToken,
          coexistenceEnabled,
          graphVersion
        })
      });

      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        fetchAuditLogs(adminToken);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setErrorMessage(data.error || 'Failed to update platform settings');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBillingConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/billing/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          razorpayKeyId,
          razorpayKeySecret,
          companyName,
          companyGstin,
          companyState,
          companyAddress
        })
      });

      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        fetchAuditLogs(adminToken);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setErrorMessage(data.error || 'Failed to update billing config');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error saving billing config');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePlan = async (planId: string, updates: any) => {
    try {
      const res = await fetch(`/api/admin/plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        fetchPlans(adminToken);
        fetchAnalytics(adminToken);
      }
    } catch {
      alert('Failed to update plan');
    }
  };

  const handleToggleTenantStatus = async (tenantId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();
      if (data.success) {
        setTenants((prev) =>
          prev.map((t) => (t.id === tenantId ? { ...t, subscription_status: nextStatus } : t))
        );
        fetchAuditLogs(adminToken);
      }
    } catch (err) {
      console.warn('Failed to update tenant status:', err);
    }
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[92vh]">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Super Admin Console
                </h2>
                <span className="text-[10px] bg-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded-full border border-purple-500/30 uppercase">
                  Indian SaaS Gate
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Business intelligence analytics, Indian billing, plans, and Meta platform administration.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {adminUser && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* LOGIN GATE */}
        {!adminUser ? (
          <div className="p-8 flex flex-col items-center justify-center max-w-md mx-auto w-full my-auto space-y-6">
            <div className="w-14 h-14 rounded-3xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
              <Lock className="w-7 h-7" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">Super Admin Access Wall</h3>
              <p className="text-xs text-slate-400">
                Enter your platform super admin credentials to access system management.
              </p>
            </div>

            {loginError && (
              <div className="w-full p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="w-full space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Super Admin Email</label>
                <input
                  type="email"
                  required
                  placeholder="admin@whatchat.online"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Master Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                />
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {isLoggingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                <span>Authenticate Session</span>
              </button>
            </form>
          </div>
        ) : (
          /* AUTHENTICATED CONSOLE */
          <>
            {/* Tab Navigation */}
            <div className="flex border-b border-slate-800 px-3 sm:px-6 pt-2 bg-slate-950/40 gap-2 sm:gap-4 text-xs font-semibold overflow-x-auto whitespace-nowrap scrollbar-none">
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-1.5 pb-2.5 sm:pb-3 border-b-2 shrink-0 transition-all ${
                  activeTab === 'analytics'
                    ? 'border-purple-400 text-purple-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>BI Analytics</span>
              </button>
              <button
                onClick={() => setActiveTab('tenants')}
                className={`flex items-center gap-1.5 pb-2.5 sm:pb-3 border-b-2 shrink-0 transition-all ${
                  activeTab === 'tenants'
                    ? 'border-purple-400 text-purple-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Tenants ({tenants.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('plans')}
                className={`flex items-center gap-1.5 pb-2.5 sm:pb-3 border-b-2 shrink-0 transition-all ${
                  activeTab === 'plans'
                    ? 'border-purple-400 text-purple-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Plans & Pricing</span>
              </button>
              <button
                onClick={() => setActiveTab('billing')}
                className={`flex items-center gap-1.5 pb-2.5 sm:pb-3 border-b-2 shrink-0 transition-all ${
                  activeTab === 'billing'
                    ? 'border-purple-400 text-purple-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Razorpay & GST</span>
              </button>
              <button
                onClick={() => setActiveTab('meta')}
                className={`flex items-center gap-1.5 pb-2.5 sm:pb-3 border-b-2 shrink-0 transition-all ${
                  activeTab === 'meta'
                    ? 'border-purple-400 text-purple-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-4 h-4" />
                <span>Platform Meta App</span>
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-1.5 pb-2.5 sm:pb-3 border-b-2 shrink-0 transition-all ${
                  activeTab === 'audit'
                    ? 'border-purple-400 text-purple-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="w-4 h-4" />
                <span>Audit Logs</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-3 sm:p-6 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
              {errorMessage && (
                <div className="p-3 sm:p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-xs text-red-400 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 sm:p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-xs text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Configuration successfully saved and synced!</span>
                </div>
              )}

              {/* TAB 1: BUSINESS INTELLIGENCE ANALYTICS */}
              {activeTab === 'analytics' && analytics && (
                <div className="space-y-4 sm:space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Monthly Recurring (MRR)</span>
                      <p className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">₹{analytics.mrr.toLocaleString()}</p>
                      <span className="text-[10px] text-slate-500 font-medium">ARR: ₹{analytics.arr.toLocaleString()}</span>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Tenants</span>
                      <p className="text-xl sm:text-2xl font-black text-white font-mono">{analytics.activeSubscribers}</p>
                      <span className="text-[10px] text-slate-500 font-medium">Total Registered: {analytics.totalTenants}</span>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Captured Revenue</span>
                      <p className="text-xl sm:text-2xl font-black text-teal-400 font-mono">₹{analytics.totalRevenue.toFixed(2)}</p>
                      <span className="text-[10px] text-slate-500 font-medium">{analytics.paymentsCount} transactions</span>
                    </div>

                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Messages Sent</span>
                      <p className="text-xl sm:text-2xl font-black text-purple-400 font-mono">{analytics.totalMessages}</p>
                      <span className="text-[10px] text-slate-500 font-medium">SSE & Cloud API routed</span>
                    </div>
                  </div>

                  {/* Plan Distribution & Health */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 sm:space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Subscription Plan Distribution
                      </h4>
                      <div className="space-y-3">
                        {analytics.planDistribution?.map((p: any) => (
                          <div key={p.slug} className="space-y-1 text-xs">
                            <div className="flex justify-between font-semibold">
                              <span className="text-slate-300">{p.name} (₹{p.price_monthly}/mo)</span>
                              <span className="text-white font-mono">{p.subscriber_count} subscriber(s)</span>
                            </div>
                            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-purple-500 h-full rounded-full"
                                style={{
                                  width: `${Math.max(5, (p.subscriber_count / Math.max(1, analytics.activeSubscribers)) * 100)}%`
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 sm:space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        WhatsApp Channels & Webhook Health
                      </h4>
                      <div className="space-y-2.5 text-xs">
                        <div className="flex justify-between p-2.5 sm:p-3 bg-slate-900 rounded-xl border border-slate-800">
                          <span className="text-slate-400">Total WhatsApp Numbers Connected</span>
                          <span className="text-white font-mono font-bold">{analytics.totalChannels}</span>
                        </div>
                        <div className="flex justify-between p-2.5 sm:p-3 bg-slate-900 rounded-xl border border-slate-800">
                          <span className="text-slate-400">Active Channels</span>
                          <span className="text-emerald-400 font-mono font-bold">{analytics.activeChannels}</span>
                        </div>
                        <div className="flex justify-between p-2.5 sm:p-3 bg-slate-900 rounded-xl border border-slate-800">
                          <span className="text-slate-400">Webhook Failures / Dead-Letters</span>
                          <span className="text-slate-400 font-mono font-bold">{analytics.failedWebhooks}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Payments Ledger */}
                  {analytics.recentPayments?.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent Indian Payments Ledger</h4>
                      <div className="border border-slate-800 rounded-2xl overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[550px]">
                          <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                            <tr>
                              <th className="p-3">Invoice #</th>
                              <th className="p-3">Tenant</th>
                              <th className="p-3">Amount</th>
                              <th className="p-3">Method</th>
                              <th className="p-3">Cycle</th>
                              <th className="p-3">Status</th>
                              <th className="p-3">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 text-slate-300">
                            {analytics.recentPayments.map((p: any) => (
                              <tr key={p.id}>
                                <td className="p-3 font-mono font-bold text-white">{p.invoice_number || '—'}</td>
                                <td className="p-3 text-slate-200">{p.tenant_name || p.tenant_id}</td>
                                <td className="p-3 font-mono font-bold text-emerald-400">₹{p.amount.toFixed(2)}</td>
                                <td className="p-3 uppercase text-[11px] font-semibold">{p.method}</td>
                                <td className="p-3 capitalize">{p.billing_cycle}</td>
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">
                                    {p.status}
                                  </span>
                                </td>
                                <td className="p-3 text-slate-400">{new Date(p.created_at).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: TENANTS MANAGEMENT */}
              {activeTab === 'tenants' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="relative w-72">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search tenants by name or slug..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="border border-slate-800 rounded-2xl overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[550px]">
                      <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="p-3.5">Business Name</th>
                          <th className="p-3.5">Plan</th>
                          <th className="p-3.5">Quota Usage</th>
                          <th className="p-3.5">Channels</th>
                          <th className="p-3.5">Status</th>
                          <th className="p-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {filteredTenants.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-800/40">
                            <td className="p-3.5">
                              <p className="font-bold text-white">{t.name}</p>
                              <p className="text-[11px] text-slate-500 font-mono">{t.slug}</p>
                            </td>
                            <td className="p-3.5">
                              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold uppercase">
                                {t.plan_name || 'Starter'}
                              </span>
                            </td>
                            <td className="p-3.5 font-mono">
                              {(t.messages_used_current_cycle || 0).toLocaleString()} / {(t.monthly_message_quota || 0).toLocaleString()}
                            </td>
                            <td className="p-3.5 font-mono">{t.channel_count || 0}</td>
                            <td className="p-3.5">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  t.subscription_status === 'active'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                              >
                                {t.subscription_status}
                              </span>
                            </td>
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() => handleToggleTenantStatus(t.id, t.subscription_status)}
                                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                  t.subscription_status === 'active'
                                    ? 'bg-red-950/40 text-red-400 hover:bg-red-900/50'
                                    : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50'
                                }`}
                              >
                                {t.subscription_status === 'active' ? 'Suspend' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: DYNAMIC PLANS & PRICING */}
              {activeTab === 'plans' && (
                <div className="space-y-4">
                  <div className="pb-2">
                    <h3 className="text-sm font-bold text-white">Configurable Indian Subscription Plans</h3>
                    <p className="text-xs text-slate-400">
                      Manage monthly/yearly pricing (INR) and feature quotas directly without altering code.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {plans.map((p) => (
                      <div key={p.id} className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="font-bold text-base text-white">{p.name}</span>
                          <span className="font-mono text-purple-400 text-xs font-semibold">{p.slug}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-slate-400 block mb-1">Monthly Price (INR)</label>
                            <input
                              type="number"
                              defaultValue={p.price_monthly}
                              onBlur={(e) => handleUpdatePlan(p.id, { priceMonthly: parseFloat(e.target.value) })}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-slate-400 block mb-1">Yearly Price (INR)</label>
                            <input
                              type="number"
                              defaultValue={p.price_yearly}
                              onBlur={(e) => handleUpdatePlan(p.id, { priceYearly: parseFloat(e.target.value) })}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-slate-400 block mb-1">Monthly Message Quota</label>
                            <input
                              type="number"
                              defaultValue={p.monthly_message_quota}
                              onBlur={(e) => handleUpdatePlan(p.id, { monthlyQuota: parseInt(e.target.value, 10) })}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                            />
                          </div>

                          <div>
                            <label className="text-slate-400 block mb-1">Max Team Seats</label>
                            <input
                              type="number"
                              defaultValue={p.max_team_members}
                              onBlur={(e) => handleUpdatePlan(p.id, { maxMembers: parseInt(e.target.value, 10) })}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <input
                            type="checkbox"
                            id={`coex_${p.id}`}
                            defaultChecked={Boolean(p.coexistence_allowed)}
                            onChange={(e) => handleUpdatePlan(p.id, { coexistenceAllowed: e.target.checked })}
                            className="rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500"
                          />
                          <label htmlFor={`coex_${p.id}`} className="text-slate-300">
                            Allow WhatsApp Business Coexistence
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: RAZORPAY & GST SETTINGS */}
              {activeTab === 'billing' && (
                <form onSubmit={handleSaveBillingConfig} className="space-y-4 max-w-2xl text-xs">
                  <div className="pb-2">
                    <h3 className="text-sm font-bold text-white">Razorpay Payment Gateway & Indian GST Entity</h3>
                    <p className="text-slate-400">
                      Configure your Razorpay API keys and invoicing entity details for 18% GST tax invoice generation.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Razorpay Key ID</label>
                      <input
                        type="text"
                        placeholder="rzp_live_..."
                        value={razorpayKeyId}
                        onChange={(e) => setRazorpayKeyId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Razorpay Key Secret</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={razorpayKeySecret}
                        onChange={(e) => setRazorpayKeySecret(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-slate-300 font-semibold mb-1">Supplier Company Legal Name</label>
                      <input
                        type="text"
                        placeholder="WhatChat Online Technologies Pvt Ltd"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Supplier GSTIN (15 Digits)</label>
                      <input
                        type="text"
                        placeholder="27AABCW1234F1Z5"
                        value={companyGstin}
                        onChange={(e) => setCompanyGstin(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Home State (Intra-state CGST+SGST)</label>
                      <input
                        type="text"
                        placeholder="MH"
                        value={companyState}
                        onChange={(e) => setCompanyState(e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-slate-300 font-semibold mb-1">Supplier Registered Address</label>
                      <input
                        type="text"
                        placeholder="Tech Park, Mumbai, Maharashtra - 400001"
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-colors flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSaving ? 'Saving...' : 'Save Razorpay & GST Settings'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 5: PLATFORM META APP CONFIG */}
              {activeTab === 'meta' && (
                <form onSubmit={handleSaveMetaConfig} className="space-y-4 max-w-2xl text-xs">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <p className="font-bold text-white">Shared Meta App for 1-Click Embedded Signup</p>
                    <p className="text-slate-400">
                      Used by customer tenants to link WhatsApp Business accounts via Facebook Login.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Meta App ID</label>
                      <input
                        type="text"
                        placeholder="e.g. 192847291048291"
                        value={appId}
                        onChange={(e) => setAppId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Meta App Secret</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={appSecret}
                        onChange={(e) => setAppSecret(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Configuration ID (FBE / Signup)</label>
                      <input
                        type="text"
                        placeholder="e.g. 849204910284"
                        value={configId}
                        onChange={(e) => setConfigId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Partner Solution ID (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. sol_123456"
                        value={partnerSolutionId}
                        onChange={(e) => setPartnerSolutionId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-colors flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isSaving ? 'Saving...' : 'Save Meta Platform Settings'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 6: AUDIT LOGS */}
              {activeTab === 'audit' && (
                <div className="border border-slate-800 rounded-2xl overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[550px]">
                    <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-3.5">Action</th>
                        <th className="p-3.5">Admin</th>
                        <th className="p-3.5">Details</th>
                        <th className="p-3.5">IP Address</th>
                        <th className="p-3.5">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="p-3.5 font-bold text-white font-mono">{log.action}</td>
                          <td className="p-3.5 text-slate-400">{log.admin_email}</td>
                          <td className="p-3.5">{log.details || '—'}</td>
                          <td className="p-3.5 font-mono text-slate-400">{log.ip_address || '127.0.0.1'}</td>
                          <td className="p-3.5 text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
