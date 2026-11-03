import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Zap,
  CheckCircle2,
  Shield,
  Layers,
  Users,
  MessageSquare,
  ArrowRight,
  Key,
  Globe,
  Sparkles,
  BarChart,
  Lock,
  Headphones,
  Check,
  ChevronRight,
  LogIn,
  UserPlus,
  Phone,
  RefreshCw,
  Send
} from 'lucide-react';

interface MarketingLandingPageProps {
  onEnterApp: (authData?: { token: string; user: any; tenant: any }) => void;
  onOpenSuperAdmin: () => void;
  isLoggedIn?: boolean;
}

export const MarketingLandingPage: React.FC<MarketingLandingPageProps> = ({
  onEnterApp,
  onOpenSuperAdmin,
  isLoggedIn
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Form states
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('starter');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // OTP cooldown timer (rate limiter countdown)
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  const handleSendOtp = async () => {
    const cleanMobile = mobile.replace(/[^0-9]/g, '');
    if (cleanMobile.length < 10) {
      setAuthError('Please enter a valid 10-digit WhatsApp mobile number.');
      return;
    }
    if (!businessName.trim()) {
      setAuthError('Please enter your full name or company name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setAuthError('Please enter a valid business email address.');
      return;
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters in length.');
      return;
    }

    setIsSendingOtp(true);
    setAuthError(null);
    setOtpMessage(null);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: cleanMobile,
          name: businessName.trim(),
          email: email.trim(),
          purpose: 'registration'
        })
      });
      const data = await res.json();
      if (data.success) {
        setOtpSent(true);
        setOtpCooldown(data.cooldownSeconds || 60);
        setOtpMessage(data.message || `Verification code sent to WhatsApp number +${data.normalizedPhone || cleanMobile}`);
      } else {
        setAuthError(data.error || 'Failed to send WhatsApp verification code.');
        if (data.cooldownSeconds) {
          setOtpCooldown(data.cooldownSeconds);
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Network error requesting verification code.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (authMode === 'register') {
      if (!otpSent) {
        return handleSendOtp();
      }

      if (!otp || otp.trim().length !== 6) {
        setAuthError('Please enter the 6-digit WhatsApp verification code.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: businessName.trim(),
            email: email.trim(),
            mobile: mobile.trim(),
            password,
            otp: otp.trim(),
            planSlug: selectedPlan
          })
        });
        const data = await res.json();
        if (data.success && data.token) {
          localStorage.setItem('whatchat_saas_token', data.token);
          onEnterApp({ token: data.token, user: data.user, tenant: data.tenant });
        } else {
          setAuthError(data.error || 'Registration failed. Please check your verification code.');
        }
      } catch (err: any) {
        setAuthError(err?.message || 'Network error completing registration.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Login Mode (Email or WhatsApp Mobile)
      if (!email.trim() || !password) {
        setAuthError('Please enter your email or WhatsApp mobile and password.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: email.trim(), password })
        });
        const data = await res.json();
        if (data.success && data.token) {
          localStorage.setItem('whatchat_saas_token', data.token);
          onEnterApp({ token: data.token, user: data.user, tenant: data.tenant });
        } else {
          setAuthError(data.error || 'Invalid credentials. Please verify your email or mobile and password.');
        }
      } catch (err: any) {
        setAuthError(err?.message || 'Network error during sign in.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* SaaS Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                WhatChat<span className="text-emerald-400">.online</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider block -mt-1">
                WhatsApp Business SaaS
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-emerald-400 transition-colors">Features</a>
            <a href="#onboarding" className="hover:text-emerald-400 transition-colors">Dual Onboarding</a>
            <a href="#coexistence" className="hover:text-emerald-400 transition-colors">WhatsApp Coexistence</a>
            <a href="#pricing" className="hover:text-emerald-400 transition-colors">Pricing</a>
          </nav>

          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <button
                onClick={() => onEnterApp()}
                className="px-5 py-2.5 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 transform hover:-translate-y-0.5"
              >
                <span>Go to Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setAuthMode('login'); setAuthError(null); }}
                  className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setAuthMode('register'); setAuthError(null); }}
                  className="px-5 py-2.5 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl shadow-lg shadow-emerald-500/20 transition-all transform hover:-translate-y-0.5"
                >
                  Start Free Trial
                </button>
              </>
            )}
            <button
              onClick={onOpenSuperAdmin}
              title="Super Admin Settings"
              className="p-2.5 text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-xl transition-all border border-slate-800 hover:border-purple-500/30"
            >
              <Shield className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]"></div>
        <div className="max-w-6xl mx-auto px-6 text-center relative z-10 space-y-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Next-Generation WhatsApp Cloud API SaaS Platform</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.1]">
            Scale Your Business on WhatsApp with <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">Zero Complexity</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Manage conversations, broadcast marketing campaigns, automate customer journeys, and empower support agents with multi-tenant workspaces and official Meta Cloud API integration.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={() => { setAuthMode('register'); setAuthError(null); }}
              className="w-full sm:w-auto px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl shadow-xl shadow-emerald-500/25 transition-all flex items-center justify-center gap-3 text-base transform hover:-translate-y-0.5"
            >
              <span>Get Started in 60 Seconds</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => onEnterApp()}
              className="w-full sm:w-auto px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-2xl border border-slate-700 transition-all flex items-center justify-center gap-2 text-base"
            >
              <span>Open Live Workspace</span>
            </button>
          </div>

          {/* Social Proof Badges */}
          <div className="pt-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-left max-w-4xl mx-auto">
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-300">Official Meta Cloud API</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center gap-3">
              <Zap className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-300">1-Click Embedded Signup</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-300">WhatsApp Coexistence</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center gap-3">
              <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-300">Isolated Multi-Tenancy</span>
            </div>
          </div>
        </div>
      </section>

      {/* Dual Onboarding Section */}
      <section id="onboarding" className="py-24 max-w-6xl mx-auto px-6 border-b border-slate-800 space-y-16">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Two Flexible Ways to Connect WhatsApp
          </h2>
          <p className="text-slate-400 text-sm">
            Whether your customers are non-technical business owners or advanced agencies, WhatChat supports the right onboarding journey.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Method B: Embedded Signup */}
          <div className="p-8 rounded-3xl bg-gradient-to-b from-slate-800/60 to-slate-900 border border-emerald-500/30 relative overflow-hidden space-y-6">
            <div className="absolute top-4 right-4 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border border-emerald-500/20">
              For Business Clients
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-bold text-white">Meta Partner Embedded Signup</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Zero API credentials needed. Your customer clicks <strong>"Continue with Facebook"</strong>, selects their Business Portfolio, verifies their number, and their WhatsApp inbox activates instantly.
            </p>
            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Automated OAuth token exchange via platform app</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Automatic WABA webhook subscription</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Partner Solution ID & credit line compatible</span>
              </li>
            </ul>
          </div>

          {/* Method A: BYO Credentials */}
          <div className="p-8 rounded-3xl bg-slate-800/40 border border-slate-800 space-y-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Key className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-bold text-white">Bring Your Own Meta App (BYO)</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Designed for developers, marketing agencies, and enterprises with existing Meta Developer applications. Input App ID, System User Token, and WABA credentials directly.
            </p>
            <ul className="space-y-3 text-xs text-slate-300">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-blue-400" />
                <span>Complete custom Meta Cloud API credentials</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-blue-400" />
                <span>Instant token validation & asset discovery</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-blue-400" />
                <span>Encrypted backend credential isolation</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* WhatsApp Coexistence Section */}
      <section id="coexistence" className="py-24 max-w-6xl mx-auto px-6 border-b border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-bold uppercase tracking-wider border border-teal-500/20">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Dual Access Technology</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
            WhatsApp Business App <br /><span className="text-emerald-400">Coexistence Mode</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Never force your customers to delete their mobile WhatsApp Business app! With official WhatsApp Coexistence, business owners can keep chatting on their phone while their support team handles conversations on this web platform simultaneously.
          </p>
          <div className="space-y-3 pt-2 text-xs text-slate-300">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Full chat history synchronization</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Mobile app notifications continue ringing normally</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Zero number migration downtime</span>
            </div>
          </div>
        </div>

        <div className="p-8 rounded-3xl bg-slate-800/40 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-700">
            <span className="font-bold text-white text-sm">Real-Time Coexistence Sync</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full">
              LIVE
            </span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Phone App (Owner)</span>
              <span className="text-emerald-400 font-semibold">Active & Connected</span>
            </div>
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Web Inbox (Support Agents)</span>
              <span className="text-emerald-400 font-semibold">Active & Synced</span>
            </div>
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Cloud API Webhooks</span>
              <span className="text-emerald-400 font-semibold">Multi-Tenant Routed</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-12 sm:py-24 max-w-6xl mx-auto px-4 sm:px-6 border-b border-slate-800 space-y-8 sm:space-y-16">
        <div className="text-center space-y-3 sm:space-y-4 max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
            Simple, Transparent Pricing Plans
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm">
            Choose the plan that fits your business scale. Upgrade or cancel anytime.
          </p>

          <div className="inline-flex items-center p-1 bg-slate-800 rounded-xl border border-slate-700 text-xs font-semibold">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all ${
                billingCycle === 'monthly' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all ${
                billingCycle === 'yearly' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400'
              }`}
            >
              Yearly (Save 20%)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Starter Plan */}
          <div className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-slate-800/40 border border-slate-800 space-y-4 sm:space-y-5 flex flex-col justify-between">
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-lg sm:text-xl font-bold text-white">Starter</h3>
              <p className="text-xs text-slate-400">For small businesses getting started with WhatsApp support.</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-white">₹{billingCycle === 'monthly' ? '999' : '832'}</span>
                <span className="text-xs text-slate-400">/ month</span>
              </div>
              {billingCycle === 'yearly' && <p className="text-[11px] text-emerald-400 font-medium">Billed annually at ₹9,990</p>}
              <ul className="space-y-2 sm:space-y-2.5 text-xs text-slate-300 pt-3 border-t border-slate-800">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 1 WhatsApp Number</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 2 Team Agent Seats</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 5,000 Messages / month</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Embedded Signup & BYO</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> WhatsApp Coexistence</li>
              </ul>
            </div>
            <button
              onClick={() => { setSelectedPlan('starter'); setAuthMode('register'); }}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-xs transition-all mt-3"
            >
              Get Started
            </button>
          </div>

          {/* Growth Plan */}
          <div className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-slate-800/80 border-2 border-emerald-500 relative space-y-4 sm:space-y-5 flex flex-col justify-between shadow-xl shadow-emerald-500/10">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 font-bold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider">
              Most Popular
            </div>
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-lg sm:text-xl font-bold text-white">Growth</h3>
              <p className="text-xs text-slate-400">For growing teams running marketing campaigns and automations.</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-white">₹{billingCycle === 'monthly' ? '2,499' : '2,082'}</span>
                <span className="text-xs text-slate-400">/ month</span>
              </div>
              {billingCycle === 'yearly' && <p className="text-[11px] text-emerald-400 font-medium">Billed annually at ₹24,990</p>}
              <ul className="space-y-2 sm:space-y-2.5 text-xs text-slate-300 pt-3 border-t border-slate-700">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 3 WhatsApp Numbers</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 10 Team Agent Seats</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 30,000 Messages / month</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> High-Speed Broadcast Scheduler</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Real-time SSE Multi-Seat Inbox</li>
              </ul>
            </div>
            <button
              onClick={() => { setSelectedPlan('growth'); setAuthMode('register'); }}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all mt-3"
            >
              Get Started
            </button>
          </div>

          {/* Pro Plan */}
          <div className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-slate-800/40 border border-slate-800 space-y-4 sm:space-y-5 flex flex-col justify-between">
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-lg sm:text-xl font-bold text-white">Pro</h3>
              <p className="text-xs text-slate-400">For established businesses with large customer bases & campaigns.</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-white">₹{billingCycle === 'monthly' ? '4,999' : '4,165'}</span>
                <span className="text-xs text-slate-400">/ month</span>
              </div>
              {billingCycle === 'yearly' && <p className="text-[11px] text-emerald-400 font-medium">Billed annually at ₹49,990</p>}
              <ul className="space-y-2 sm:space-y-2.5 text-xs text-slate-300 pt-3 border-t border-slate-800">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 5 WhatsApp Numbers</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 25 Team Agent Seats</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 100,000 Messages / month</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Advanced CRM Segmentation</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Priority WhatsApp Delivery</li>
              </ul>
            </div>
            <button
              onClick={() => { setSelectedPlan('pro'); setAuthMode('register'); }}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-xs transition-all mt-3"
            >
              Get Started
            </button>
          </div>

          {/* Enterprise Plan */}
          <div className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-slate-800/40 border border-slate-800 space-y-4 sm:space-y-5 flex flex-col justify-between">
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-lg sm:text-xl font-bold text-white">Enterprise</h3>
              <p className="text-xs text-slate-400">For high-volume operations and agencies requiring custom scale.</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-white">Custom</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Tailored for high throughput</p>
              <ul className="space-y-2 sm:space-y-2.5 text-xs text-slate-300 pt-3 border-t border-slate-800">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 10+ WhatsApp Numbers</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 50+ Team Agent Seats</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 500,000+ Messages / month</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> Dedicated IP & High Throughput</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" /> 24/7 Dedicated Account Manager</li>
              </ul>
            </div>
            <button
              onClick={() => { setSelectedPlan('enterprise'); setAuthMode('register'); }}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl text-xs transition-all mt-3"
            >
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-800 text-xs text-slate-500 text-center space-y-3">
        <p>© 2026 WhatChat.online SaaS Platform. Built on official Meta Cloud API.</p>
        <p>WhatsApp is a registered trademark of Meta Platforms, Inc.</p>
      </footer>

      {/* Interactive Auth Modal (Login / Register) */}
      {authMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 w-full max-w-md rounded-3xl p-8 border border-slate-800 shadow-2xl relative">
            <button
              onClick={() => setAuthMode(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>

            <div className="text-center space-y-2 mb-6">
              <h3 className="text-2xl font-bold text-white">
                {authMode === 'register' ? 'Create Business Workspace' : 'Sign In to Your Workspace'}
              </h3>
              <p className="text-xs text-slate-400">
                {authMode === 'register'
                  ? 'Start your 14-day free trial. No credit card required.'
                  : 'Enter your credentials to access your WhatsApp dashboard.'}
              </p>
            </div>

            {otpMessage && (
              <div className="p-3 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-medium flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{otpMessage}</span>
              </div>
            )}

            {authError && (
              <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 font-medium">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3.5">
              {authMode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name / Business Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma / Acme Technologies"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">WhatsApp Mobile Number</label>
                    <div className="flex gap-2">
                      <div className="px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-slate-400 flex items-center shrink-0">
                        +91
                      </div>
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        placeholder="9876543210"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, ''))}
                        className="flex-1 px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white font-mono"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Verification code will be dispatched to this WhatsApp number.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Selected Plan</label>
                    <select
                      value={selectedPlan}
                      onChange={(e) => setSelectedPlan(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white font-medium"
                    >
                      <option value="starter">Starter — ₹999/mo (5,000 msgs, 2 agents)</option>
                      <option value="growth">Growth — ₹2,499/mo (30,000 msgs, 10 agents, coexistence)</option>
                      <option value="pro">Pro — ₹4,999/mo (100,000 msgs, 25 agents)</option>
                      <option value="enterprise">Enterprise — Custom</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {authMode === 'register' ? 'Business Email Address' : 'Email Address or WhatsApp Mobile'}
                </label>
                <input
                  type={authMode === 'register' ? 'email' : 'text'}
                  required
                  placeholder={authMode === 'register' ? 'name@company.com' : 'name@company.com or 10-digit mobile'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="•••••••••••• (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                />
              </div>

              {/* 6-Digit WhatsApp OTP Input (When in Register mode and OTP is triggered) */}
              {authMode === 'register' && otpSent && (
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Enter 6-Digit WhatsApp OTP</span>
                    </label>
                    <button
                      type="button"
                      disabled={otpCooldown > 0 || isSendingOtp}
                      onClick={handleSendOtp}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 disabled:text-slate-500 font-semibold"
                    >
                      {otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : 'Resend Code'}
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="1 2 3 4 5 6"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full px-4 py-3 text-center tracking-[0.5em] text-lg font-mono font-bold bg-slate-950 border-2 border-emerald-500/50 rounded-xl focus:outline-none focus:border-emerald-400 text-white"
                  />
                </div>
              )}

              {/* Action Buttons */}
              {authMode === 'register' && !otpSent ? (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={isSendingOtp}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSendingOtp ? 'Sending OTP to WhatsApp...' : 'Send Verification OTP on WhatsApp'}</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Verifying...'
                      : authMode === 'register'
                      ? 'Verify WhatsApp Code & Create Workspace'
                      : 'Sign In to Workspace'}
                  </span>
                </button>
              )}
            </form>

            <div className="pt-6 text-center text-xs text-slate-400 border-t border-slate-800 mt-6">
              {authMode === 'register' ? (
                <p>
                  Already have an account?{' '}
                  <button
                    onClick={() => { setAuthMode('login'); setAuthError(null); }}
                    className="text-emerald-400 font-bold hover:underline"
                  >
                    Sign In
                  </button>
                </p>
              ) : (
                <p>
                  Need a new workspace?{' '}
                  <button
                    onClick={() => { setAuthMode('register'); setAuthError(null); }}
                    className="text-emerald-400 font-bold hover:underline"
                  >
                    Create Account
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
