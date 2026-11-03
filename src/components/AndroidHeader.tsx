import React, { useState, useRef, useEffect } from 'react';
import {
  MoreVertical,
  Shield,
  Globe,
  Sun,
  Moon,
  Smartphone,
  LogOut,
  MessageSquare,
  Send,
  FileCode,
  Settings
} from 'lucide-react';
import { WhatsAppCredentials } from '../types/whatsapp';

interface AndroidHeaderProps {
  activeTab: 'chats' | 'broadcast' | 'templates' | 'settings';
  setActiveTab: (tab: 'chats' | 'broadcast' | 'templates' | 'settings') => void;
  credentials: WhatsAppCredentials;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  isInstallable?: boolean;
  onInstallPWA?: () => void;
  onOpenSuperAdmin?: () => void;
  onOpenLanding?: () => void;
  onLogout?: () => void;
}

export const AndroidHeader: React.FC<AndroidHeaderProps> = ({
  activeTab,
  setActiveTab,
  credentials,
  theme,
  onToggleTheme,
  onOpenSettings,
  isInstallable,
  onInstallPWA,
  onOpenSuperAdmin,
  onOpenLanding,
  onLogout
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const connectedName = credentials.verifiedName || credentials.displayPhoneNumber || (credentials.accessToken && credentials.phoneNumberId ? 'WhatsApp Connected' : 'Not Connected');

  return (
    <header className="sticky top-0 z-30 bg-[#008069] dark:bg-[#1F2C34] text-white shadow-md transition-colors select-none shrink-0">
      {/* Top App Bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 h-14">
        
        {/* LEFT: ONLY "WhatChat" AND CONNECTED ACCOUNT'S NAME FROM META */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex flex-col justify-center min-w-0">
            <h1 className="text-base sm:text-lg font-bold tracking-tight leading-none text-white">
              WhatChat
            </h1>
            <span className="text-[11px] text-white/80 truncate max-w-[170px] sm:max-w-[260px] mt-0.5 font-medium">
              {connectedName}
            </span>
          </div>
        </div>

        {/* CENTER: DESKTOP ONLY NAVIGATION TABS */}
        <nav className="hidden md:flex items-center gap-1 bg-black/10 dark:bg-white/5 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'chats'
                ? 'bg-white text-[#008069] shadow-xs'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chats</span>
          </button>
          <button
            onClick={() => setActiveTab('broadcast')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'broadcast'
                ? 'bg-white text-[#008069] shadow-xs'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Broadcast</span>
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'templates'
                ? 'bg-white text-[#008069] shadow-xs'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Templates</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'settings'
                ? 'bg-white text-[#008069] shadow-xs'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </nav>

        {/* RIGHT: THEME TOGGLE & THREE DOT (⋮) MENU */}
        <div className="flex items-center gap-1">
          {/* Quick 1-tap Theme Switcher (Dark <-> Light) on Chat Page Home */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 active:bg-white/25 transition-colors text-white"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-300 transition-transform active:rotate-45" />
            ) : (
              <Moon className="w-5 h-5 transition-transform active:-rotate-45" />
            )}
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label="More options"
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/15 active:bg-white/25 transition-colors text-white"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

          {/* Three-Dot Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute right-0 top-12 w-56 bg-white dark:bg-[#233138] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 z-50 text-slate-800 dark:text-slate-100 font-sans text-xs animate-in fade-in zoom-in-95 duration-150">
              {onOpenSuperAdmin && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenSuperAdmin();
                  }}
                  className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors font-medium text-purple-600 dark:text-purple-400"
                >
                  <Shield className="w-4 h-4" />
                  <span>Super Admin Console</span>
                </button>
              )}

              {onOpenLanding && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenLanding();
                  }}
                  className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors font-medium"
                >
                  <Globe className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>Product Website & Pricing</span>
                </button>
              )}

              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onToggleTheme();
                }}
                className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors font-medium"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-slate-600" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>

              {isInstallable && onInstallPWA && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onInstallPWA();
                  }}
                  className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors font-medium text-emerald-600 dark:text-emerald-400"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Install Android App</span>
                </button>
              )}

              {onLogout && (
                <>
                  <div className="h-px bg-slate-200 dark:bg-slate-700 my-1.5" />
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 transition-colors font-semibold"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out of Workspace</span>
                  </button>
                </>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </header>
  );
};
