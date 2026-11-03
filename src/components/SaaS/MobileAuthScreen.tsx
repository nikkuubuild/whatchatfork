import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Shield,
  Check,
  AlertCircle,
  ArrowRight,
  Lock,
  Mail,
  Building,
  Phone,
  Send,
  CheckCircle2
} from 'lucide-react';

interface MobileAuthScreenProps {
  onSuccess: (authData: { token: string; user: any; tenant: any }) => void;
  onOpenSuperAdmin: () => void;
  onOpenDesktopLanding?: () => void;
}

export const MobileAuthScreen: React.FC<MobileAuthScreenProps> = ({
  onSuccess,
  onOpenSuperAdmin,
  onOpenDesktopLanding
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
  const [error, setError] = useState<string | null>(null);

  // Rate limiter countdown timer
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
      setError('Please enter a valid 10-digit WhatsApp mobile number.');
      return;
    }
    if (!businessName.trim()) {
      setError('Please enter your full name or business name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid business email.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters in length.');
      return;
    }

    setIsSendingOtp(true);
    setError(null);
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
        setOtpMessage(data.message || `Verification code sent to WhatsApp +${data.normalizedPhone || cleanMobile}`);
      } else {
        setError(data.error || 'Failed to send WhatsApp verification code.');
        if (data.cooldownSeconds) {
          setOtpCooldown(data.cooldownSeconds);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Network error requesting OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (!otpSent) {
        return handleSendOtp();
      }

      if (!otp || otp.trim().length !== 6) {
        setError('Please enter the 6-digit WhatsApp verification code.');
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
          onSuccess({ token: data.token, user: data.user, tenant: data.tenant });
        } else {
          setError(data.error || 'Registration failed. Please check code.');
        }
      } catch (err: any) {
        setError(err?.message || 'Network error completing registration.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Login Mode (Email or WhatsApp Mobile Number)
      if (!email.trim() || !password) {
        setError('Please enter your email or WhatsApp mobile and password.');
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
          onSuccess({ token: data.token, user: data.user, tenant: data.tenant });
        } else {
          setError(data.error || 'Invalid credentials. Please verify your email or mobile and password.');
        }
      } catch (err: any) {
        setError(err?.message || 'Network error connecting to server.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#111B21] text-white flex flex-col justify-between p-4 sm:p-6 font-sans select-none">
      {/* Top Header Branding */}
      <div className="pt-6 pb-2 text-center space-y-2">
        <div className="w-14 h-14 mx-auto rounded-3xl bg-gradient-to-tr from-[#008069] to-[#25D366] p-0.5 shadow-xl shadow-emerald-500/20">
          <div className="w-full h-full bg-[#111B21] rounded-[22px] flex items-center justify-center">
            <MessageSquare className="w-7 h-7 text-[#25D366]" />
          </div>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-1">
            WhatChat<span className="text-[#25D366]">.online</span>
          </h1>
          <p className="text-[11px] text-slate-400 font-medium">
            WhatsApp Multi-Tenant Business SaaS
          </p>
        </div>
      </div>

      {/* Auth Card */}
      <div className="bg-[#1F2C34] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-w-sm mx-auto w-full my-auto">
        {/* Toggle Mode */}
        <div className="grid grid-cols-2 p-1 bg-[#111B21] rounded-2xl border border-slate-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); setOtpMessage(null); }}
            className={`py-2 rounded-xl transition-all ${
              mode === 'login' ? 'bg-[#008069] text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); setOtpMessage(null); }}
            className={`py-2 rounded-xl transition-all ${
              mode === 'register' ? 'bg-[#008069] text-white shadow-xs' : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {otpMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{otpMessage}</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Name / Business Name</label>
                <div className="relative">
                  <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul / Apex Corp"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-[#111B21] border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-[#25D366]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">WhatsApp Mobile Number</label>
                <div className="flex gap-2">
                  <div className="px-3 py-2 bg-[#111B21] border border-slate-700 rounded-xl font-bold text-slate-400 flex items-center shrink-0">
                    +91
                  </div>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="9876543210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/[^0-9]/g, ''))}
                    className="flex-1 px-3 py-2 bg-[#111B21] border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#25D366]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select Subscription Plan</label>
                <select
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  className="w-full px-3 py-2 bg-[#111B21] border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-[#25D366] font-medium"
                >
                  <option value="starter">Starter — ₹999/mo (5,000 msgs, 2 agents)</option>
                  <option value="growth">Growth — ₹2,499/mo (30,000 msgs, coexistence)</option>
                  <option value="pro">Pro — ₹4,999/mo (100,000 msgs, 25 agents)</option>
                  <option value="enterprise">Enterprise — Custom</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              {mode === 'register' ? 'Business Email Address' : 'Email Address or WhatsApp Mobile'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={mode === 'register' ? 'email' : 'text'}
                required
                placeholder={mode === 'register' ? 'name@business.com' : 'Email or 10-digit mobile'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#111B21] border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-[#25D366]"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="•••••••••••• (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#111B21] border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-[#25D366]"
              />
            </div>
          </div>

          {/* 6-Digit WhatsApp OTP Input (When in Register mode and OTP is triggered) */}
          {mode === 'register' && otpSent && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#25D366] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Enter 6-Digit WhatsApp OTP</span>
                </label>
                <button
                  type="button"
                  disabled={otpCooldown > 0 || isSendingOtp}
                  onClick={handleSendOtp}
                  className="text-[11px] text-[#25D366] hover:underline disabled:text-slate-500 font-semibold"
                >
                  {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend Code'}
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="1 2 3 4 5 6"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full px-3 py-2.5 text-center tracking-[0.5em] text-lg font-mono font-bold bg-[#111B21] border-2 border-[#25D366]/50 rounded-xl focus:outline-none focus:border-[#25D366] text-white"
              />
            </div>
          )}

          {/* Action Buttons */}
          {mode === 'register' && !otpSent ? (
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={isSendingOtp}
              className="w-full py-2.5 mt-1 bg-[#008069] hover:bg-[#00705a] text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isSendingOtp ? 'Sending OTP to WhatsApp...' : 'Send WhatsApp Verification OTP'}</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 mt-1 bg-[#008069] hover:bg-[#00705a] text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>
                {isSubmitting
                  ? 'Verifying...'
                  : mode === 'register'
                  ? 'Verify WhatsApp Code & Create Workspace'
                  : 'Sign In to Workspace'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </form>

        {mode === 'login' && (
          <div className="text-[11px] text-center text-slate-400 pt-1">
            <span>Demo credentials: </span>
            <code className="text-emerald-400 font-mono">owner@example.com / Owner@12345</code>
          </div>
        )}
      </div>

      {/* Bottom Footer Links */}
      <div className="pb-4 pt-4 text-center space-y-2 text-xs text-slate-400">
        <button
          onClick={onOpenSuperAdmin}
          className="inline-flex items-center gap-1.5 text-purple-400 hover:text-purple-300 font-semibold"
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Platform Super Admin Portal</span>
        </button>

        {onOpenDesktopLanding && (
          <div>
            <button
              onClick={onOpenDesktopLanding}
              className="text-slate-400 hover:text-white underline text-[11px]"
            >
              View Desktop Landing Page
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
