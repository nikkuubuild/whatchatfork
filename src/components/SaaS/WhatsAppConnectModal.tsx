import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Building2,
  Layers,
  Key,
  ShieldCheck,
  RefreshCw,
  Zap,
  Globe,
  ExternalLink,
  Info
} from 'lucide-react';

interface WhatsAppConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token?: string;
  activeChannel?: any;
}

export const WhatsAppConnectModal: React.FC<WhatsAppConnectModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  token,
  activeChannel
}) => {
  const [activeTab, setActiveTab] = useState<'embedded' | 'byo'>('embedded');
  const [coexistenceEnabled, setCoexistenceEnabled] = useState(true);

  // Platform Embedded Signup state
  const [platformConfig, setPlatformConfig] = useState<{
    appId: string;
    configId: string;
    partnerSolutionId?: string;
    isReady: boolean;
  } | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isEmbeddedConnecting, setIsEmbeddedConnecting] = useState(false);
  const [embeddedError, setEmbeddedError] = useState<string | null>(null);

  // BYO Meta Credentials state
  const [byoAppId, setByoAppId] = useState('');
  const [byoAppSecret, setByoAppSecret] = useState('');
  const [byoToken, setByoToken] = useState('');
  const [byoWabaId, setByoWabaId] = useState('');
  const [byoPhoneId, setByoPhoneId] = useState('');
  const [isByoSubmitting, setIsByoSubmitting] = useState(false);
  const [byoError, setByoError] = useState<string | null>(null);

  // Load public platform config for Embedded Signup
  useEffect(() => {
    if (!isOpen) return;

    const fetchConfig = async () => {
      setIsLoadingConfig(true);
      try {
        const res = await fetch('/api/whatsapp/embedded-signup/config');
        const data = await res.json();
        if (data.success) {
          setPlatformConfig(data);
          if (!data.isReady) {
            setActiveTab('byo');
          }
        }
      } catch (err) {
        console.warn('Could not fetch embedded signup configuration:', err);
      } finally {
        setIsLoadingConfig(false);
      }
    };

    fetchConfig();
  }, [isOpen]);

  // Load Facebook JS SDK on demand
  useEffect(() => {
    if (!platformConfig?.appId || (window as any).FB) return;

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      (window as any).FB?.init({
        appId: platformConfig.appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v21.0'
      });
    };
    document.body.appendChild(script);
  }, [platformConfig?.appId]);

  // Handle Meta Embedded Signup Trigger
  const handleLaunchEmbeddedSignup = () => {
    setEmbeddedError(null);

    if (!platformConfig?.appId || !platformConfig?.configId) {
      setEmbeddedError('Platform Meta credentials have not been configured by Super Admin yet. Please use "Bring Your Own Meta App" mode.');
      return;
    }

    const FB = (window as any).FB;
    if (!FB) {
      setEmbeddedError('Facebook SDK is still loading. Please check your internet connection or ad-blocker and try again.');
      return;
    }

    setIsEmbeddedConnecting(true);

    let sessionWabaId: string | null = null;
    let sessionPhoneId: string | null = null;

    // Listen for the Embedded Signup Session Event
    const messageListener = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com') return;

      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH' && data.data) {
            sessionPhoneId = data.data.phone_number_id || null;
            sessionWabaId = data.data.waba_id || null;
            console.log('[Embedded Signup Event Finish]:', { sessionPhoneId, sessionWabaId });
          } else if (data.event === 'CANCEL') {
            setIsEmbeddedConnecting(false);
            setEmbeddedError('Onboarding was canceled in Meta popup.');
          }
        }
      } catch (_) {}
    };

    window.addEventListener('message', messageListener);

    // Extras payload with optional Partner Solution ID
    const extrasPayload: any = {
      feature: 'whatsapp_embedded_signup',
      sessionInfoVersion: '3'
    };

    if (platformConfig.partnerSolutionId?.trim()) {
      extrasPayload.setup = {
        solutionID: platformConfig.partnerSolutionId.trim()
      };
    }

    // Launch Facebook Login popup
    FB.login(
      async (response: any) => {
        window.removeEventListener('message', messageListener);

        const code = response?.authResponse?.code;
        if (!code) {
          setIsEmbeddedConnecting(false);
          if (response?.status !== 'connected') {
            setEmbeddedError('Meta authorization was canceled or closed.');
          }
          return;
        }

        try {
          // Send authorization code and asset identifiers to backend
          const backendRes = await fetch('/api/whatsapp/connect/embedded-signup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({
              code,
              wabaId: sessionWabaId || response?.authResponse?.waba_id,
              phoneNumberId: sessionPhoneId,
              coexistenceEnabled
            })
          });

          const result = await backendRes.json();
          if (result.success) {
            onSuccess();
            onClose();
          } else {
            setEmbeddedError(result.error || 'Failed to complete WhatsApp onboarding');
          }
        } catch (err: any) {
          setEmbeddedError(err?.message || 'Network error completing onboarding');
        } finally {
          setIsEmbeddedConnecting(false);
        }
      },
      {
        config_id: platformConfig.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: extrasPayload
      }
    );
  };

  // Handle BYO Submit
  const handleByoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setByoError(null);

    if (!byoToken.trim() || !byoPhoneId.trim()) {
      setByoError('Meta Access Token and Phone Number ID are required.');
      return;
    }

    setIsByoSubmitting(true);
    try {
      const res = await fetch('/api/whatsapp/connect/byo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          appId: byoAppId.trim() || undefined,
          appSecret: byoAppSecret.trim() || undefined,
          accessToken: byoToken.trim(),
          wabaId: byoWabaId.trim() || undefined,
          phoneNumberId: byoPhoneId.trim(),
          coexistenceEnabled
        })
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setByoError(data.error || 'Failed to connect WhatsApp account');
      }
    } catch (err: any) {
      setByoError(err?.message || 'Network error connecting account');
    } finally {
      setIsByoSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1E262C] w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#151D24]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Connect WhatsApp Business Account
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                Choose your preferred onboarding method to activate official WhatsApp messaging
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 pt-3 bg-slate-50/50 dark:bg-[#151D24]/50 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab('embedded')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'embedded'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>1-Click Meta Embedded Signup</span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">
              Recommended
            </span>
          </button>
          <button
            onClick={() => setActiveTab('byo')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'byo'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Bring Your Own Meta App (BYO)</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Active Connection Banner if connected */}
          {activeChannel && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-emerald-900 dark:text-emerald-300">
                  Currently Connected: {activeChannel.display_phone_number || activeChannel.phone_number_id}
                </span>
                <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Mode: <span className="uppercase font-semibold">{activeChannel.connection_mode}</span>
                  {activeChannel.coexistence_enabled ? ' • Coexistence Active' : ''}
                </p>
              </div>
            </div>
          )}

          {/* Coexistence Toggle Option */}
          <div className="p-4 bg-slate-50 dark:bg-[#151D24] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Enable WhatsApp Business App Coexistence
                </span>
              </div>
              <input
                type="checkbox"
                id="coexToggle"
                checked={coexistenceEnabled}
                onChange={(e) => setCoexistenceEnabled(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Allows you to keep using the official WhatsApp Business mobile app on your smartphone while simultaneously managing customer conversations from this web platform.
            </p>
          </div>

          {/* TAB 1: 1-Click Embedded Signup */}
          {activeTab === 'embedded' && (
            <div className="space-y-5">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 dark:text-blue-300 space-y-1">
                  <p className="font-semibold">Zero-Setup Meta Cloud API Integration</p>
                  <p className="text-blue-700 dark:text-blue-400">
                    No need to create a Meta Developer App. Sign in with Facebook, select your WhatsApp Business Account, and verify your phone number in seconds.
                  </p>
                </div>
              </div>

              {embeddedError && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl flex items-start gap-3 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{embeddedError}</span>
                </div>
              )}

              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-[#151D24] rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                    <span className="font-bold block text-slate-800 dark:text-slate-200">1. Authenticate</span>
                    <span className="text-slate-500">Sign in with Meta</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-[#151D24] rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                    <span className="font-bold block text-slate-800 dark:text-slate-200">2. Select Number</span>
                    <span className="text-slate-500">Pick WABA & Phone</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-[#151D24] rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                    <span className="font-bold block text-slate-800 dark:text-slate-200">3. Start Chatting</span>
                    <span className="text-slate-500">Instant Activation</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLaunchEmbeddedSignup}
                  disabled={isEmbeddedConnecting || isLoadingConfig}
                  className="w-full py-3.5 px-4 bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 text-sm disabled:opacity-50"
                >
                  {isEmbeddedConnecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Completing Onboarding in Meta Popup...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      <span>Continue with Facebook (Embedded Signup)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: BYO Meta Credentials */}
          {activeTab === 'byo' && (
            <form onSubmit={handleByoSubmit} className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                For developers & agencies using their own Meta Developer Console credentials.
              </div>

              {byoError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl flex items-start gap-2 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{byoError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phone Number ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 104829104928"
                    value={byoPhoneId}
                    onChange={(e) => setByoPhoneId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#151D24] border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    WABA ID (WhatsApp Business Account ID)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 592819401928"
                    value={byoWabaId}
                    onChange={(e) => setByoWabaId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#151D24] border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  System User Access Token <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="EAAG..."
                  value={byoToken}
                  onChange={(e) => setByoToken(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#151D24] border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Meta App ID (Optional, for auto-webhooks)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 192849182938"
                    value={byoAppId}
                    onChange={(e) => setByoAppId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#151D24] border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Meta App Secret (Optional)
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={byoAppSecret}
                    onChange={(e) => setByoAppSecret(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#151D24] border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isByoSubmitting}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isByoSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Validating with Meta Graph API...</span>
                    </>
                  ) : (
                    <span>Save & Connect WhatsApp</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
