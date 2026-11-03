import React, { useState, useEffect, useRef } from 'react';
import { AndroidHeader } from './components/AndroidHeader';
import { AndroidBottomNav } from './components/AndroidBottomNav';
import { ChatList } from './components/Chats/ChatList';
import { ChatWindow } from './components/Chats/ChatWindow';
import { BroadcastManager } from './components/Broadcast/BroadcastManager';
import { TemplateManager } from './components/Templates/TemplateManager';
import { SettingsModal } from './components/Settings/SettingsModal';
import { WhatsAppConnectModal } from './components/SaaS/WhatsAppConnectModal';
import { SuperAdminPanel } from './components/SaaS/SuperAdminPanel';
import { MarketingLandingPage } from './components/SaaS/MarketingLandingPage';
import { MobileAuthScreen } from './components/SaaS/MobileAuthScreen';
import { BillingModal } from './components/SaaS/BillingModal';
import { ContactsManagerModal } from './components/SaaS/ContactsManagerModal';
import { LocalStorageManager } from './utils/storage';
import { usePWAInstall } from './hooks/usePWAInstall';
import { 
  WhatsAppCredentials, 
  Conversation, 
  ChatMessage, 
  WhatsAppTemplate, 
  BroadcastCampaign,
  QuickFile,
  QuickLocationPreset,
  QuickPresetsSettings 
} from './types/whatsapp';
import { WhatsAppApiService } from './services/whatsappApi';
import { waAudio } from './utils/audio';
import { MessageSquare } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(LocalStorageManager.getTheme());
  const [activeTab, setActiveTab] = useState<'chats' | 'broadcast' | 'templates' | 'settings'>('chats');
  const [credentials, setCredentials] = useState<WhatsAppCredentials>(LocalStorageManager.getCredentials());
  const [conversations, setConversations] = useState<Conversation[]>(LocalStorageManager.getConversations());
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(LocalStorageManager.getMessages());
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(LocalStorageManager.getTemplates());
  const [campaigns, setCampaigns] = useState<BroadcastCampaign[]>(LocalStorageManager.getCampaigns());
  const [quickFiles, setQuickFiles] = useState<QuickFile[]>(LocalStorageManager.getQuickFiles());
  const [quickLocations, setQuickLocations] = useState<QuickLocationPreset[]>(LocalStorageManager.getQuickLocations());
  const [quickSettings, setQuickSettings] = useState<QuickPresetsSettings>(LocalStorageManager.getQuickSettings());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Multi-Tenant SaaS State
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);
  const [isSuperAdminOpen, setIsSuperAdminOpen] = useState<boolean>(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState<boolean>(false);
  const [isContactsModalOpen, setIsContactsModalOpen] = useState<boolean>(false);
  const [saasToken, setSaasToken] = useState<string>(localStorage.getItem('whatchat_saas_token') || '');
  const [saasUser, setSaasUser] = useState<any>(null);
  const [saasTenant, setSaasTenant] = useState<any>(null);
  const [activeChannel, setActiveChannel] = useState<any>(null);

  const { isInstallable, isInstalled, install: installPWA } = usePWAInstall();

  // Sync tenant & active channel on mount or token change
  useEffect(() => {
    fetch('/api/auth/me', {
      headers: saasToken ? { Authorization: `Bearer ${saasToken}` } : {}
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          if (data.user) setSaasUser(data.user);
          if (data.tenant) setSaasTenant(data.tenant);
          if (data.activeChannel) {
            setActiveChannel(data.activeChannel);
            setCredentials((prev) => ({
              ...prev,
              accessToken: data.activeChannel.access_token || prev.accessToken,
              phoneNumberId: data.activeChannel.phone_number_id || prev.phoneNumberId,
              wabaId: data.activeChannel.waba_id || prev.wabaId,
              displayPhoneNumber: data.activeChannel.display_phone_number || prev.displayPhoneNumber,
              verifiedName: data.activeChannel.verified_name || prev.verifiedName
            }));
          }
        }
      })
      .catch(() => {});
  }, [saasToken]);

  // Theme synchronization with HTML tag
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    LocalStorageManager.saveTheme(theme);
  }, [theme]);

  // Save changes to localStorage and backend
  const handleSaveCredentials = (creds: WhatsAppCredentials) => {
    setCredentials(creds);
    LocalStorageManager.saveCredentials(creds);
    fetch('/api/whatsapp/save-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    }).catch(() => {});
  };

  // Sync server-persisted credentials on mount
  useEffect(() => {
    fetch('/api/whatsapp/credentials')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.credentials && data.credentials.accessToken) {
          setCredentials((prev) => {
            if (!prev.accessToken) {
              const merged = { ...prev, ...data.credentials };
              LocalStorageManager.saveCredentials(merged);
              return merged;
            }
            return prev;
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveConversations = (newConvs: Conversation[]) => {
    setConversations(newConvs);
    LocalStorageManager.saveConversations(newConvs);
  };

  const handleSaveMessages = (newMessages: Record<string, ChatMessage[]>) => {
    setMessages(newMessages);
    LocalStorageManager.saveMessages(newMessages);
  };

  const handleSaveTemplates = (newTemplates: WhatsAppTemplate[]) => {
    setTemplates(newTemplates);
    LocalStorageManager.saveTemplates(newTemplates);
  };

  const handleSaveCampaign = (campaign: BroadcastCampaign) => {
    const updated = [campaign, ...campaigns];
    setCampaigns(updated);
    LocalStorageManager.saveCampaigns(updated);
  };

  const handleUpdateCampaign = (campaign: BroadcastCampaign) => {
    const updated = campaigns.map((c) => (c.id === campaign.id ? campaign : c));
    setCampaigns(updated);
    LocalStorageManager.saveCampaigns(updated);
  };

  // Quick Files Handlers (max 10 per category)
  const handleAddQuickFile = (file: Omit<QuickFile, 'id' | 'createdAt' | 'orderIndex'>) => {
    const res = LocalStorageManager.addQuickFile(file);
    if (res.success) {
      setQuickFiles(LocalStorageManager.getQuickFiles());
      waAudio.playReceived();
    } else if (res.error) {
      alert(res.error);
    }
  };

  const handleRenameQuickFile = (id: string, newName: string) => {
    const updated = LocalStorageManager.renameQuickFile(id, newName);
    setQuickFiles([...updated]);
  };

  const handleDeleteQuickFile = (id: string) => {
    const updated = LocalStorageManager.removeQuickFile(id);
    setQuickFiles([...updated]);
  };

  const handleReorderQuickFiles = (category: 'audio' | 'document' | 'image' | 'video', fromIndex: number, toIndex: number) => {
    const updated = LocalStorageManager.reorderQuickFiles(category, fromIndex, toIndex);
    setQuickFiles([...updated]);
  };

  // Quick Multi-Branch Locations Handlers (max 10)
  const handleAddLocation = (loc: Omit<QuickLocationPreset, 'id' | 'orderIndex'>) => {
    const res = LocalStorageManager.addQuickLocation(loc);
    if (res.success) {
      setQuickLocations(LocalStorageManager.getQuickLocations());
      waAudio.playReceived();
    } else if (res.error) {
      alert(res.error);
    }
  };

  const handleDeleteLocation = (id: string) => {
    const updated = LocalStorageManager.removeQuickLocation(id);
    setQuickLocations([...updated]);
  };

  const handleReorderLocations = (fromIndex: number, toIndex: number) => {
    const updated = LocalStorageManager.reorderQuickLocations(fromIndex, toIndex);
    setQuickLocations([...updated]);
  };

  const handleSaveQuickSettings = (settings: QuickPresetsSettings) => {
    setQuickSettings(settings);
    LocalStorageManager.saveQuickSettings(settings);
  };

  const handleResetDemoData = () => {
    const freshMessages = LocalStorageManager.resetDemoMessages();
    const freshConvs = LocalStorageManager.getConversations();
    const freshQuick = LocalStorageManager.getQuickFiles();
    const freshLocs = LocalStorageManager.getQuickLocations();
    setMessages(freshMessages);
    setConversations(freshConvs);
    setQuickFiles(freshQuick);
    setQuickLocations(freshLocs);
    setActiveConversationId(null);
    waAudio.playReceived();
  };

  // Toggle theme
  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Append new chat message
  const handleSendMessage = (msg: ChatMessage) => {
    const convId = msg.conversationId;
    setMessages((prev) => {
      const currentList = prev[convId] || [];
      const updatedList = [...currentList, msg];
      const updatedMessages = {
        ...prev,
        [convId]: updatedList
      };
      LocalStorageManager.saveMessages(updatedMessages);
      return updatedMessages;
    });

    setConversations((prev) => {
      const updatedConversations = prev.map((c) => {
        if (c.id === convId) {
          return {
            ...c,
            lastMessage: msg,
            updatedAt: Date.now()
          };
        }
        return c;
      });
      // Move active conversation to top
      const idx = updatedConversations.findIndex((c) => c.id === convId);
      if (idx > 0) {
        const [target] = updatedConversations.splice(idx, 1);
        updatedConversations.unshift(target);
      }
      LocalStorageManager.saveConversations(updatedConversations);
      return updatedConversations;
    });
  };

  // Update status of sent message (sent, delivered, read, failed)
  const handleUpdateMessageStatus = (msgId: string, status: ChatMessage['status'], metaId?: string) => {
    setMessages((prev) => {
      const copy = { ...prev };
      let changed = false;
      for (const convId in copy) {
        const list = copy[convId];
        const idx = list.findIndex((m) => m.id === msgId || (metaId && m.metaMessageId === metaId));
        if (idx !== -1) {
          list[idx] = {
            ...list[idx],
            status,
            metaMessageId: metaId || list[idx].metaMessageId
          };
          copy[convId] = [...list];
          changed = true;
          break;
        }
      }
      if (changed) {
        LocalStorageManager.saveMessages(copy);
      }
      return copy;
    });
  };

  // Start new conversation
  const handleNewChat = (phoneNumber: string, name: string) => {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const existing = conversations.find(
      (c) => c.phoneNumber.replace(/[^0-9]/g, '') === cleanNumber
    );

    if (existing) {
      setActiveConversationId(existing.id);
      setActiveTab('chats');
      return;
    }

    const colors = ['#008069', '#128C7E', '#25D366', '#075E54', '#34B7F1'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newConv: Conversation = {
      id: `conv_${cleanNumber || Date.now()}`,
      phoneNumber: phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`,
      name: name || phoneNumber,
      avatarColor: randomColor,
      unreadCount: 0,
      updatedAt: Date.now()
    };

    setConversations((prev) => {
      const updated = [newConv, ...prev];
      LocalStorageManager.saveConversations(updated);
      return updated;
    });
    setActiveConversationId(newConv.id);
    setActiveTab('chats');
  };

  // Set of processed event IDs to prevent duplicate chat bubble insertion
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // Initialize known message IDs on startup
  useEffect(() => {
    const ids = new Set<string>();
    Object.values(messages).forEach((list) => {
      list.forEach((m) => {
        if (m.id) ids.add(m.id);
        if (m.metaMessageId) ids.add(m.metaMessageId);
      });
    });
    processedEventIdsRef.current = ids;
  }, []);

  // Ingest incoming webhook event atomically
  const ingestIncomingWebhookEvent = (ev: any) => {
    if (ev.type === 'message') {
      const msgData = ev.data;
      const senderPhone = String(msgData.from || '').trim();
      const cleanSender = senderPhone.replace(/[^0-9]/g, '');
      if (!cleanSender) return;

      const formattedPhone = senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`;
      const senderName = msgData.contactName || formattedPhone;

      // Extract message type and payload
      let type: ChatMessage['type'] = 'text';
      let text = msgData.text?.body || '';
      let mediaUrl: string | undefined = undefined;
      let fileName: string | undefined = undefined;
      let locationData: any = undefined;

      if (msgData.type === 'image') {
        type = 'image';
        text = msgData.image?.caption || '';
        mediaUrl = msgData.image?.url || (msgData.image?.id ? `/api/whatsapp/media/${msgData.image.id}` : undefined);
      } else if (msgData.type === 'video') {
        type = 'video';
        text = msgData.video?.caption || '';
        mediaUrl = msgData.video?.url || (msgData.video?.id ? `/api/whatsapp/media/${msgData.video.id}` : undefined);
      } else if (msgData.type === 'audio') {
        type = 'audio';
        text = msgData.audio?.caption || 'Voice message';
        mediaUrl = msgData.audio?.url || (msgData.audio?.id ? `/api/whatsapp/media/${msgData.audio.id}` : undefined);
      } else if (msgData.type === 'document') {
        type = 'document';
        text = msgData.document?.caption || msgData.document?.filename || 'Document';
        fileName = msgData.document?.filename;
        mediaUrl = msgData.document?.url || (msgData.document?.id ? `/api/whatsapp/media/${msgData.document.id}` : undefined);
      } else if (msgData.type === 'location') {
        type = 'location';
        const loc = msgData.location;
        text = `${loc?.name ? loc.name + ' - ' : ''}${loc?.address || ''} (${loc?.latitude}, ${loc?.longitude})`;
        locationData = {
          name: loc?.name || 'Shared Location',
          address: loc?.address || `${loc?.latitude}, ${loc?.longitude}`,
          latitude: loc?.latitude,
          longitude: loc?.longitude
        };
      } else if (!text && msgData.caption) {
        text = msgData.caption;
      } else if (!text) {
        text = 'New incoming message';
      }

      const msgId = msgData.id || `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      setConversations((prevConvs) => {
        const existing = prevConvs.find(
          (c) => c.phoneNumber.replace(/[^0-9]/g, '') === cleanSender
        );

        const convId = existing ? existing.id : `conv_${cleanSender}`;

        const incomingMsg: ChatMessage = {
          id: msgId,
          metaMessageId: msgData.id,
          conversationId: convId,
          fromMe: false,
          type,
          text,
          mediaUrl,
          filename: fileName,
          location: locationData,
          timestamp: ev.timestamp || (parseInt(msgData.timestamp || '0', 10) * 1000) || Date.now(),
          status: 'read'
        };

        // Atomically update messages for this conversation
        setMessages((prevMsgs) => {
          const list = prevMsgs[convId] || [];
          if (list.some((m) => m.id === msgId || (msgData.id && m.metaMessageId === msgData.id))) {
            return prevMsgs;
          }
          const updated = {
            ...prevMsgs,
            [convId]: [...list, incomingMsg]
          };
          LocalStorageManager.saveMessages(updated);
          return updated;
        });

        let updatedConvs: Conversation[];
        if (!existing) {
          const colors = ['#008069', '#128C7E', '#25D366', '#075E54', '#34B7F1'];
          const randomColor = colors[Math.floor(Math.random() * colors.length)];
          const newConv: Conversation = {
            id: convId,
            phoneNumber: formattedPhone,
            name: senderName,
            avatarColor: randomColor,
            unreadCount: 1,
            updatedAt: incomingMsg.timestamp,
            lastMessage: incomingMsg
          };
          updatedConvs = [newConv, ...prevConvs];
        } else {
          updatedConvs = prevConvs.map((c) => {
            if (c.id === convId) {
              return {
                ...c,
                name: senderName !== formattedPhone && senderName ? senderName : c.name,
                unreadCount: (c.unreadCount || 0) + 1,
                updatedAt: incomingMsg.timestamp,
                lastMessage: incomingMsg
              };
            }
            return c;
          });
          // Float active conversation to top of list
          const idx = updatedConvs.findIndex((c) => c.id === convId);
          if (idx > 0) {
            const [target] = updatedConvs.splice(idx, 1);
            updatedConvs.unshift(target);
          }
        }

        LocalStorageManager.saveConversations(updatedConvs);
        return updatedConvs;
      });

      waAudio.playReceived();
      waAudio.vibrate([30, 60]);
    } else if (ev.type === 'status') {
      const statusData = ev.data;
      if (statusData.id && statusData.status) {
        handleUpdateMessageStatus(statusData.id, statusData.status);
      }
    }
  };

  // Real-time instant push notifications via Server-Sent Events (SSE) - No polling!
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isUnmounted = false;
    let retryTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      if (isUnmounted) return;

      try {
        const sseUrl = saasToken
          ? `/api/whatsapp/events?token=${encodeURIComponent(saasToken)}`
          : '/api/whatsapp/events';
        eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
          console.log('[SSE] Real-time stream connected to server');
        };

        eventSource.onmessage = (event) => {
          if (isUnmounted || !event.data) return;
          try {
            const parsed = JSON.parse(event.data);
            if (!parsed) return;

            // Backlog of recent events on initial connection
            if (parsed.type === 'backlog' && Array.isArray(parsed.events)) {
              const sorted = [...parsed.events].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
              for (const ev of sorted) {
                if (!ev || !ev.id) continue;
                if (processedEventIdsRef.current.has(ev.id)) continue;
                processedEventIdsRef.current.add(ev.id);
                ingestIncomingWebhookEvent(ev);
              }
              return;
            }

            // Connection handshake or keepalive ping
            if (parsed.type === 'connected') return;

            // Instant live event pushed from Meta webhook
            if (parsed.id) {
              if (processedEventIdsRef.current.has(parsed.id)) return;
              processedEventIdsRef.current.add(parsed.id);
              ingestIncomingWebhookEvent(parsed);
            }
          } catch (err) {
            console.warn('[SSE] Error processing incoming event:', err);
          }
        };

        eventSource.onerror = (err) => {
          console.warn('[SSE] Connection interrupted, browser will auto-reconnect', err);
        };
      } catch (err) {
        console.error('[SSE] Failed to initialize EventSource:', err);
        if (!isUnmounted) {
          retryTimeout = setTimeout(connectSSE, 3000);
        }
      }
    };

    connectSSE();

    return () => {
      isUnmounted = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, [saasToken]);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const activeConvMessages = activeConversationId ? messages[activeConversationId] || [] : [];
  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  // Visible on mobile ONLY when on main tab pages so it never covers the chat input bar
  const showMobileBottomNav = activeTab !== 'chats' || !activeConversationId;

  // Responsive screen check: Web Form (Desktop >= 1024px) vs Mobile/Tablet views (< 1024px)
  const [isMobileOrTab, setIsMobileOrTab] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileOrTab(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Controls whether user has entered the active workspace
  // On startup:
  // - Web Form (desktop/laptop >= 1024px) starts on Home Page (MarketingLandingPage)
  // - Mobile / Tablet views (< 1024px) start on Login Page (MobileAuthScreen)
  const [hasEnteredApp, setHasEnteredApp] = useState<boolean>(false);
  const [forceDesktopLanding, setForceDesktopLanding] = useState<boolean>(false);

  const handleLogout = () => {
    localStorage.removeItem('whatchat_saas_token');
    setSaasToken('');
    setSaasTenant(null);
    setSaasUser(null);
    setActiveConversationId(null);
    setHasEnteredApp(false);
    setForceDesktopLanding(false);
  };

  // Determine if active user possesses Super Admin privileges
  const isSuperAdmin = saasUser?.role === 'super_admin' || Boolean(localStorage.getItem('whatchat_admin_token'));

  // IF AT INITIAL START, NOT ENTERED, NOT AUTHENTICATED, OR LANDING PAGE REQUESTED:
  if (!hasEnteredApp || !saasToken || forceDesktopLanding) {
    // 1. Mobile or Tablet view at start -> Show Login Page (MobileAuthScreen)
    if (isMobileOrTab && !forceDesktopLanding) {
      return (
        <>
          <MobileAuthScreen
            onSuccess={(authData) => {
              if (authData?.token) {
                setSaasToken(authData.token);
                setSaasTenant(authData.tenant);
              }
              setHasEnteredApp(true);
            }}
            onOpenSuperAdmin={() => setIsSuperAdminOpen(true)}
            onOpenDesktopLanding={() => setForceDesktopLanding(true)}
          />
          <SuperAdminPanel
            isOpen={isSuperAdminOpen}
            onClose={() => setIsSuperAdminOpen(false)}
            token={saasToken}
          />
        </>
      );
    }

    // 2. Web Form (Desktop >= 1024px) at start -> Show Home Page (MarketingLandingPage)
    return (
      <>
        <MarketingLandingPage
          isLoggedIn={Boolean(saasToken)}
          onEnterApp={(authData) => {
            if (authData?.token) {
              setSaasToken(authData.token);
              setSaasTenant(authData.tenant);
            }
            setHasEnteredApp(true);
            setForceDesktopLanding(false);
          }}
          onOpenSuperAdmin={() => {
            setIsSuperAdminOpen(true);
          }}
        />
        <SuperAdminPanel
          isOpen={isSuperAdminOpen}
          onClose={() => setIsSuperAdminOpen(false)}
          token={saasToken}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#0B141A] text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <AndroidHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        credentials={credentials}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onOpenSettings={() => setActiveTab('settings')}
        onOpenSuperAdmin={isSuperAdmin ? () => setIsSuperAdminOpen(true) : undefined}
        onOpenLanding={() => { setHasEnteredApp(false); setForceDesktopLanding(true); }}
        onLogout={handleLogout}
        isInstallable={isInstallable}
        onInstallPWA={installPWA}
      />

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {/* 1. CHATS TAB */}
        {activeTab === 'chats' && (
          <div className="flex-1 min-h-0 flex flex-row overflow-hidden w-full h-full">
            {/* Left Column: Chat List */}
            <div
              className={`h-full flex-col min-h-0 ${
                activeConversationId ? 'hidden md:flex md:w-80 lg:w-96 shrink-0' : 'flex w-full'
              }`}
            >
              <ChatList
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSelectConversation={(id) => {
                  setActiveConversationId(id);
                  const updated = conversations.map((c) =>
                    c.id === id ? { ...c, unreadCount: 0 } : c
                  );
                  handleSaveConversations(updated);
                }}
                onNewChat={handleNewChat}
              />
            </div>

            {/* Right Column: Chat Window */}
            <div
              className={`h-full min-h-0 flex-1 flex flex-col overflow-hidden ${
                activeConversationId ? 'flex w-full' : 'hidden md:flex'
              }`}
            >
              {activeConv ? (
                <ChatWindow
                  conversation={activeConv}
                  messages={activeConvMessages}
                  credentials={credentials}
                  templates={templates}
                  quickFiles={quickFiles}
                  quickLocations={quickLocations}
                  quickSettings={quickSettings}
                  onBack={() => setActiveConversationId(null)}
                  onSendMessage={handleSendMessage}
                  onUpdateMessageStatus={handleUpdateMessageStatus}
                  onResetDemoData={handleResetDemoData}
                  onAddQuickFile={handleAddQuickFile}
                  onRenameQuickFile={handleRenameQuickFile}
                  onDeleteQuickFile={handleDeleteQuickFile}
                  onReorderQuickFiles={handleReorderQuickFiles}
                  onAddLocation={handleAddLocation}
                  onDeleteLocation={handleDeleteLocation}
                  onReorderLocations={handleReorderLocations}
                  onOpenSettings={() => setActiveTab('settings')}
                />
              ) : (
                <div className="hidden md:flex flex-col items-center justify-center h-full w-full bg-[#F0F2F5] dark:bg-[#111B21] text-center p-8 select-none">
                  <div className="w-16 h-16 rounded-full bg-[#008069]/10 dark:bg-[#008069]/20 flex items-center justify-center text-[#008069] dark:text-[#25D366] mb-4">
                    <MessageSquare className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                    WhatsApp Cloud Messaging
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    Select a customer conversation from the left or tap the plus button to start a new chat.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. BROADCAST TAB */}
        {activeTab === 'broadcast' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <BroadcastManager
              campaigns={campaigns}
              templates={templates}
              credentials={credentials}
              onSaveCampaign={handleSaveCampaign}
              onUpdateCampaign={handleUpdateCampaign}
            />
          </div>
        )}

        {/* 3. TEMPLATES TAB */}
        {activeTab === 'templates' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TemplateManager
              templates={templates}
              credentials={credentials}
              onSaveTemplates={handleSaveTemplates}
              onSelectTemplateForChat={(tpl) => {
                setActiveTab('chats');
              }}
            />
          </div>
        )}

        {/* 4. SETTINGS & API CONFIG TAB */}
        {activeTab === 'settings' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <SettingsModal
              credentials={credentials}
              onSaveCredentials={handleSaveCredentials}
              quickSettings={quickSettings}
              onSaveQuickSettings={handleSaveQuickSettings}
              isInstallable={isInstallable}
              onInstallPWA={installPWA}
              isInstalled={isInstalled}
              onResetDemoData={handleResetDemoData}
              tenant={saasTenant}
              onOpenConnectModal={() => setIsConnectModalOpen(true)}
              onOpenBilling={() => setIsBillingModalOpen(true)}
              onOpenContacts={() => setIsContactsModalOpen(true)}
              onOpenSuperAdmin={isSuperAdmin ? () => setIsSuperAdminOpen(true) : undefined}
              onLogout={handleLogout}
            />
          </div>
        )}
      </main>

      {/* Android Bottom Navigation Bar
          Shown on mobile ONLY when on main tab pages so it NEVER covers the chat input bar! */}
      {showMobileBottomNav && (
        <div className="md:hidden shrink-0 z-30">
          <AndroidBottomNav
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
            }}
            unreadCount={totalUnread}
          />
        </div>
      )}
      {/* SaaS Dual WhatsApp Connection Modal */}
      <WhatsAppConnectModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        token={saasToken}
        activeChannel={activeChannel}
        onSuccess={() => {
          fetch('/api/auth/me', {
            headers: saasToken ? { Authorization: `Bearer ${saasToken}` } : {}
          })
            .then((r) => r.json())
            .then((data) => {
              if (data.success && data.activeChannel) {
                setActiveChannel(data.activeChannel);
                setCredentials((prev) => ({
                  ...prev,
                  accessToken: data.activeChannel.access_token || prev.accessToken,
                  phoneNumberId: data.activeChannel.phone_number_id || prev.phoneNumberId,
                  wabaId: data.activeChannel.waba_id || prev.wabaId,
                  displayPhoneNumber: data.activeChannel.display_phone_number || prev.displayPhoneNumber,
                  verifiedName: data.activeChannel.verified_name || prev.verifiedName
                }));
              }
            });
        }}
      />

      {/* Super Admin Console */}
      <SuperAdminPanel
        isOpen={isSuperAdminOpen}
        onClose={() => setIsSuperAdminOpen(false)}
        token={saasToken}
      />

      {/* Indian Market Subscription & GST Billing Modal */}
      <BillingModal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
        token={saasToken}
        tenant={saasTenant}
        onPlanUpdated={(updated) => {
          setSaasTenant((prev: any) => ({
            ...prev,
            plan: updated.plan,
            monthlyQuota: updated.monthlyQuota
          }));
        }}
      />

      {/* CRM Contacts & Customer Segmentation Modal */}
      <ContactsManagerModal
        isOpen={isContactsModalOpen}
        onClose={() => setIsContactsModalOpen(false)}
        token={saasToken}
        onStartChat={(phone, name) => {
          handleNewChat(phone, name || phone);
          setActiveTab('chats');
        }}
      />
    </div>
  );
}
