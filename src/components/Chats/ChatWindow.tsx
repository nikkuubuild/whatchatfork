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
  MapPin
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
  onOpenSettings
}) => {
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    // Verify Meta Cloud API credentials exist
    if (!credentials.accessToken?.trim() || !credentials.phoneNumberId?.trim()) {
      onUpdateMessageStatus(newMessage.id, 'failed');
      setErrorMessage(
        'WhatsApp Cloud API is not configured! Please enter your Meta Access Token and Phone Number ID in Settings to send real WhatsApp messages.'
      );
      if (onOpenSettings) {
        setTimeout(() => onOpenSettings(), 600);
      }
      return;
    }

    // Call Real Meta Cloud API
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

      if (res.success && res.data?.messages?.[0]?.id) {
        onUpdateMessageStatus(newMessage.id, 'sent', res.data.messages[0].id);
        waAudio.playSent();
      } else {
        onUpdateMessageStatus(newMessage.id, 'failed');
        const detailMsg = res.details?.error?.message || res.error || 'Failed to dispatch via Meta API';
        setErrorMessage(`Meta API Error: ${detailMsg}`);
      }
    } catch (err: any) {
      onUpdateMessageStatus(newMessage.id, 'failed');
      setErrorMessage(err?.message || 'Network error reaching WhatsApp API');
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

      {/* Warning banner if Meta Cloud API credentials not configured */}
      {(!credentials.accessToken?.trim() || !credentials.phoneNumberId?.trim()) && (
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

      {/* Error alert banner if Meta API call failed */}
      {errorMessage && (
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
    </div>
  );
};
