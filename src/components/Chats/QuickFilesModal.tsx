import React, { useState, useRef } from 'react';
import { 
  X, 
  Plus, 
  Send, 
  Trash2, 
  Edit2, 
  Check, 
  ChevronUp, 
  ChevronDown, 
  Play, 
  Pause, 
  FileText, 
  Headphones, 
  Image as ImageIcon, 
  Film, 
  Upload,
  GripVertical
} from 'lucide-react';
import { QuickFile } from '../../types/whatsapp';
import { WhatsAppApiService } from '../../services/whatsappApi';

interface QuickFilesModalProps {
  isOpen: boolean;
  initialCategory?: 'audio' | 'document' | 'image' | 'video';
  quickFiles: QuickFile[];
  onClose: () => void;
  onSendQuickFile: (file: QuickFile) => void;
  onAddQuickFile: (file: Omit<QuickFile, 'id' | 'createdAt' | 'orderIndex'>) => void;
  onRenameQuickFile: (id: string, newName: string) => void;
  onDeleteQuickFile: (id: string) => void;
  onReorderQuickFiles: (category: 'audio' | 'document' | 'image' | 'video', fromIndex: number, toIndex: number) => void;
  onPickFromFileSystem?: () => void;
}

export const QuickFilesModal: React.FC<QuickFilesModalProps> = ({
  isOpen,
  initialCategory = 'audio',
  quickFiles,
  onClose,
  onSendQuickFile,
  onAddQuickFile,
  onRenameQuickFile,
  onDeleteQuickFile,
  onReorderQuickFiles,
  onPickFromFileSystem
}) => {
  const [activeCategory, setActiveCategory] = useState<'audio' | 'document' | 'image' | 'video'>(initialCategory);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const categoryFiles = quickFiles
    .filter((f) => f.category === activeCategory)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const handleStartRename = (file: QuickFile) => {
    setEditingId(file.id);
    setEditNameValue(file.name);
  };

  const handleSaveRename = (id: string) => {
    if (editNameValue.trim()) {
      onRenameQuickFile(id, editNameValue.trim());
    }
    setEditingId(null);
  };

  const handleToggleAudio = (file: QuickFile) => {
    if (playingAudioId === file.id) {
      audioRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(file.url);
      audio.onended = () => setPlayingAudioId(null);
      audio.play().catch(() => {});
      audioRef.current = audio;
      setPlayingAudioId(file.id);
    }
  };

  // Upload a new file from device to Quick Files
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (categoryFiles.length >= 10) {
      alert(`Maximum limit reached: You can have up to 10 quick ${activeCategory} files.`);
      return;
    }

    setIsUploading(true);
    try {
      const uploadRes = await WhatsAppApiService.uploadMedia(file, file.name);
      const nextIndex = categoryFiles.length + 1;
      const defaultName = `${nextIndex}. ${file.name}`;

      onAddQuickFile({
        category: activeCategory,
        name: defaultName,
        url: uploadRes.url,
        filename: file.name,
        fileSize: file.size,
        duration: activeCategory === 'audio' ? 10 : undefined,
        caption: activeCategory === 'image' || activeCategory === 'video' ? file.name : undefined
      });
    } catch (err: any) {
      // Fallback with blob
      const localUrl = URL.createObjectURL(file);
      const nextIndex = categoryFiles.length + 1;
      onAddQuickFile({
        category: activeCategory,
        name: `${nextIndex}. ${file.name}`,
        url: localUrl,
        filename: file.name,
        fileSize: file.size
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getAcceptType = () => {
    switch (activeCategory) {
      case 'audio':
        return 'audio/*,.mp3,.wav,.ogg,.m4a,.webm';
      case 'document':
        return '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';
      case 'image':
        return 'image/*';
      case 'video':
        return 'video/*,.mp4,.webm';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 animate-in fade-in select-none">
      <div className="w-full max-w-lg bg-white dark:bg-[#1F2C34] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182229] shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Quick-Send Media Presets</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#008069]/10 dark:bg-[#25D366]/20 text-[#008069] dark:text-[#25D366]">
                {categoryFiles.length} / 10
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              1-tap instant send · Drag &amp; reorder sequence · Rename or delete
            </p>
          </div>

          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 bg-slate-100 dark:bg-[#111B21] border-b border-slate-200 dark:border-slate-800 shrink-0">
          {(
            [
              { id: 'audio', label: 'Audio', icon: Headphones },
              { id: 'document', label: 'Documents', icon: FileText },
              { id: 'image', label: 'Photos', icon: ImageIcon },
              { id: 'video', label: 'Videos', icon: Film }
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const count = quickFiles.filter((f) => f.category === tab.id).length;
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (audioRef.current) audioRef.current.pause();
                  setActiveCategory(tab.id);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  isActive
                    ? 'bg-white dark:bg-[#1F2C34] text-[#008069] dark:text-[#25D366] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <span className="text-[10px] font-mono opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-[#1F2C34] shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={categoryFiles.length >= 10 || isUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#008069] dark:bg-[#25D366] text-white text-xs font-semibold hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Uploading...' : `+ Add Quick ${activeCategory}`}</span>
          </button>

          {onPickFromFileSystem && (
            <button
              onClick={() => {
                onPickFromFileSystem();
                onClose();
              }}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-[#008069] dark:hover:text-[#25D366] flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              <span>One-off from Phone</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={getAcceptType()}
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Quick Files List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {categoryFiles.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p className="text-xs font-semibold">No quick {activeCategory} files added yet.</p>
              <p className="text-[11px] mt-1">Tap "+ Add Quick {activeCategory}" above or pin files from chat.</p>
            </div>
          ) : (
            categoryFiles.map((file, idx) => {
              const isEditing = editingId === file.id;
              const isPlaying = playingAudioId === file.id;

              return (
                <div
                  key={file.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:border-[#008069] dark:hover:border-[#25D366] transition-all group"
                >
                  {/* Sequence Position Badge (#1, #2, #3) */}
                  <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                    #{idx + 1}
                  </span>

                  {/* Play / Preview Thumbnail */}
                  {file.category === 'audio' && (
                    <button
                      onClick={() => handleToggleAudio(file)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 transition-transform active:scale-90 ${
                        isPlaying ? 'bg-amber-500' : 'bg-[#008069] dark:bg-[#25D366]'
                      }`}
                      title={isPlaying ? 'Pause' : 'Play Audio Preview'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
                    </button>
                  )}

                  {file.category === 'image' && (
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 border border-black/5">
                      <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                    </div>
                  )}

                  {file.category === 'document' && (
                    <div className="w-9 h-9 rounded-lg bg-indigo-500 text-white flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                  )}

                  {file.category === 'video' && (
                    <div className="w-9 h-9 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                      <Film className="w-4 h-4" />
                    </div>
                  )}

                  {/* Name (Inline editable) */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(file.id)}
                          autoFocus
                          className="w-full text-xs px-2 py-1 rounded-md border border-[#008069] bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                        />
                        <button
                          onClick={() => handleSaveRename(file.id)}
                          className="p-1 rounded-md bg-[#008069] text-white hover:opacity-90"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/label">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {file.name}
                        </p>
                        <button
                          onClick={() => handleStartRename(file)}
                          className="opacity-0 group-hover/label:opacity-100 p-0.5 text-slate-400 hover:text-slate-600 transition-opacity"
                          title="Rename file"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-[10.5px] text-slate-400 truncate">
                      {file.caption || file.filename || (file.duration ? `${file.duration}s voice note` : 'Ready to send')}
                    </p>
                  </div>

                  {/* Reorder Up / Down Controls */}
                  <div className="flex flex-col items-center shrink-0">
                    <button
                      onClick={() => onReorderQuickFiles(activeCategory, idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                      title="Move Up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onReorderQuickFiles(activeCategory, idx, idx + 1)}
                      disabled={idx === categoryFiles.length - 1}
                      className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20"
                      title="Move Down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => {
                      if (confirm(`Remove "${file.name}" from quick files?`)) {
                        onDeleteQuickFile(file.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
                    title="Remove from quick list"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* One-Tap Send CTA */}
                  <button
                    onClick={() => {
                      if (audioRef.current) audioRef.current.pause();
                      onSendQuickFile(file);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#008069] dark:bg-[#25D366] text-white text-xs font-semibold hover:opacity-95 active:scale-95 transition-all shadow-xs shrink-0"
                    title="Send immediately to this customer"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#182229] border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
          <span>Tip: You can also pin any media from your chat directly to this quick list.</span>
          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.pause();
              onClose();
            }}
            className="px-3 py-1 font-semibold text-slate-600 dark:text-slate-300 hover:underline"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
