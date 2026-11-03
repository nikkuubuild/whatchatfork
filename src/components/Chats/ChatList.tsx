import React, { useState } from 'react';
import { Search, Plus, Pin, Mic, Image, FileText, CheckCheck, UserPlus, X } from 'lucide-react';
import { Conversation, ChatMessage } from '../../types/whatsapp';

interface ChatListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: (phoneNumber: string, name: string) => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phoneNumber.includes(q);
  });

  const handleCreateNewChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) return;
    onNewChat(newPhone.trim(), newName.trim() || newPhone.trim());
    setNewPhone('');
    setNewName('');
    setShowNewChatModal(false);
  };

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();
    if (isYesterday) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderLastMessagePreview = (lastMsg?: ChatMessage) => {
    if (!lastMsg) return 'No messages yet';

    const renderIcon = () => {
      switch (lastMsg.type) {
        case 'audio':
          return <Mic className="w-3.5 h-3.5 inline mr-1 text-[#008069] dark:text-[#25D366]" />;
        case 'image':
          return <Image className="w-3.5 h-3.5 inline mr-1 text-slate-500" />;
        case 'document':
          return <FileText className="w-3.5 h-3.5 inline mr-1 text-slate-500" />;
        default:
          return null;
      }
    };

    return (
      <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 truncate">
        {lastMsg.fromMe && (
          <CheckCheck
            className={`w-3.5 h-3.5 inline mr-1 shrink-0 ${
              lastMsg.status === 'read' ? 'text-[#53BDEB]' : 'text-slate-400'
            }`}
          />
        )}
        {renderIcon()}
        <span className="truncate">
          {lastMsg.type === 'audio'
            ? 'Voice message'
            : lastMsg.type === 'image'
            ? lastMsg.mediaCaption || 'Photo'
            : lastMsg.type === 'document'
            ? lastMsg.filename || 'Document'
            : lastMsg.type === 'location'
            ? 'Location shared'
            : lastMsg.text || 'Message'}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111B21] border-r border-slate-200 dark:border-slate-800 transition-colors select-none relative">
      {/* Search Header */}
      <div className="p-2.5 bg-white dark:bg-[#111B21] border-b border-slate-100 dark:border-slate-800">
        <div className="relative flex items-center bg-slate-100 dark:bg-[#202C33] rounded-xl px-3 py-1.5 focus-within:ring-1 focus-within:ring-[#008069]">
          <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or start new chat"
            className="w-full bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-0.5 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conversations Scroll List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
        {filteredConversations.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No chats found</p>
            <p className="text-xs text-slate-400 mt-1">
              Tap the green button below to start a direct WhatsApp conversation.
            </p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = conv.id === activeConversationId;
            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-slate-100 dark:bg-[#2A3942]'
                    : 'hover:bg-slate-50 dark:hover:bg-[#202C33]/60'
                }`}
              >
                {/* Contact Avatar */}
                <div
                  style={{ backgroundColor: conv.avatarColor }}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shadow-xs shrink-0"
                >
                  {conv.name.charAt(0).toUpperCase()}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {conv.name}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono ml-2 shrink-0">
                      {formatTimestamp(conv.updatedAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div className="min-w-0 flex-1 pr-2">
                      {renderLastMessagePreview(conv.lastMessage)}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.isPinned && (
                        <Pin className="w-3.5 h-3.5 text-slate-400 rotate-45" />
                      )}
                      {conv.unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 min-w-[20px] text-center text-[10px] font-bold text-white bg-[#25D366] rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Floating Action Button (FAB) to Add Chat */}
      <button
        onClick={() => setShowNewChatModal(true)}
        className="absolute bottom-20 right-4 w-14 h-14 rounded-2xl bg-[#008069] dark:bg-[#25D366] text-white flex items-center justify-center shadow-xl hover:opacity-90 active:scale-95 transition-all z-20"
        title="Start new chat"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-[#1F2C34] rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
                <UserPlus className="w-5 h-5 text-[#008069] dark:text-[#25D366]" />
                <span>New WhatsApp Chat</span>
              </div>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewChat} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Recipient Phone Number (with Country Code)
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+1 (555) 000-0000"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069]"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Example: 15551234567 or +91 9876543210
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contact / Business Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Miller"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-[#008069]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#008069] dark:bg-[#25D366] text-white hover:opacity-95 shadow-sm"
                >
                  Open Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
