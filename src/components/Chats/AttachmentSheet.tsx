import React, { useRef, useState } from 'react';
import { 
  FileText, 
  Camera, 
  Image as ImageIcon, 
  Headphones, 
  MapPin, 
  FileCode, 
  X, 
  Zap, 
  Video, 
  Building2,
  ChevronRight,
  FolderOpen,
  Send,
  Play,
  Pause,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Edit2,
  Check,
  Upload,
  Settings
} from 'lucide-react';
import { WhatsAppTemplate, QuickFile, QuickLocationPreset, QuickPresetsSettings } from '../../types/whatsapp';
import { WhatsAppApiService } from '../../services/whatsappApi';

interface AttachmentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (file: File, type: 'image' | 'video' | 'audio' | 'document') => void;
  onSelectLocation: (location: { latitude: number; longitude: number; name: string; address: string }) => void;
  onSelectTemplate: (template: WhatsAppTemplate) => void;
  templates: WhatsAppTemplate[];
  quickFiles: QuickFile[];
  quickLocations: QuickLocationPreset[];
  quickSettings: QuickPresetsSettings;
  onSendQuickFile: (file: QuickFile) => void;
  onAddQuickFile: (file: Omit<QuickFile, 'id' | 'createdAt' | 'orderIndex'>) => void;
  onRenameQuickFile: (id: string, newName: string) => void;
  onDeleteQuickFile: (id: string) => void;
  onReorderQuickFiles: (category: 'audio' | 'document' | 'image' | 'video', fromIndex: number, toIndex: number) => void;
  onAddLocation: (loc: Omit<QuickLocationPreset, 'id' | 'orderIndex'>) => void;
  onDeleteLocation: (id: string) => void;
  onReorderLocations: (fromIndex: number, toIndex: number) => void;
  onOpenSettings?: () => void;
}

