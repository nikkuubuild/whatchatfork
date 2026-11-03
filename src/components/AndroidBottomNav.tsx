import React from 'react';
import { MessageSquare, Send, FileCode, Sliders } from 'lucide-react';

interface AndroidBottomNavProps {
  activeTab: 'chats' | 'broadcast' | 'templates' | 'settings';
  setActiveTab: (tab: 'chats' | 'broadcast' | 'templates' | 'settings') => void;
  unreadCount?: number;
}

export const AndroidBottomNav: React.FC<AndroidBottomNavProps> = ({
  activeTab,
  setActiveTab,
  unreadCount = 0
}) => {
  const tabs = [
    {
      id: 'chats' as const,
      label: 'Chats',
      icon: MessageSquare,
      badge: unreadCount > 0 ? unreadCount : null
    },
    {
      id: 'broadcast' as const,
      label: 'Broadcast',
      icon: Send,
      badge: null
    },
    {
      id: 'templates' as const,
      label: 'Templates',
      icon: FileCode,
      badge: null
    },
    {
      id: 'settings' as const,
      label: 'API & Config',
      icon: Sliders,
      badge: null
    }
  ];

  return (
    <nav className="relative w-full z-30 bg-white dark:bg-[#1F2C34] border-t border-slate-200 dark:border-slate-800 transition-colors shadow-lg select-none">
      <div className="max-w-md mx-auto grid grid-cols-4 h-16 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center min-h-[48px] py-1 transition-all ${
                isActive
                  ? 'text-[#008069] dark:text-[#25D366]'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <div
                  className={`px-4 py-1 rounded-full transition-all ${
                    isActive ? 'bg-[#D9FDD3] dark:bg-[#005C4B]/50' : 'bg-transparent'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
                </div>
                {tab.badge && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] text-[10px] font-bold text-center text-white bg-[#25D366] rounded-full shadow-sm animate-in fade-in">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] font-medium tracking-tight mt-0.5 ${
                  isActive ? 'font-bold' : ''
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
