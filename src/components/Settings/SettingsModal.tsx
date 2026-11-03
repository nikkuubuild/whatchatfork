import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  ExternalLink, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  Vibrate, 
  Trash2,
  HelpCircle,
  ShieldCheck,
  Zap,
  Headphones,
  FileText,
  Image as ImageIcon,
  Film,
  MapPin,
  Sliders,
  Globe,
  Radio,
  Sparkles,
  CreditCard,
  Users,
  Shield,
  LogOut,
  Building,
  ChevronRight,
  Eye,
  EyeOff,
  Activity,
  Server
} from 'lucide-react';
import { WhatsAppCredentials, QuickPresetsSettings } from '../../types/whatsapp';
import { WhatsAppApiService } from '../../services/whatsappApi';

interface SettingsModalProps {
  credentials: WhatsAppCredentials;
  onSaveCredentials: (creds: WhatsAppCredentials) => void;
  quickSettings: QuickPresetsSettings;
  onSaveQuickSettings: (settings: QuickPresetsSettings) => void;
  isInstallable?: boolean;
  onInstallPWA?: () => void;
  isInstalled?: boolean;
  onResetDemoData?: () => void;
  tenant?: any;
  onOpenConnectModal?: () => void;
  onOpenBilling?: () => void;
  onOpenContacts?: () => void;
  onOpenSuperAdmin?: () => void;
  onLogout?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  credentials,
  onSaveCredentials,
  quickSettings,
  onSaveQuickSettings,
  isInstallable,
  onInstallPWA,
  isInstalled,
  onResetDemoData,
  tenant,
  onOpenConnectModal,
  onOpenBilling,
  onOpenContacts,
  onOpenSuperAdmin,
  onLogout
}) => {
  const [appId, setAppId] = useState(credentials.appId || '');
  const [appSecret, setAppSecret] = useState(credentials.appSecret || '');
  const [phoneNumberId, setPhoneNumberId] = useState(credentials.phoneNumberId);
  const [wabaId, setWabaId] = useState(credentials.wabaId);
  const [accessToken, setAccessToken] = useState(credentials.accessToken);
  const [verifyToken, setVerifyToken] = useState(credentials.webhookVerifyToken || 'whatscloud_token');

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
    phone?: any;
  } | null>(null);

  const [isAutoSettingUp, setIsAutoSettingUp] = useState(false);
  const [autoSetupResult, setAutoSetupResult] = useState<{
    success: boolean;
    subSuccess?: boolean;
    wabaSuccess?: boolean;
    error?: string | null;
    log?: Array<{ step: string; status: 'success' | 'failed' | 'warning'; message: string }>;
    phoneNumbers?: any[];
    recommendedPhoneNumberId?: string | null;
    primaryPhone?: any;
  } | null>(null);

  const [availablePhones, setAvailablePhones] = useState<any[]>([]);
  const [isLoadingPhones, setIsLoadingPhones] = useState(false);

  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedVerify, setCopiedVerify] = useState(false);
  const [showVerifyToken, setShowVerifyToken] = useState(false);
  const [liveWebhookUrl, setLiveWebhookUrl] = useState<string>('');
  const [isRefreshingWebhook, setIsRefreshingWebhook] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [webhookMetrics, setWebhookMetrics] = useState<{
    totalEventsReceived: number;
    failedEvents: number;
    lastReceivedAt: number | null;
    lastProcessedAt: number | null;
  } | null>(null);
  const [webhookTestResult, setWebhookTestResult] = useState<{
    success: boolean;
    message: string;
    status?: number;
  } | null>(null);
  const [diagnosticReport, setDiagnosticReport] = useState<any | null>(null);

  // Fetch permanent Meta webhook info and live metrics
  const fetchPublicWebhookInfo = async () => {
    try {
      setIsRefreshingWebhook(true);
      const data = await WhatsAppApiService.getPublicWebhookInfo();
      if (data?.success) {
        if (data.recommendedWebhookUrl) {
          setLiveWebhookUrl(data.recommendedWebhookUrl);
          if (data.verifyToken && !credentials.webhookVerifyToken) {
            setVerifyToken(data.verifyToken);
          }
        }
        if (data.metrics) {
          setWebhookMetrics(data.metrics);
        }
      }
    } catch (e) {
      console.warn('Could not fetch webhook info:', e);
    } finally {
      setIsRefreshingWebhook(false);
    }
  };

  const handleTestWebhookEndpoint = async () => {
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const data = await WhatsAppApiService.testWebhook({
        url: effectiveWebhookUrl,
        verifyToken: verifyToken.trim()
      });
      setWebhookTestResult({
        success: Boolean(data.success),
        message: data.message || (data.success ? 'Webhook verified! Meta GET challenge returned HTTP 200.' : 'Failed verification'),
        status: data.status
      });
      await fetchPublicWebhookInfo();
    } catch (e: any) {
      setWebhookTestResult({
        success: false,
        message: e?.message || 'Network error reaching test endpoint'
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleRunFullDiagnostics = async () => {
    if (!accessToken.trim()) {
      alert('Please enter a Meta Access Token first.');
      return;
    }
    setIsDiagnosing(true);
    setDiagnosticReport(null);
    try {
      const data = await WhatsAppApiService.runDiagnostics({
        token: accessToken.trim(),
        phoneNumberId: phoneNumberId.trim() || undefined,
        wabaId: wabaId.trim() || undefined,
        verifyToken: verifyToken.trim() || undefined
      });
      if (data.success && data.report) {
        setDiagnosticReport(data.report);
      } else {
        alert(data.error || 'Failed to complete diagnostic report');
      }
    } catch (err: any) {
      alert(err?.message || 'Error running diagnostics');
    } finally {
      setIsDiagnosing(false);
    }
  };

  useEffect(() => {
    fetchPublicWebhookInfo();
  }, []);

  const defaultProductionUrl = 'https://whatchatfork.onrender.com/api/whatsapp/webhook';
  const effectiveWebhookUrl = liveWebhookUrl || defaultProductionUrl;

  const handleAutoSetup = async () => {
    if (!appId.trim() || !appSecret.trim() || !accessToken.trim() || !wabaId.trim()) {
      alert('Please provide App ID, App Secret, WABA ID, and Meta Access Token to run automated setup.');
      return;
    }

    setIsAutoSettingUp(true);
    setAutoSetupResult(null);

    try {
      const data = await WhatsAppApiService.autoSetupWebhook({
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        accessToken: accessToken.trim(),
        wabaId: wabaId.trim(),
        webhookUrl: effectiveWebhookUrl,
        verifyToken: verifyToken.trim()
      });

      setAutoSetupResult(data);

      if (data.phoneNumbers && Array.isArray(data.phoneNumbers)) {
        setAvailablePhones(data.phoneNumbers);
      }

      const chosenPhoneId = phoneNumberId.trim() || data.recommendedPhoneNumberId || '';
      if (chosenPhoneId && !phoneNumberId) {
        setPhoneNumberId(chosenPhoneId);
      }

      if (data.subSuccess || data.wabaSuccess) {
        const updatedCreds: WhatsAppCredentials = {
          ...credentials,
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          phoneNumberId: chosenPhoneId,
          wabaId: wabaId.trim(),
          accessToken: accessToken.trim(),
          webhookVerifyToken: verifyToken.trim(),
          verifiedName: data.primaryPhone?.verified_name || credentials.verifiedName,
          displayPhoneNumber: data.primaryPhone?.display_phone_number || credentials.displayPhoneNumber,
          qualityRating: data.primaryPhone?.quality_rating || credentials.qualityRating,
          isConnected: Boolean(chosenPhoneId && accessToken.trim()),
          lastChecked: Date.now()
        };
        onSaveCredentials(updatedCreds);
      }
    } catch (err: any) {
      setAutoSetupResult({
        success: false,
        error: err?.message || 'Failed to execute automated setup'
      });
    } finally {
      setIsAutoSettingUp(false);
    }
  };

  const handleFetchPhoneNumbers = async () => {
    if (!wabaId.trim() || !accessToken.trim()) {
      alert('Please enter WABA ID and Meta Access Token first.');
      return;
    }
    setIsLoadingPhones(true);
    try {
      const res = await WhatsAppApiService.fetchPhoneNumbers({
        wabaId: wabaId.trim(),
        accessToken: accessToken.trim()
      });
      if (res.success && res.phoneNumbers) {
        setAvailablePhones(res.phoneNumbers);
        if (res.phoneNumbers.length > 0 && !phoneNumberId) {
          setPhoneNumberId(res.phoneNumbers[0].id);
        }
      } else {
        alert(res.error || 'Failed to fetch phone numbers from Meta');
      }
    } catch (e: any) {
      alert(e?.message || 'Error fetching phone numbers');
    } finally {
      setIsLoadingPhones(false);
    }
  };

  const handleTestConnection = async () => {
    if (!phoneNumberId.trim() || !accessToken.trim()) {
      alert('Please fill in both Phone Number ID and Meta Access Token.');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await WhatsAppApiService.testConnection({
        phoneNumberId,
        wabaId,
        accessToken
      });

      if (res.success && res.phone) {
        const updatedCreds: WhatsAppCredentials = {
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim(),
          accessToken: accessToken.trim(),
          webhookVerifyToken: verifyToken.trim(),
          verifiedName: res.phone.verified_name || res.phone.display_phone_number,
          displayPhoneNumber: res.phone.display_phone_number,
          qualityRating: res.phone.quality_rating,
          isConnected: true,
          lastChecked: Date.now()
        };
        onSaveCredentials(updatedCreds);
        setTestResult({
          success: true,
          message: `Connected successfully to Meta! Business Name: "${res.phone.verified_name || 'Verified'}" (${res.phone.display_phone_number || phoneNumberId})`,
          phone: res.phone
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Meta rejected the credentials. Check your token and Phone ID.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Failed to connect to Meta Graph API'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveOnly = () => {
    const updatedCreds: WhatsAppCredentials = {
      ...credentials,
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      phoneNumberId: phoneNumberId.trim(),
      wabaId: wabaId.trim(),
      accessToken: accessToken.trim(),
      webhookVerifyToken: verifyToken.trim(),
      isConnected: Boolean(phoneNumberId.trim() && accessToken.trim())
    };
    onSaveCredentials(updatedCreds);
    alert('Credentials saved to local storage.');
  };

  const handleCopy = (text: string, type: 'webhook' | 'verify') => {
    navigator.clipboard.writeText(text);
    if (type === 'webhook') {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else {
      setCopiedVerify(true);
      setTimeout(() => setCopiedVerify(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#111B21] transition-colors select-none p-3 pb-24 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full space-y-4">
        
        {/* ==================================================== */}
        {/* SAAS PLATFORM HUBS: WHATSAPP, BILLING, CONTACTS     */}
        {/* ==================================================== */}
        <div className="space-y-3">
          <div className="pb-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#008069] dark:text-[#25D366]" />
              <span>Workspace Management & Settings</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage WhatsApp connections, subscription plans, GST invoices, and CRM contacts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* 1. WhatsApp Connection Card */}
            <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[#008069] dark:text-[#25D366]" />
                    WhatsApp Channel
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      credentials.accessToken && credentials.phoneNumberId
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {credentials.accessToken && credentials.phoneNumberId ? 'Connected' : 'Action Needed'}
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                  {credentials.verifiedName || credentials.displayPhoneNumber || 'No active WhatsApp number linked'}
                </p>
              </div>

              {onOpenConnectModal && (
                <button
                  onClick={onOpenConnectModal}
                  className="w-full py-2 px-3 bg-[#008069] hover:bg-[#00705a] text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Connect WhatsApp (Embedded / BYO)</span>
                </button>
              )}
            </div>

            {/* 2. Indian Subscription & GST Billing Card */}
            <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-[#008069] dark:text-[#25D366]" />
                    Billing & GST
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase">
                    {tenant?.plan || 'Starter'}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Message Quota:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {(tenant?.messagesUsed || 0).toLocaleString()} / {(tenant?.monthlyQuota || 5000).toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#008069] dark:bg-[#25D366] h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (((tenant?.messagesUsed || 0) / (tenant?.monthlyQuota || 5000)) * 100))}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {onOpenBilling && (
                <button
                  onClick={onOpenBilling}
                  className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Plans, Razorpay & Invoices</span>
                </button>
              )}
            </div>

            {/* 3. CRM Contacts Card */}
            <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    CRM Contacts
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Customer Database</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Tag segmentation, customer notes, and batch CSV list imports.
                </p>
              </div>

              {onOpenContacts && (
                <button
                  onClick={onOpenContacts}
                  className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5 text-teal-500" />
                  <span>Open Contacts & CSV Import</span>
                </button>
              )}
            </div>

            {/* 4. Super Admin Console & Security Card */}
            <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    Platform Admin
                  </span>
                  <span className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold px-2 py-0.5 rounded-full uppercase">
                    Admin
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                  Super Admin management for platform Meta app, BI metrics, and tenants.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {onOpenSuperAdmin && (
                  <button
                    onClick={onOpenSuperAdmin}
                    className="flex-1 py-2 px-3 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 text-purple-700 dark:text-purple-300 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Admin Panel</span>
                  </button>
                )}
                {onLogout && (
                  <button
                    onClick={onLogout}
                    title="Sign Out of Workspace"
                    className="p-2 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-xl transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="pt-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-[#008069] dark:text-[#25D366]" />
            <span>Direct Meta Cloud API Advanced Developer Configuration</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure raw App ID, App Secret, Webhooks and System User Tokens directly.
          </p>
        </div>

        {/* 1-Click Automated Setup Card (WhatsJet Architecture) */}
        <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <Zap className="w-4 h-4 text-[#008069] dark:text-[#25D366]" />
              <span>1-Click Auto Setup via Meta Graph API</span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#008069]/10 text-[#008069] dark:text-[#25D366]">
              WhatsJet Flow
            </span>
          </div>

          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Meta allows automatic webhook registration via Graph API. By providing your <strong>App ID</strong> and <strong>App Secret</strong>, WhatsCloud automatically invokes <code>POST /&#123;app-id&#125;/subscriptions</code>, links your WhatsApp Business Account (WABA), and discovers your phone numbers without needing manual configuration in the Meta dashboard.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Meta App ID */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Meta App ID
                </label>
                <span className="text-[10px] text-slate-400">App Settings &gt; Basic</span>
              </div>
              <input
                type="text"
                placeholder="e.g. 159283019482710"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="w-full font-mono px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069]"
              />
            </div>

            {/* Meta App Secret */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Meta App Secret
                </label>
                <span className="text-[10px] text-slate-400">App Settings &gt; Basic</span>
              </div>
              <input
                type="password"
                placeholder="••••••••••••••••••••"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                className="w-full font-mono px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069]"
              />
            </div>
          </div>

          {/* WABA ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                WhatsApp Business Account ID (WABA ID)
              </label>
              <span className="text-[10px] text-slate-400">WhatsApp &gt; API Setup</span>
            </div>
            <input
              type="text"
              placeholder="e.g. 102948291049281"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              className="w-full font-mono px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069]"
            />
          </div>

          {/* Access Token */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                System User / Permanent Meta Access Token
              </label>
              <a
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#008069] dark:text-[#25D366] hover:underline flex items-center gap-0.5"
              >
                <span>Meta Portal</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <input
              type="password"
              placeholder="EAAG... (Bearer Token with whatsapp_business_messaging & management permissions)"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full font-mono px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069]"
            />
          </div>

          {/* 1-Click Auto Setup Action Button */}
          <div className="pt-2">
            <button
              onClick={handleAutoSetup}
              disabled={isAutoSettingUp}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#008069] to-[#00a884] dark:from-[#25D366] dark:to-[#128C7E] text-white font-bold hover:opacity-95 active:scale-[0.99] transition-all shadow-md"
            >
              <Sparkles className={`w-4 h-4 ${isAutoSettingUp ? 'animate-spin' : ''}`} />
              <span>{isAutoSettingUp ? 'Executing Meta API Auto-Registration...' : '1-Click Auto Register Webhook & Connect WABA'}</span>
            </button>
          </div>

          {/* Auto Setup Results Breakdown */}
          {autoSetupResult && (
            <div
              className={`p-3 rounded-xl border text-xs space-y-2 ${
                autoSetupResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-[13px]">
                {autoSetupResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                <span>
                  {autoSetupResult.success
                    ? 'Automated Webhook Registration Succeeded!'
                    : 'Auto-Setup Completed with Notes / Notice'}
                </span>
              </div>

              {autoSetupResult.error && (
                <p className="text-[11px] text-red-600 dark:text-red-400 bg-red-100/50 dark:bg-red-950/60 p-2 rounded-lg">
                  {autoSetupResult.error}
                </p>
              )}

              {autoSetupResult.log && (
                <div className="space-y-1 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                  {autoSetupResult.log.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-[11px]">
                      {item.status === 'success' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : item.status === 'warning' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                      )}
                      <span>{item.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Credentials Form Card: Phone Number & Manual Testing */}
        <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-[#008069] dark:text-[#25D366]" />
              <span>Phone Number & Direct Credentials</span>
            </h3>
            <button
              onClick={handleFetchPhoneNumbers}
              disabled={isLoadingPhones}
              className="text-[10px] text-[#008069] dark:text-[#25D366] hover:underline flex items-center gap-1 font-semibold"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isLoadingPhones ? 'animate-spin' : ''}`} />
              <span>{isLoadingPhones ? 'Fetching...' : 'Discover Registered Numbers'}</span>
            </button>
          </div>

          {/* Discovered Phone Numbers Picker (if available) */}
          {availablePhones.length > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Discovered Phone Numbers ({availablePhones.length})
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {availablePhones.map((phone) => (
                  <button
                    key={phone.id}
                    type="button"
                    onClick={() => setPhoneNumberId(phone.id)}
                    className={`text-left p-2 rounded-lg border transition-all flex items-center justify-between text-xs ${
                      phoneNumberId === phone.id
                        ? 'border-[#008069] bg-[#008069]/10 text-slate-900 dark:text-white font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1F2C34] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <div>{phone.display_phone_number} {phone.verified_name ? `(${phone.verified_name})` : ''}</div>
                      <div className="text-[10px] font-mono text-slate-400">ID: {phone.id}</div>
                    </div>
                    {phoneNumberId === phone.id && (
                      <CheckCircle2 className="w-4 h-4 text-[#008069] dark:text-[#25D366]" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Phone Number ID Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700 dark:text-slate-300">
                Phone Number ID (Active Sender ID)
              </label>
              <span className="text-[10px] text-slate-400">Meta Dashboard &gt; WhatsApp &gt; API Setup</span>
            </div>
            <input
              type="text"
              placeholder="e.g. 104829104928104"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="w-full font-mono px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069]"
            />
          </div>

          {/* Action Buttons: Test Connection & Save */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-[#008069] dark:bg-[#25D366] text-white font-semibold hover:opacity-95 active:scale-95 transition-all shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Probing Meta API...' : 'Test & Verify Credentials'}</span>
            </button>

            <button
              onClick={handleSaveOnly}
              className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Save Offline
            </button>
          </div>

          {/* Test Result Box */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-semibold text-sm">{testResult.message}</p>
                </div>
              </div>

              {testResult.phone && (
                <div className="space-y-2 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60 text-[11px]">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2 rounded-lg bg-emerald-100/70 dark:bg-emerald-900/50">
                      <span className="block text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-bold">Operational Status</span>
                      <strong className="text-emerald-950 dark:text-emerald-100 text-xs">
                        {testResult.phone.operational_status || testResult.phone.status || 'CONNECTED'}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-100/70 dark:bg-emerald-900/50">
                      <span className="block text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-bold">Quality Rating</span>
                      <strong className="text-emerald-950 dark:text-emerald-100 text-xs">
                        {testResult.phone.quality_rating || 'GREEN'}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-100/70 dark:bg-emerald-900/50">
                      <span className="block text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-bold">Name Status</span>
                      <strong className="text-emerald-950 dark:text-emerald-100 text-xs">
                        {testResult.phone.name_status || 'APPROVED'}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-100/70 dark:bg-emerald-900/50">
                      <span className="block text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-bold">2FA Setup OTP</span>
                      <span className="font-semibold text-emerald-900 dark:text-emerald-200 text-xs">
                        {testResult.phone.two_factor_status || 'EXPIRED (Registered)'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-700/90 dark:text-emerald-300/90 italic">
                    ℹ️ Note: 2FA Setup OTP "EXPIRED" indicates the temporary registration SMS code expired after registration. The phone is fully active and connected.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Webhook Configuration Dashboard Card */}
        <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
              <ShieldCheck className="w-4 h-4 text-[#008069] dark:text-[#25D366]" />
              <span>Meta Webhook Configuration</span>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Permanent Render Edge (Direct Meta)</span>
            </span>
          </div>

          {/* Explanation Alert */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[11px] text-slate-900 dark:text-white">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Production Webhook Settings for Meta Developer Portal</span>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Copy the permanent Callback URL and Verify Token below into <strong>Meta App Dashboard &rarr; WhatsApp &rarr; Configuration &rarr; Webhook</strong>. 
              The backend directly receives and authenticates events via Render HTTPS with zero development tunnels.
            </p>
          </div>

          {/* Callback URL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Permanent Production Callback URL
              </label>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                HTTPS Verified
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={effectiveWebhookUrl}
                className="w-full font-mono text-[11px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(effectiveWebhookUrl, 'webhook')}
                className="px-3 py-2 rounded-lg bg-[#008069] text-white hover:bg-[#00705b] flex items-center gap-1 font-semibold text-xs shrink-0 active:scale-95 transition-transform"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedWebhook ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Verify Token */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Webhook Verification Token
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative w-full">
                <input
                  type={showVerifyToken ? 'text' : 'password'}
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  className="w-full font-mono text-[11px] px-3 py-2 pr-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => setShowVerifyToken(!showVerifyToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title={showVerifyToken ? 'Hide token' : 'Show token'}
                >
                  {showVerifyToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(verifyToken, 'verify')}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1 font-semibold text-xs shrink-0 active:scale-95 transition-transform"
              >
                {copiedVerify ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedVerify ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Webhook Telemetry & Health Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
              <span className="block text-[10px] text-slate-500 uppercase font-semibold">Total Events</span>
              <strong className="text-slate-900 dark:text-white font-mono text-sm">
                {webhookMetrics?.totalEventsReceived ?? 0}
              </strong>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
              <span className="block text-[10px] text-slate-500 uppercase font-semibold">Processed</span>
              <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm">
                {(webhookMetrics?.totalEventsReceived ?? 0) - (webhookMetrics?.failedEvents ?? 0)}
              </strong>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
              <span className="block text-[10px] text-slate-500 uppercase font-semibold">Failed Events</span>
              <strong className={`font-mono text-sm ${webhookMetrics?.failedEvents ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
                {webhookMetrics?.failedEvents ?? 0}
              </strong>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
              <span className="block text-[10px] text-slate-500 uppercase font-semibold">Last Received</span>
              <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate block">
                {webhookMetrics?.lastReceivedAt 
                  ? new Date(webhookMetrics.lastReceivedAt).toLocaleTimeString() 
                  : 'No events yet'}
              </span>
            </div>
          </div>

          {/* 6-Layer Diagnostic Suite Output */}
          {diagnosticReport && (
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px] text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Meta 6-Point Diagnostic Suite Report</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  diagnosticReport.overallStatus === 'active'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  Status: {diagnosticReport.overallStatus}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                  <span className="font-semibold block text-slate-800 dark:text-slate-200">1. Credentials & Token:</span>
                  <span className={diagnosticReport.checks.credentials.isValid ? 'text-emerald-600' : 'text-rose-500'}>
                    {diagnosticReport.checks.credentials.isValid ? '✓ Valid Permanent Token' : `✗ ${diagnosticReport.checks.credentials.error}`}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                  <span className="font-semibold block text-slate-800 dark:text-slate-200">2. WhatsApp Business Account:</span>
                  <span className={diagnosticReport.checks.waba.status === 'active' ? 'text-emerald-600' : 'text-amber-500'}>
                    {diagnosticReport.checks.waba.status === 'active' ? `✓ ${diagnosticReport.checks.waba.name || 'Active'}` : 'Pending / Not set'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                  <span className="font-semibold block text-slate-800 dark:text-slate-200">3. Phone Number Registration:</span>
                  <span className={diagnosticReport.checks.phoneNumber.status === 'connected' ? 'text-emerald-600' : 'text-amber-500'}>
                    {diagnosticReport.checks.phoneNumber.status === 'connected' ? `✓ Connected (${diagnosticReport.checks.phoneNumber.qualityRating || 'GREEN'})` : 'Not connected'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                  <span className="font-semibold block text-slate-800 dark:text-slate-200">4. WABA App Subscription:</span>
                  <span className={diagnosticReport.checks.webhookSubscription.isSubscribed ? 'text-emerald-600' : 'text-amber-500'}>
                    {diagnosticReport.checks.webhookSubscription.isSubscribed ? '✓ Subscribed Apps Active' : 'Not subscribed via subscribed_apps'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                  <span className="font-semibold block text-slate-800 dark:text-slate-200">5. Webhook Challenge Verification:</span>
                  <span className={diagnosticReport.checks.webhookVerification.challengeMatched ? 'text-emerald-600' : 'text-rose-500'}>
                    {diagnosticReport.checks.webhookVerification.challengeMatched ? '✓ Handshake Passed (HTTP 200)' : 'Failed verification'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                  <span className="font-semibold block text-slate-800 dark:text-slate-200">6. Messaging Availability:</span>
                  <span className={diagnosticReport.checks.messagingAvailability.canSend ? 'text-emerald-600' : 'text-amber-500'}>
                    {diagnosticReport.checks.messagingAvailability.canSend ? '✓ Ready to Send & Receive' : 'Messaging Blocked'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Webhook Test Diagnostic Result */}
          {webhookTestResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                webhookTestResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
              }`}
            >
              {webhookTestResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-semibold">{webhookTestResult.message}</p>
                {webhookTestResult.status && (
                  <p className="text-[10px] mt-0.5 opacity-80">
                    HTTP Response Status: {webhookTestResult.status}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Webhook Action Buttons */}
          <div className="pt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTestWebhookEndpoint}
              disabled={isTestingWebhook}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-900 dark:bg-slate-700 text-white font-semibold text-xs hover:bg-slate-800 dark:hover:bg-slate-600 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{isTestingWebhook ? 'Simulating Meta Handshake...' : 'Test Verification'}</span>
            </button>
            <button
              type="button"
              onClick={handleRunFullDiagnostics}
              disabled={isDiagnosing}
              className="py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              <Activity className={`w-3.5 h-3.5 ${isDiagnosing ? 'animate-spin text-emerald-500' : ''}`} />
              <span>{isDiagnosing ? 'Running 6-Point Check...' : '6-Point Diagnostics'}</span>
            </button>
            <button
              type="button"
              onClick={fetchPublicWebhookInfo}
              disabled={isRefreshingWebhook}
              className="py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingWebhook ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </button>
          </div>
        </div>

        {/* Quick Add Presets Configuration Card */}
        <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#008069]/10 text-[#008069] dark:text-[#25D366] flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-sm block">
                  Quick Add Presets Configuration
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Enable or disable specific Quick Presets categories in chat
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
            Customize which Quick categories appear in your attachments. If you only want Audio or only Location, turn off the others below.
          </p>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {/* Audio Toggle */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Headphones className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Quick Audio Presets</div>
                  <div className="text-[11px] text-slate-500">Audio notes, greetings (e.g. 1.mp3, 2.mp3)</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSaveQuickSettings({ ...quickSettings, audio: !quickSettings.audio })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  quickSettings.audio ? 'bg-[#008069] dark:bg-[#25D366]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    quickSettings.audio ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Documents Toggle */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Quick Document Presets</div>
                  <div className="text-[11px] text-slate-500">Price catalogs, terms, PDF invoices</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSaveQuickSettings({ ...quickSettings, document: !quickSettings.document })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  quickSettings.document ? 'bg-[#008069] dark:bg-[#25D366]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    quickSettings.document ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Photos Toggle */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Quick Photo Presets</div>
                  <div className="text-[11px] text-slate-500">QR codes, company banners, product flyers</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSaveQuickSettings({ ...quickSettings, image: !quickSettings.image })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  quickSettings.image ? 'bg-[#008069] dark:bg-[#25D366]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    quickSettings.image ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Videos Toggle */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400 flex items-center justify-center shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Quick Video Presets</div>
                  <div className="text-[11px] text-slate-500">Walkthroughs, demo reels, instruction clips</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSaveQuickSettings({ ...quickSettings, video: !quickSettings.video })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  quickSettings.video ? 'bg-[#008069] dark:bg-[#25D366]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    quickSettings.video ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Location Toggle */}
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">Quick Office Branch Locations</div>
                  <div className="text-[11px] text-slate-500">Pre-saved company branch centers in the city</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSaveQuickSettings({ ...quickSettings, location: !quickSettings.location })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  quickSettings.location ? 'bg-[#008069] dark:bg-[#25D366]' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    quickSettings.location ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Android PWA Installation Card */}
        <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#008069] dark:text-[#25D366]" />
              <span className="font-bold text-slate-900 dark:text-white">Android App / PWA Status</span>
            </div>
            {isInstalled ? (
              <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Installed on Device</span>
              </span>
            ) : null}
          </div>

          <p className="text-slate-500 dark:text-slate-400 text-[11px]">
            WhatsCloud is built with Progressive Web App standards and can run standalone on Android phones with full screen, offline caching, and native notifications.
          </p>

          {isInstallable && !isInstalled && (
            <button
              onClick={onInstallPWA}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold hover:opacity-90 active:scale-95 transition-all mt-2"
            >
              <Smartphone className="w-4 h-4" />
              <span>Install to Android Home Screen</span>
            </button>
          )}

          <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
            <p><strong>To install on Chrome Android:</strong> Tap the 3 dots (⋮) in your mobile browser &gt; Tap "Add to Home screen" or "Install App".</p>
          </div>
        </div>

        {/* Demo Media & Rich Chat Simulator */}
        {onResetDemoData && (
          <div className="bg-white dark:bg-[#1F2C34] rounded-2xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 dark:text-white">
                Demo Chat &amp; Rich Media Playground
              </span>
              <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                Interactive
              </span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-[11px]">
              Load rich sample conversations featuring in-app playable voice notes, photo inspection cards, PDF catalogues, video previews, and GPS locations.
            </p>
            <button
              onClick={() => {
                onResetDemoData();
                alert('Demo chats reloaded with playable voice notes, photos, documents, and videos!');
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-[#008069] text-[#008069] dark:text-[#25D366] font-semibold hover:bg-emerald-50 dark:hover:bg-emerald-950/30 active:scale-95 transition-all mt-1"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Rich Demo Media &amp; Contacts</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