export const AttachmentSheet: React.FC<AttachmentSheetProps> = ({
  isOpen,
  onClose,
  onSelectFile,
  onSelectLocation,
  onSelectTemplate,
  templates,
  quickFiles,
  quickLocations,
  quickSettings,
  onSendQuickFile,
  onAddQuickFile,
  onRenameQuickFile,
  onDeleteQuickFile,
  onReorderQuickFiles,
  onAddLocation,
  onDeleteLocation,
  onReorderLocations,
  onOpenSettings
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const directDocRef = useRef<HTMLInputElement>(null);
  const directAudioRef = useRef<HTMLInputElement>(null);
  const directGalleryRef = useRef<HTMLInputElement>(null);
  const directVideoRef = useRef<HTMLInputElement>(null);
  const quickUploadRef = useRef<HTMLInputElement>(null);

  // Tab mode: 'picker' (direct device storage) or 'quick' (saved quick presets)
  const [activeMode, setActiveMode] = useState<'picker' | 'quick'>('picker');
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // Quick category selection in 'quick' mode
  const enabledCategories: Array<'audio' | 'document' | 'image' | 'video' | 'location'> = [];
  if (quickSettings.audio) enabledCategories.push('audio');
  if (quickSettings.document) enabledCategories.push('document');
  if (quickSettings.image) enabledCategories.push('image');
  if (quickSettings.video) enabledCategories.push('video');
  if (quickSettings.location) enabledCategories.push('location');

  const [activeQuickCat, setActiveQuickCat] = useState<'audio' | 'document' | 'image' | 'video' | 'location'>(
    enabledCategories[0] || 'audio'
  );

  // Quick item editing / audio preview states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [isUploadingQuick, setIsUploadingQuick] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Add branch location form in quick mode
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchLat, setBranchLat] = useState('37.7891');
  const [branchLng, setBranchLng] = useState('-122.3993');

  if (!isOpen) return null;

  // Direct device file handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'audio' | 'document') => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file, type);
      onClose();
    }
  };

  // Direct GPS location share
  const handleShareCurrentGps = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onSelectLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            name: 'Live GPS Location',
            address: `Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)}`
          });
          onClose();
        },
        () => {
          onSelectLocation({
            latitude: 37.7749,
            longitude: -122.4194,
            name: 'Office Hub Location',
            address: 'Downtown Hub, San Francisco, CA'
          });
          onClose();
        }
      );
    } else {
      onSelectLocation({
        latitude: 37.7749,
        longitude: -122.4194,
        name: 'Office Hub Location',
        address: 'Downtown Hub, San Francisco, CA'
      });
      onClose();
    }
  };

  // Audio preview toggle in quick mode
  const handleToggleAudio = (file: QuickFile) => {
    if (playingAudioId === file.id) {
      audioPreviewRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      const audio = new Audio(file.url);
      audio.onended = () => setPlayingAudioId(null);
      audio.play().catch(() => {});
      audioPreviewRef.current = audio;
      setPlayingAudioId(file.id);
    }
  };

  // Upload new quick file
  const handleUploadQuickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || activeQuickCat === 'location') return;

    const currentCatFiles = quickFiles.filter((f) => f.category === activeQuickCat);
    if (currentCatFiles.length >= 10) {
      alert(`Maximum 10 quick ${activeQuickCat} files allowed.`);
      return;
    }

    setIsUploadingQuick(true);
    try {
      const res = await WhatsAppApiService.uploadMedia(file, file.name);
      const nextIndex = currentCatFiles.length + 1;
      onAddQuickFile({
        category: activeQuickCat,
        name: `${nextIndex}. ${file.name}`,
        url: res.url,
        filename: file.name,
        fileSize: file.size,
        duration: activeQuickCat === 'audio' ? 10 : undefined,
        caption: activeQuickCat === 'image' || activeQuickCat === 'video' ? file.name : undefined
      });
    } catch (err) {
      const localUrl = URL.createObjectURL(file);
      const nextIndex = currentCatFiles.length + 1;
      onAddQuickFile({
        category: activeQuickCat,
        name: `${nextIndex}. ${file.name}`,
        url: localUrl,
        filename: file.name,
        fileSize: file.size
      });
    } finally {
      setIsUploadingQuick(false);
      if (quickUploadRef.current) quickUploadRef.current.value = '';
    }
  };

  // Save new branch location
  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim() || !branchAddress.trim()) return;

    onAddLocation({
      name: branchName.trim(),
      address: branchAddress.trim(),
      latitude: parseFloat(branchLat) || 37.7749,
      longitude: parseFloat(branchLng) || -122.4194
    });

    setBranchName('');
    setBranchAddress('');
    setShowAddBranch(false);
  };

  const currentCategoryFiles = activeQuickCat !== 'location'
    ? quickFiles.filter((f) => f.category === activeQuickCat).sort((a, b) => a.orderIndex - b.orderIndex)
    : [];

  const currentLocations = quickLocations.sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in select-none">
      <div 
        className="w-full max-w-md bg-white dark:bg-[#1F2C34] rounded-t-3xl p-4 sm:p-5 shadow-2xl border-t border-slate-200 dark:border-slate-800 transition-all animate-in slide-in-from-bottom max-h-[85vh] flex flex-col"
      >
        {/* Handle bar & Close */}
        <div className="flex items-center justify-between pb-2 shrink-0 relative">
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
          <button
            onClick={onClose}
            className="absolute right-0 top-0 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!showTemplatePicker ? (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Top 2-Option Segmented Selector: [ Device Storage Picker ] vs [ Quick-Send Presets ] */}
            <div className="p-1 bg-slate-100 dark:bg-[#182229] rounded-2xl flex items-center mb-3 shrink-0 border border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveMode('picker')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition-all active:scale-98 ${
                  activeMode === 'picker'
                    ? 'bg-white dark:bg-[#2A3942] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FolderOpen className="w-4 h-4 text-[#008069] dark:text-[#25D366]" />
                <span>Device Storage Picker</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveMode('quick');
                  if (!enabledCategories.includes(activeQuickCat) && enabledCategories.length > 0) {
                    setActiveQuickCat(enabledCategories[0]);
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition-all active:scale-98 ${
                  activeMode === 'quick'
                    ? 'bg-white dark:bg-[#2A3942] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Quick-Send Presets</span>
              </button>
            </div>

            {/* OPTION 1: DEVICE STORAGE PICKER (Clean Authentic WhatsApp Grid) */}
            {activeMode === 'picker' && (
              <div className="py-2 flex-1 overflow-y-auto">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-3 px-1">
                  Select and send media directly from your phone storage:
                </div>

                <div className="grid grid-cols-3 gap-y-4 gap-x-2 py-2">
                  {/* Gallery (Photos & Images) */}
                  <button
                    onClick={() => directGalleryRef.current?.click()}
                    className="flex flex-col items-center gap-1.5 group active:scale-95 transition-transform"
                  >
                    <div className="w-14 h-14 rounded-full bg-purple-500 flex items-center justify-center text-white shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Gallery</span>
                  </button>

                  {/* Video Files */}
                  <button
                    onClick={() => directVideoRef.current?.click()}
                    className="flex flex-col items-center gap-1.5 group active:scale-95 transition-transform"
                  >
                    <div className="w-14 h-14 rounded-full bg-pink-500 flex items-center justify-center text-white shadow-md shadow-pink-500/20 group-hover:scale-105 transition-transform">
                      <Video className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Video</span>
                  </button>

                  {/* Document (PDF, Word, Excel) */}
                  <button
                    onClick={() => directDocRef.current?.click()}
                    className="flex flex-col items-center gap-1.5 group active:scale-95 transition-transform"
                  >
                    <div className="w-14 h-14 rounded-full bg-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                      <FileText className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Document</span>
                  </button>

                  {/* Audio File */}
                  <button
                    onClick={() => directAudioRef.current?.click()}
                    className="flex flex-col items-center gap-1.5 group active:scale-95 transition-transform"
                  >
                    <div className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
                      <Headphones className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Audio File</span>
                  </button>

                  {/* Camera Snap */}
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center gap-1.5 group active:scale-95 transition-transform"
                  >
                    <div className="w-14 h-14 rounded-full bg-rose-500 flex items-center justify-center text-white shadow-md shadow-rose-500/20 group-hover:scale-105 transition-transform">
                      <Camera className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Camera</span>
                  </button>

                  {/* Live GPS Location */}
                  <button
                    onClick={handleShareCurrentGps}
                    className="flex flex-col items-center gap-1.5 group active:scale-95 transition-transform"
                  >
                    <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Current GPS</span>
                  </button>
                </div>

                {/* Templates Trigger */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setShowTemplatePicker(true)}
                    className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-teal-500 bg-slate-50 dark:bg-slate-900/40 text-left transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                        <FileCode className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white">
                          WhatsApp Approved Templates
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {templates.length} pre-approved templates ready to dispatch
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                </div>
              </div>
            )}

            {/* OPTION 2: QUICK-SEND PRESETS (Saved Items Vault with 1-Tap Send) */}
            {activeMode === 'quick' && (
              <div className="flex flex-col flex-1 min-h-0">
                {enabledCategories.length === 0 ? (
                  <div className="text-center py-8 px-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800 my-auto">
                    <Zap className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-60" />
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">All Quick Presets Disabled</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1 mb-3">
                      You have turned off all Quick Presets categories in Settings. Enable audio, documents, photos, or branch locations to use them.
                    </p>
                    {onOpenSettings && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenSettings();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008069] text-white text-xs font-bold shadow-xs hover:opacity-90"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Open Settings</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Category Selector Pills (only enabled categories from Settings) */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 shrink-0 no-scrollbar">
                      {quickSettings.audio && (
                        <button
                          type="button"
                          onClick={() => setActiveQuickCat('audio')}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
                            activeQuickCat === 'audio'
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          <Headphones className="w-3 h-3" />
                          <span>Audios ({quickFiles.filter((f) => f.category === 'audio').length})</span>
                        </button>
                      )}

                      {quickSettings.document && (
                        <button
                          type="button"
                          onClick={() => setActiveQuickCat('document')}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
                            activeQuickCat === 'document'
                              ? 'bg-indigo-500 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          <FileText className="w-3 h-3" />
                          <span>Documents ({quickFiles.filter((f) => f.category === 'document').length})</span>
                        </button>
                      )}

                      {quickSettings.image && (
                        <button
                          type="button"
                          onClick={() => setActiveQuickCat('image')}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
                            activeQuickCat === 'image'
                              ? 'bg-purple-500 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>Photos ({quickFiles.filter((f) => f.category === 'image').length})</span>
                        </button>
                      )}

                      {quickSettings.video && (
                        <button
                          type="button"
                          onClick={() => setActiveQuickCat('video')}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
                            activeQuickCat === 'video'
                              ? 'bg-pink-500 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          <Video className="w-3 h-3" />
                          <span>Videos ({quickFiles.filter((f) => f.category === 'video').length})</span>
                        </button>
                      )}

                      {quickSettings.location && (
                        <button
                          type="button"
                          onClick={() => setActiveQuickCat('location')}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all ${
                            activeQuickCat === 'location'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          <Building2 className="w-3 h-3" />
                          <span>Branch Offices ({quickLocations.length})</span>
                        </button>
                      )}
                    </div>

                    {/* Quick Items List with 1-Tap Send */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                      {activeQuickCat !== 'location' ? (
                        /* Quick Files (Audio, Document, Photo, Video) */
                        <>
                          <div className="flex items-center justify-between py-1 text-[11px] text-slate-500 font-medium">
                            <span>Saved {activeQuickCat} presets ({currentCategoryFiles.length}/10)</span>
                            <button
                              type="button"
                              onClick={() => quickUploadRef.current?.click()}
                              disabled={currentCategoryFiles.length >= 10 || isUploadingQuick}
                              className="flex items-center gap-1 text-[#008069] dark:text-[#25D366] font-bold hover:underline"
                            >
                              <Plus className="w-3 h-3" />
                              <span>{isUploadingQuick ? 'Adding...' : '+ Add Preset'}</span>
                            </button>
                          </div>

                          {currentCategoryFiles.map((file, idx) => (
                            <div
                              key={file.id}
                              className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 hover:border-[#008069] transition-all"
                            >
                              {/* Audio preview play button or icon */}
                              {file.category === 'audio' ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleAudio(file)}
                                  className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs active:scale-95"
                                  title="Play audio preview"
                                >
                                  {playingAudioId === file.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                                </button>
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
                                  {file.category === 'document' ? <FileText className="w-4 h-4" /> : file.category === 'video' ? <Video className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                                </div>
                              )}

                              {/* Title / Renaming */}
                              <div className="flex-1 min-w-0">
                                {editingId === file.id ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={editNameValue}
                                      onChange={(e) => setEditNameValue(e.target.value)}
                                      className="w-full text-xs px-2 py-0.5 rounded border border-emerald-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => {
                                        if (editNameValue.trim()) {
                                          onRenameQuickFile(file.id, editNameValue.trim());
                                        }
                                        setEditingId(null);
                                      }}
                                      className="p-1 text-emerald-600 font-bold"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                      {file.name}
                                    </span>
                                    <button
                                      onClick={() => {
                                        setEditingId(file.id);
                                        setEditNameValue(file.name);
                                      }}
                                      className="text-slate-400 hover:text-slate-600 shrink-0"
                                      title="Rename preset"
                                    >
                                      <Edit2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                  {file.duration ? `${file.duration}s audio` : file.fileSize ? `${(file.fileSize / 1024 / 1024).toFixed(1)} MB` : file.caption || 'Quick preset'}
                                </div>
                              </div>

                              {/* Sequence reorder up/down */}
                              <div className="flex flex-col items-center shrink-0">
                                <button
                                  onClick={() => onReorderQuickFiles(file.category as any, idx, idx - 1)}
                                  disabled={idx === 0}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                  title="Move up"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => onReorderQuickFiles(file.category as any, idx, idx + 1)}
                                  disabled={idx === currentCategoryFiles.length - 1}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                  title="Move down"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Delete button */}
                              {currentCategoryFiles.length > 1 && (
                                <button
                                  onClick={() => onDeleteQuickFile(file.id)}
                                  className="p-1 text-slate-400 hover:text-red-500 shrink-0"
                                  title="Delete preset"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}

                              {/* 1-Tap Send Button */}
                              <button
                                onClick={() => {
                                  onSendQuickFile(file);
                                  onClose();
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008069] dark:bg-[#25D366] text-white text-xs font-bold hover:opacity-90 active:scale-95 transition-all shadow-2xs shrink-0"
                                title="Send directly to customer"
                              >
                                <Send className="w-3 h-3" />
                                <span>Send</span>
                              </button>
                            </div>
                          ))}
                        </>
                      ) : (
                        /* Quick Locations (Multi-Office Branch Centers) */
                        <>
                          <div className="flex items-center justify-between py-1 text-[11px] text-slate-500 font-medium">
                            <span>Pre-saved branch centers ({currentLocations.length}/10)</span>
                            <button
                              type="button"
                              onClick={() => setShowAddBranch(!showAddBranch)}
                              disabled={currentLocations.length >= 10}
                              className="flex items-center gap-1 text-[#008069] dark:text-[#25D366] font-bold hover:underline"
                            >
                              <Plus className="w-3 h-3" />
                              <span>{showAddBranch ? 'Cancel' : '+ Add Branch'}</span>
                            </button>
                          </div>

                          {/* Add Branch Inline Form */}
                          {showAddBranch && (
                            <form onSubmit={handleCreateBranch} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs mb-2">
                              <div>
                                <label className="block font-bold text-slate-700 dark:text-slate-300 text-[10px] mb-0.5">Office / Center Name</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="e.g. West Coast Fulfillment Center"
                                  value={branchName}
                                  onChange={(e) => setBranchName(e.target.value)}
                                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block font-bold text-slate-700 dark:text-slate-300 text-[10px] mb-0.5">Physical Address</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="e.g. 1400 Industrial Way, Gate 3"
                                  value={branchAddress}
                                  onChange={(e) => setBranchAddress(e.target.value)}
                                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setShowAddBranch(false)}
                                  className="px-2 py-0.5 text-slate-500 font-semibold text-[11px]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="px-3 py-1 bg-[#008069] text-white rounded font-bold text-[11px]"
                                >
                                  Save Branch
                                </button>
                              </div>
                            </form>
                          )}

                          {currentLocations.map((loc, idx) => (
                            <div
                              key={loc.id}
                              className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 hover:border-emerald-500 transition-all"
                            >
                              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                <Building2 className="w-4 h-4" />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {loc.name}
                                  </span>
                                  <span className="text-[10px] font-mono px-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                                    #{idx + 1}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {loc.address}
                                </p>
                              </div>

                              {/* Sequence reorder up/down */}
                              <div className="flex flex-col items-center shrink-0">
                                <button
                                  onClick={() => onReorderLocations(idx, idx - 1)}
                                  disabled={idx === 0}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                  title="Move up"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => onReorderLocations(idx, idx + 1)}
                                  disabled={idx === currentLocations.length - 1}
                                  className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                  title="Move down"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Delete button */}
                              {currentLocations.length > 1 && (
                                <button
                                  onClick={() => onDeleteLocation(loc.id)}
                                  className="p-1 text-slate-400 hover:text-red-500 shrink-0"
                                  title="Delete location"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}

                              {/* 1-Tap Send Location */}
                              <button
                                onClick={() => {
                                  onSelectLocation({
                                    latitude: loc.latitude,
                                    longitude: loc.longitude,
                                    name: loc.name,
                                    address: loc.address
                                  });
                                  onClose();
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold active:scale-95 transition-all shadow-2xs shrink-0"
                                title="Send branch office location"
                              >
                                <Send className="w-3 h-3" />
                                <span>Send</span>
                              </button>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Hidden native file inputs for picker mode & quick upload */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileChange(e, 'image')}
            />
            <input
              ref={directGalleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, 'image')}
            />
            <input
              ref={directVideoRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, 'video')}
            />
            <input
              ref={directDocRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,application/pdf"
              className="hidden"
              onChange={(e) => handleFileChange(e, 'document')}
            />
            <input
              ref={directAudioRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, 'audio')}
            />
            <input
              ref={quickUploadRef}
              type="file"
              accept={
                activeQuickCat === 'audio'
                  ? 'audio/*'
                  : activeQuickCat === 'video'
                  ? 'video/*'
                  : activeQuickCat === 'image'
                  ? 'image/*'
                  : '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt'
              }
              className="hidden"
              onChange={handleUploadQuickFile}
            />
          </div>
        ) : (
          /* Template Picker View */
          <div className="py-2 flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <span className="text-sm font-semibold text-slate-800 dark:text-white">
                Select Approved Template
              </span>
              <button
                onClick={() => setShowTemplatePicker(false)}
                className="text-xs text-[#008069] dark:text-[#25D366] font-semibold hover:underline"
              >
                Back to Attachments
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 pt-2">
              {templates.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">
                  No templates found. Sync templates in the Templates tab.
                </div>
              ) : (
                templates.map((tpl) => (
                  <button
                    key={tpl.name}
                    onClick={() => {
                      onSelectTemplate(tpl);
                      onClose();
                    }}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#008069] dark:hover:border-[#25D366] transition-colors bg-slate-50 dark:bg-slate-900/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                        {tpl.name}
                      </span>
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                        {tpl.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                      {tpl.components.find((c) => c.type === 'BODY')?.text || 'WhatsApp Template'}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
