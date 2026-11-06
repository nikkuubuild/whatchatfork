import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Phone, 
  Video, 
  MoreVertical, 
  ShieldAlert, 
  AlertCircle,
  RotateCcw,
  Sparkles,
  Zap,
  Building2,
  MapPin,
  KeyRound,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { Conversation, ChatMessage, WhatsAppTemplate, WhatsAppCredentials, QuickFile, QuickLocationPreset, QuickPresetsSettings } from '../../types/whatsapp';
import { MessageBubble } from './MessageBubble';
import { ChatInputBar } from './ChatInputBar';
import { AttachmentSheet } from './AttachmentSheet';
import { MediaViewerModal } from './MediaViewerModal';
import { QuickFilesModal } from './QuickFilesModal';
import { LocationPickerModal } from './LocationPickerModal';
import { WhatsAppApiService } from '../../services/whatsappApi';
import { waAudio } from '../../utils/audio';

interface ChatWindowProps {
  conversation: Conversation;
  messages: ChatMessage[];
  credentials: WhatsAppCredentials;
  templates: WhatsAppTemplate[];
  quickFiles: QuickFile[];
  quickLocations: QuickLocationPreset[];
  quickSettings: QuickPresetsSettings;
  onBack: () => void;
  onSendMessage: (msg: ChatMessage) => void;
  onUpdateMessageStatus: (msgId: string, status: ChatMessage['status'], metaId?: string) => void;
  onResetDemoData?: () => void;
  onAddQuickFile: (file: Omit<QuickFile, 'id' | 'createdAt' | 'orderIndex'>) => void;
  onRenameQuickFile: (id: string, newName: string) => void;
  onDeleteQuickFile: (id: string) => void;
  onReorderQuickFiles: (category: 'audio' | 'document' | 'image' | 'video', fromIndex: number, toIndex: number) => void;
  onAddLocation: (loc: Omit<QuickLocationPreset, 'id' | 'orderIndex'>) => void;
  onDeleteLocation: (id: string) => void;
  onReorderLocations: (fromIndex: number, toIndex: number) => void;
  onOpenSettings?: () => void;
  onSaveCredentials?: (creds: WhatsAppCredentials) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  messages,
  credentials,
  templates,
  quickFiles,
  quickLocations,
  quickSettings,
  onBack,
  onSendMessage,
  onUpdateMessageStatus,
  onResetDemoData,
  onAddQuickFile,
  onRenameQuickFile,
  onDeleteQuickFile,
  onReorderQuickFiles,
  onAddLocation,
  onDeleteLocation,
  onReorderLocations,
  onOpenSettings,
  onSaveCredentials
}) => {
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTokenExpired, setIsTokenExpired] = useState(false);
  const [showQuickTokenModal, setShowQuickTokenModal] = useState(false);
  const [quickTokenInput, setQuickTokenInput] = useState('');
  const [isUpdatingToken, setIsUpdatingToken] = useState(false);
  const [tokenUpdateError, setTokenUpdateError] = useState<string | null>(null);

  // Quick Files Drawer State
  const [isQuickFilesOpen, setIsQuickFilesOpen] = useState(false);
  const [quickFilesCategory, setQuickFilesCategory] = useState<'audio' | 'document' | 'image' | 'video'>('audio');

  // In-app media lightbox viewer
  const [activeMedia, setActiveMedia] = useState<{
    type: 'image' | 'document' | 'video';
    url: string;
    caption?: string;
    filename?: string;
    fileSize?: number;
    senderName?: string;
    timestamp?: number;
  } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Dispatch outgoing message
  const handleDispatch = async (newMessage: ChatMessage) => {
    onSendMessage(newMessage);

    // Call Real Meta Cloud API via server proxy (server will auto-use connected database channel if client state is uninitialized)
    try {
      setErrorMessage(null);
      const res = await WhatsAppApiService.sendMessage({
        credentials,
        to: conversation.phoneNumber,
        type: newMessage.type,
        text: newMessage.text,
        mediaUrl: newMessage.mediaUrl,
        mediaCaption: newMessage.mediaCaption,
        filename: newMessage.filename,
        location: newMessage.location,
        template: newMessage.templateName
          ? {
              name: newMessage.templateName,
              language: 'en_US'
            }
          : undefined
      });

      const messageId = res.data?.messages?.[0]?.id || res.metaMessageId;

      if (res.success && messageId) {
        onUpdateMessageStatus(newMessage.id, 'sent', messageId);
        waAudio.playSent();
        setErrorMessage(null);
        setIsTokenExpired(false);
      } else {
        onUpdateMessageStatus(newMessage.id, 'failed');
        const detailMsg = res.details?.error?.message || res.error || 'Failed to dispatch via Meta API';
        const expired = res.isTokenExpired || 
          res.details?.error?.code === 190 || 
          detailMsg.toLowerCase().includes('expired') || 
          detailMsg.toLowerCase().includes('oauthexception') ||
          detailMsg.toLowerCase().includes('code 190');

        if (expired) {
          setIsTokenExpired(true);
          setErrorMessage('Meta Access Token Expired (Error 190): Session expired on Meta. Click "Update Token" to paste a fresh or permanent System User token.');
        } else {
          setErrorMessage(`Meta API Error: ${detailMsg}`);
          if (detailMsg.toLowerCase().includes('not configured') || detailMsg.toLowerCase().includes('settings')) {
            if (onOpenSettings) {
              setTimeout(() => onOpenSettings(), 800);
            }
          }
        }
      }
    } catch (err: any) {
      onUpdateMessageStatus(newMessage.id, 'failed');
      setErrorMessage(err?.message || 'Network error reaching WhatsApp API');
    }
  };

  // Quick Token Submit
  const handleQuickTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTokenInput.trim()) {
      setTokenUpdateError('Please enter your Meta Access Token.');
      return;
    }

    setIsUpdatingToken(true);
    setTokenUpdateError(null);

    try {
      const result = await WhatsAppApiService.updateToken(
        quickTokenInput.trim(),
        credentials.phoneNumberId
      );

      if (result.success && result.credentials) {
        onSaveCredentials?.(result.credentials);
        setIsTokenExpired(false);
        setErrorMessage(null);
        setShowQuickTokenModal(false);
        setQuickTokenInput('');
        waAudio.playReceived();

        // Automatically retry the latest failed message in this conversation if any
        const latestFailed = [...messages].reverse().find(m => m.fromMe && m.status === 'failed');
        if (latestFailed) {
          setTimeout(() => handleDispatch(latestFailed), 300);
        }
      } else {
        setTokenUpdateError(result.error || 'Meta rejected this token. Ensure it is valid and has whatsapp_business_messaging permissions.');
      }
    } catch (err: any) {
      setTokenUpdateError(err?.message || 'Failed to communicate with server.');
    } finally {
      setIsUpdatingToken(false);
    }
  };

  // 1. Send Text Message
  const handleSendText = (text: string) => {
    const msg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversationId: conversation.id,
      fromMe: true,
      type: 'text',
      text,
      timestamp: Date.now(),
      status: 'sending'
    };
    handleDispatch(msg);
  };

  // 2. Send Voice Note
  const handleSendVoiceNote = async (audioBlob: Blob, duration: number) => {
    setIsUploading(true);
    try {
      const uploadRes = await WhatsAppApiService.uploadMedia(audioBlob, `voice_${Date.now()}.webm`);
      const msg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        conversationId: conversation.id,
        fromMe: true,
        type: 'audio',
        duration,
        mediaUrl: uploadRes.url,
        timestamp: Date.now(),
        status: 'sending'
      };
      handleDispatch(msg);
    } catch (e: any) {
      const localUrl = URL.createObjectURL(audioBlob);
      const msg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        conversationId: conversation.id,
        fromMe: true,
        type: 'audio',
        duration,
        mediaUrl: localUrl,
        timestamp: Date.now(),
        status: 'sending'
      };
      handleDispatch(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // 3. Send Media File (Image, Video, Document)
  const handleSelectFile = async (file: File, type: 'image' | 'video' | 'audio' | 'document') => {
    setIsUploading(true);
    try {
      const uploadRes = await WhatsAppApiService.uploadMedia(file, file.name);
      const msg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        conversationId: conversation.id,
        fromMe: true,
        type,
        mediaUrl: uploadRes.url,
        filename: file.name,
        fileSize: file.size,
        mediaCaption: type === 'image' || type === 'video' ? file.name : undefined,
        timestamp: Date.now(),
        status: 'sending'
      };
      handleDispatch(msg);
    } catch (e) {
      const localUrl = URL.createObjectURL(file);
      const msg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        conversationId: conversation.id,
        fromMe: true,
        type,
        mediaUrl: localUrl,
        filename: file.name,
        fileSize: file.size,
        timestamp: Date.now(),
        status: 'sending'
      };
      handleDispatch(msg);
    } finally {
      setIsUploading(false);
    }
  };

  // 4. Send Location
  const handleSelectLocation = (loc: { latitude: number; longitude: number; name: string; address: string }) => {
    const msg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversationId: conversation.id,
      fromMe: true,
      type: 'location',
      location: loc,
      timestamp: Date.now(),
      status: 'sending'
    };
    handleDispatch(msg);
  };

  // 5. Send Template
  const handleSelectTemplate = (template: WhatsAppTemplate) => {
    const bodyComp = template.components.find((c) => c.type === 'BODY');
    const msg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversationId: conversation.id,
      fromMe: true,
      type: 'template',
      templateName: template.name,
      text: bodyComp?.text || `Template: ${template.name}`,
      timestamp: Date.now(),
      status: 'sending'
    };
    handleDispatch(msg);
  };

  // 6. Send Quick Preset File
  const handleSendQuickFile = (quickFile: QuickFile) => {
    const msg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversationId: conversation.id,
      fromMe: true,
      type: quickFile.category,
      mediaUrl: quickFile.url,
      mediaCaption: quickFile.caption,
      filename: quickFile.filename || quickFile.name,
      fileSize: quickFile.fileSize,
      duration: quickFile.duration,
      timestamp: Date.now(),
      status: 'sending'
    };
    handleDispatch(msg);
    waAudio.playSent();
  };

  // Pin file from message to quick presets
  const handlePinToQuickFiles = (msg: ChatMessage) => {
    if (msg.type === 'audio' || msg.type === 'document' || msg.type === 'image' || msg.type === 'video') {
      const defaultName = msg.filename || msg.mediaCaption || `${msg.type.toUpperCase()} Preset`;
      onAddQuickFile({
        category: msg.type,
        name: defaultName,
        url: msg.mediaUrl || '',
        caption: msg.mediaCaption,
        filename: msg.filename,
        fileSize: msg.fileSize,
        duration: msg.duration
      });
      waAudio.playReceived();
      alert(`Pinned "${defaultName}" to Quick ${msg.type} presets!`);
    }
  };

  return (
    <div className="flex flex-col h-full w-full min-h-0 bg-[#EFEAE2] dark:bg-[#0B141A] transition-colors relative overflow-hidden select-none">
      {/* Top Conversation Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-[#1F2C34] border-b border-slate-200 dark:border-slate-800 z-20 shadow-xs shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="p-1 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 -ml-1 transition-colors"
            title="Back to chat list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Contact Avatar */}
          <div
            style={{ backgroundColor: conversation.avatarColor }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0"
          >
            {conversation.name.charAt(0).toUpperCase()}
          </div>

          {/* Name & Phone */}
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
              {conversation.name}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
              {conversation.phoneNumber}
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
          {/* Quick Files Vault button */}
          <button
            onClick={() => {
              setQuickFilesCategory('audio');
              setIsQuickFilesOpen(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#008069]/10 hover:bg-[#008069]/20 text-[#008069] dark:text-[#25D366] transition-colors"
            title="Open Quick Files Presets"
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quick Files</span>
          </button>

          <button
            onClick={() => {
              waAudio.playSent();
              alert(`Calling ${conversation.name} (${conversation.phoneNumber}) via WhatsApp Voice...`);
            }}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Voice Call"
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              waAudio.playSent();
              alert(`Initiating WhatsApp Video Session for ${conversation.phoneNumber}...`);
            }}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Video Call"
          >
            <Video className="w-4 h-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="More options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 w-52 bg-white dark:bg-[#202C33] rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 text-xs">
                <button
                  onClick={() => {
                    setQuickFilesCategory('audio');
                    setIsQuickFilesOpen(true);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 text-[#008069]" />
                  <span>Quick Files Presets (max 10)</span>
                </button>
                <button
                  onClick={() => {
                    setIsLocationPickerOpen(true);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>City Branch Offices ({quickLocations.length})</span>
                </button>
                <button
                  onClick={() => {
                    setIsAttachmentOpen(true);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  Send Meta Template
                </button>
                {onOpenSettings && (
                  <button
                    onClick={() => {
                      onOpenSettings();
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 text-[#008069]" />
                    <span>WhatsApp Cloud API Settings</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    alert(`Contact: ${conversation.name}\nPhone: ${conversation.phoneNumber}\nTotal messages: ${messages.length}`);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  Contact Info
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Prominent Meta Token Expired Warning Banner */}
      {isTokenExpired && (
        <div className="bg-red-50 dark:bg-red-950/70 border-b border-red-300 dark:border-red-800 px-3.5 py-2 flex items-center justify-between text-xs text-red-900 dark:text-red-200 animate-in fade-in shrink-0 shadow-xs">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/60 flex items-center justify-center shrink-0">
              <KeyRound className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0">
              <div className="font-bold flex items-center gap-1.5 text-red-950 dark:text-red-100">
                <span>Meta Access Token Expired (Error 190)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-300 font-mono font-medium">Session Expired</span>
              </div>
              <p className="text-[11px] text-red-800 dark:text-red-300 truncate">
                Your 24h Meta token expired. Inbound messages work, but outbound messages need a fresh or permanent token.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                setQuickTokenInput(credentials.accessToken || '');
                setTokenUpdateError(null);
                setShowQuickTokenModal(true);
              }}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-xs cursor-pointer flex items-center gap-1"
            >
              <KeyRound className="w-3 h-3" />
              <span>Update Token</span>
            </button>
            <button
              onClick={() => setIsTokenExpired(false)}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded text-red-500 font-bold ml-1"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Warning banner if Meta Cloud API credentials not configured */}
      {!isTokenExpired && (!credentials.accessToken?.trim() || !credentials.phoneNumberId?.trim()) && (
        <div className="bg-amber-500/10 dark:bg-amber-950/60 border-b border-amber-500/30 px-3.5 py-2 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="truncate">WhatsApp Cloud API not connected. Add Phone Number ID &amp; Token to send real messages.</span>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-[11px] shrink-0 ml-2 transition-colors cursor-pointer"
            >
              Connect API
            </button>
          )}
        </div>
      )}

      {/* General error alert banner if Meta API call failed (non-expired) */}
      {!isTokenExpired && errorMessage && (
        <div className="bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-900 px-3 py-1.5 flex items-center justify-between text-xs text-red-800 dark:text-red-200 animate-in fade-in shrink-0">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {/* Main Messages List with WhatsApp Wallpaper (constrained flex child) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3 whatsapp-chat-bg-light dark:whatsapp-chat-bg-dark space-y-1">
        {/* Date pill separator */}
        <div className="flex justify-center my-2">
          <span className="px-3 py-1 rounded-lg bg-white/80 dark:bg-[#182229]/80 backdrop-blur-xs text-[11px] font-medium text-slate-600 dark:text-slate-400 shadow-2xs uppercase tracking-wider">
            Today
          </span>
        </div>

        {messages.map((msg) => (
          <MessageBubble 
            key={msg.id} 
            message={msg} 
            onRetryFailed={handleDispatch}
            onOpenMedia={setActiveMedia}
            onPinToQuickFiles={handlePinToQuickFiles}
          />
        ))}

        {isUploading && (
          <div className="flex justify-end px-3 py-1">
            <div className="bg-[#E7FFDB] dark:bg-[#005C4B] rounded-2xl px-3 py-2 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#008069] border-t-transparent animate-spin" />
              <span>Uploading media to WhatsApp...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom WhatsApp Input Bar (guaranteed visible and anchored) */}
      <div className="shrink-0 z-20 w-full shadow-lg">
        <ChatInputBar
          onSendMessage={handleSendText}
          onSendVoiceNote={handleSendVoiceNote}
          onOpenAttachment={() => setIsAttachmentOpen(true)}
        />
      </div>

      {/* Media & Attachment Bottom Sheet Drawer */}
      <AttachmentSheet
        isOpen={isAttachmentOpen}
        onClose={() => setIsAttachmentOpen(false)}
        onSelectFile={handleSelectFile}
        onSelectLocation={handleSelectLocation}
        onSelectTemplate={handleSelectTemplate}
        templates={templates}
        quickFiles={quickFiles}
        quickLocations={quickLocations}
        quickSettings={quickSettings}
        onSendQuickFile={handleSendQuickFile}
        onAddQuickFile={onAddQuickFile}
        onRenameQuickFile={onRenameQuickFile}
        onDeleteQuickFile={onDeleteQuickFile}
        onReorderQuickFiles={onReorderQuickFiles}
        onAddLocation={onAddLocation}
        onDeleteLocation={onDeleteLocation}
        onReorderLocations={onReorderLocations}
        onOpenSettings={onOpenSettings}
      />

      {/* Location & Multi-Office Branch Centers Picker */}
      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        locations={quickLocations}
        onClose={() => setIsLocationPickerOpen(false)}
        onSendLocation={handleSelectLocation}
        onAddLocation={onAddLocation}
        onDeleteLocation={onDeleteLocation}
        onReorderLocations={onReorderLocations}
      />

      {/* Quick-Send Media Presets Modal */}
      <QuickFilesModal
        isOpen={isQuickFilesOpen}
        initialCategory={quickFilesCategory}
        quickFiles={quickFiles}
        onClose={() => setIsQuickFilesOpen(false)}
        onSendQuickFile={handleSendQuickFile}
        onAddQuickFile={onAddQuickFile}
        onRenameQuickFile={onRenameQuickFile}
        onDeleteQuickFile={onDeleteQuickFile}
        onReorderQuickFiles={onReorderQuickFiles}
      />

      {/* In-App Fullscreen Lightbox & Document Viewer Modal */}
      <MediaViewerModal
        media={activeMedia}
        onClose={() => setActiveMedia(null)}
      />

      {/* Quick Meta Access Token Renewal Modal */}
      {showQuickTokenModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-[#202C33] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-[#008069] dark:bg-[#128C7E] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Update Meta Access Token</h3>
                  <p className="text-[11px] text-emerald-100">Restore instant outbound messaging</p>
                </div>
              </div>
              <button
                onClick={() => setShowQuickTokenModal(false)}
                className="w-7 h-7 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-white text-base transition-colors"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleQuickTokenSubmit} className="p-5 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Why did this happen?</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  Meta's temporary developer token lasts only 24 hours. While webhooks continue receiving customer messages, outbound replies require an active Bearer token.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    New Meta Access Token
                  </label>
                  <a
                    href="https://developers.facebook.com/apps/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#008069] dark:text-[#25D366] hover:underline flex items-center gap-0.5"
                  >
                    <span>Meta Developer Portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <textarea
                  rows={3}
                  placeholder="Paste your EAAG... or System User access token here"
                  value={quickTokenInput}
                  onChange={(e) => setQuickTokenInput(e.target.value)}
                  className="w-full font-mono text-xs px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069] resize-none"
                  autoFocus
                />
              </div>

              {/* Step-by-step guidance for Permanent Token */}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-[11px] text-slate-600 dark:text-slate-300 space-y-1 border border-slate-200 dark:border-slate-700/60">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  💡 Tip: Want a Never-Expiring Token?
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-[10.5px]">
                  Go to <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-[#008069] dark:text-[#25D366] underline">Meta Business Settings &gt; System Users</a> &rarr; Generate Token &rarr; Select <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.2 rounded font-mono">whatsapp_business_messaging</code> &rarr; Expiration: <b>Never</b>.
                </p>
              </div>

              {tokenUpdateError && (
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{tokenUpdateError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuickTokenModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingToken || !quickTokenInput.trim()}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-[#008069] hover:bg-[#00705c] dark:bg-[#25D366] dark:hover:bg-[#20ba59] text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  {isUpdatingToken ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating with Meta...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save &amp; Reconnect</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
