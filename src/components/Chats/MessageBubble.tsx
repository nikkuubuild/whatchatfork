import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Play,
  Pause,
  FileText,
  Download,
  MapPin,
  ExternalLink,
  Mic,
  Maximize2,
  BookmarkPlus,
  Image as ImageIcon,
  RotateCcw,
  Film,
  File,
  Music,
  RefreshCw
} from 'lucide-react';
import { ChatMessage } from '../../types/whatsapp';
import { resolveMediaUrl } from '../../utils/mediaResolver';
import { formatMessageTime } from '../../utils/dateFormatter';

interface MessageBubbleProps {
  message: ChatMessage;
  onRetryFailed?: (msg: ChatMessage) => void;
  onOpenMedia?: (media: {
    type: 'image' | 'document' | 'video' | 'audio';
    url: string;
    caption?: string;
    filename?: string;
    fileSize?: number;
    mimeType?: string;
    senderName?: string;
    timestamp?: number;
  }) => void;
  onPinToQuickFiles?: (msg: ChatMessage) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onRetryFailed,
  onOpenMedia,
  onPinToQuickFiles
}) => {
  const { fromMe, type, text, mediaUrl, mediaCaption, filename, fileSize, duration, location, timestamp, status, templateName } = message;

  const resolvedUrl = resolveMediaUrl(mediaUrl);

  /* ── Image state ── */
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Audio state ── */
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const formatTime = (ts: any) => formatMessageTime(ts);

  const formatAudioTime = (sec: number) => {
    const totalSec = Math.round(sec);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  /* ── Delivery status tick ── */
  const renderStatus = (isWhite = false) => {
    if (!fromMe) return null;
    const cls = isWhite ? 'text-white/90' : 'text-slate-400 dark:text-slate-500';
    switch (status) {
      case 'sending':  return <Clock className={`w-3.5 h-3.5 inline ml-0.5 ${cls}`} />;
      case 'sent':     return <Check className={`w-3.5 h-3.5 inline ml-0.5 ${cls}`} />;
      case 'delivered':return <CheckCheck className={`w-3.5 h-3.5 inline ml-0.5 ${cls}`} />;
      case 'read':     return <CheckCheck className="w-3.5 h-3.5 inline ml-0.5 text-[#53BDEB]" />;
      case 'failed':
        return (
          <button
            onClick={() => onRetryFailed?.(message)}
            title="Failed — tap to retry"
            className="inline ml-0.5 text-red-500"
          >
            <AlertCircle className="w-3.5 h-3.5 inline" />
          </button>
        );
    }
  };

  /* ── Image: detect already-cached images & manage loading lifecycle ── */
  const handleImageRef = useCallback((el: HTMLImageElement | null) => {
    imgRef.current = el;
    if (el && el.complete && el.naturalWidth > 0) {
      setImageLoaded(true);
      setImageError(false);
    }
  }, []);

  useEffect(() => {
    if (type !== 'image' || !resolvedUrl) return;

    // Reset when resolvedUrl or retryKey changes
    setImageLoaded(false);
    setImageError(false);

    // If image is already complete in DOM cache
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setImageLoaded(true);
      return;
    }

    // Safety fallback: after 14s, if still not loaded, display retry card
    imgTimeoutRef.current = setTimeout(() => {
      setImageLoaded((loaded) => {
        if (!loaded) {
          setImageError(true);
        }
        return loaded;
      });
    }, 14000);

    return () => {
      if (imgTimeoutRef.current) {
        clearTimeout(imgTimeoutRef.current);
        imgTimeoutRef.current = null;
      }
    };
  }, [type, resolvedUrl, retryKey]);

  /* ── Audio engine ── */
  const initAudio = useCallback(() => {
    if (audioRef.current || !resolvedUrl) return;
    const audio = new Audio(resolvedUrl);
    audio.playbackRate = playbackSpeed;
    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration)) setAudioDuration(audio.duration);
    };
    audio.ontimeupdate = () => {
      const dur = isFinite(audio.duration) ? audio.duration : (audioDuration || 12);
      setCurrentSec(audio.currentTime);
      setPlaybackProgress((audio.currentTime / dur) * 100);
    };
    audio.onended = () => {
      setIsPlaying(false);
      setPlaybackProgress(0);
      setCurrentSec(0);
    };
    audioRef.current = audio;
  }, [resolvedUrl, playbackSpeed, audioDuration]);

  const toggleAudio = () => {
    initAudio();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const togglePlaybackSpeed = () => {
    const speeds: Array<1 | 1.5 | 2> = [1, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const scrubAudio = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = (audioRef.current && isFinite(audioRef.current.duration)) ? audioRef.current.duration : (audioDuration || 12);
    const targetTime = pct * dur;
    setCurrentSec(targetTime);
    setPlaybackProgress(pct * 100);
    if (audioRef.current) audioRef.current.currentTime = targetTime;
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };
  }, []);

  /* ── Image-only bubble (no caption) = no padding, photo fills bubble ── */
  const isImageOnly = type === 'image' && !mediaCaption && !imageError;

  const bubbleBase = `relative max-w-[88%] sm:max-w-[72%] rounded-2xl shadow-sm transition-colors`;
  const sentBubble = 'bg-[#E7FFDB] dark:bg-[#005C4B] text-slate-900 dark:text-slate-100 rounded-tr-sm';
  const recvBubble = 'bg-white dark:bg-[#202C33] text-slate-900 dark:text-slate-100 rounded-tl-sm border border-black/5 dark:border-white/5';

  const bubbleClass = type === 'sticker'
    ? `${bubbleBase} bg-transparent shadow-none px-1 py-1`
    : isImageOnly
      ? `${bubbleBase} p-1 ${fromMe ? sentBubble : recvBubble}`
      : `${bubbleBase} px-3 py-2 ${fromMe ? sentBubble : recvBubble}`;

  /* ── Helper: determine readable file type label ── */
  const getFileExt = (name?: string) => {
    if (!name) return 'FILE';
    const ext = name.split('.').pop()?.toUpperCase() || 'FILE';
    return ext.length > 5 ? ext.substring(0, 5) : ext;
  };

  /* ── Waveform bars for voice note ── */
  const BARS = [35, 65, 30, 95, 55, 80, 100, 60, 40, 90, 75, 45, 85, 35, 65, 95, 50, 75, 40, 85];

  return (
    <div className={`flex w-full my-0.5 px-2 ${fromMe ? 'justify-end' : 'justify-start'}`}>
      <div className={bubbleClass}>

        {/* ── Template badge ── */}
        {templateName && (
          <div className="mb-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 border-b border-black/5 dark:border-white/10 pb-1">
            Template: {templateName}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            1.  TEXT
        ═══════════════════════════════════════════════════════ */}
        {type === 'text' && (
          <p className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap select-text">{text}</p>
        )}

        {/* ═══════════════════════════════════════════════════════
            2.  IMAGE  — real WhatsApp style
        ═══════════════════════════════════════════════════════ */}
        {type === 'image' && (
          <div>
            {imageError ? (
              /* ── Error / retry card ── */
              <div
                onClick={() => onOpenMedia?.({ type: 'image', url: resolvedUrl, caption: mediaCaption, timestamp, senderName: fromMe ? 'You' : 'Customer' })}
                className="flex flex-col items-center justify-center gap-2 p-5 min-w-[220px] max-w-[340px] rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer text-center"
              >
                <div className="w-11 h-11 rounded-full bg-[#008069]/10 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-[#008069]" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{filename || mediaCaption || 'WhatsApp Photo'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Could not load — tap to retry</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setImageError(false); setImageLoaded(false); setRetryKey(k => k + 1); }}
                  className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#008069] hover:bg-[#006b57] text-white text-[11px] font-semibold transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reload
                </button>
              </div>
            ) : (
              /* ── Normal photo container ── */
              <div
                onClick={() => onOpenMedia?.({ type: 'image', url: resolvedUrl, caption: mediaCaption, timestamp, senderName: fromMe ? 'You' : 'Customer' })}
                className="relative rounded-xl overflow-hidden cursor-pointer group select-none min-h-[140px] flex items-center justify-center bg-[#1a1a2e]"
                style={{ minWidth: 200, maxWidth: 340 }}
              >
                {/* Skeleton while loading */}
                {!imageLoaded && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 animate-pulse bg-slate-800/80 z-10">
                    <ImageIcon className="w-8 h-8 text-slate-400 opacity-60" />
                    <span className="text-[11px] text-slate-400 font-medium">Loading photo…</span>
                  </div>
                )}

                {/* The actual image — eagerly fetched and smoothly revealed */}
                <img
                  key={retryKey}
                  ref={handleImageRef}
                  src={retryKey > 0 ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_r=${retryKey}` : resolvedUrl}
                  alt={mediaCaption || ''}
                  loading="eager"
                  decoding="async"
                  onLoad={() => {
                    setImageLoaded(true);
                    setImageError(false);
                    if (imgTimeoutRef.current) clearTimeout(imgTimeoutRef.current);
                  }}
                  onError={() => {
                    console.warn('[Bubble] img load failed:', resolvedUrl);
                    setImageError(true);
                    if (imgTimeoutRef.current) clearTimeout(imgTimeoutRef.current);
                  }}
                  className={`w-full h-auto block object-cover max-h-[380px] transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                />

                {/* Hover — expand icon */}
                {imageLoaded && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none flex items-center justify-center z-20">
                    <div className="opacity-0 group-hover:opacity-100 bg-black/60 rounded-full p-2 text-white transition-opacity shadow">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                  </div>
                )}

                {/* Floating timestamp pill (captionless photos only) */}
                {!mediaCaption && (
                  <div className="absolute bottom-1.5 right-2 bg-black/55 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow z-20 select-none pointer-events-none backdrop-blur-xs">
                    <span>{formatTime(timestamp)}</span>
                    {renderStatus(true)}
                  </div>
                )}
              </div>
            )}

            {/* Caption below photo */}
            {mediaCaption && (
              <p className="text-[14px] px-1 pt-1.5 pb-0.5 break-words select-text leading-snug">{mediaCaption}</p>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            2b. STICKER / GIF
        ═══════════════════════════════════════════════════════ */}
        {type === 'sticker' && (
          <div className="py-1">
            {resolvedUrl ? (
              <div
                onClick={() => onOpenMedia?.({ type: 'image', url: resolvedUrl, caption: 'Sticker', timestamp, senderName: fromMe ? 'You' : 'Customer' })}
                className="cursor-pointer max-w-[160px] flex items-center justify-center group"
              >
                <img
                  src={resolvedUrl}
                  alt="Sticker"
                  className="w-32 h-32 object-contain group-hover:scale-105 transition-transform duration-200"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <span className="text-2xl">🎨</span>
                <span className="text-[13px] text-slate-600 dark:text-slate-300">Sticker</span>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            3.  VIDEO — inline player + fullscreen button
        ═══════════════════════════════════════════════════════ */}
        {type === 'video' && (
          <div>
            <div className="relative rounded-xl overflow-hidden bg-black group" style={{ minWidth: 220, maxWidth: 340 }}>
              {resolvedUrl ? (
                <video
                  src={resolvedUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-auto block"
                  style={{ maxHeight: 300, background: '#000' }}
                  onError={e => console.warn('[Bubble] video load failed:', resolvedUrl, e)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 h-40 bg-slate-900 text-slate-400">
                  <Film className="w-8 h-8 opacity-50" />
                  <span className="text-[11px]">Video unavailable</span>
                </div>
              )}
              <button
                onClick={() => onOpenMedia?.({ type: 'video', url: resolvedUrl, caption: mediaCaption, filename, timestamp, senderName: fromMe ? 'You' : 'Customer' })}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Fullscreen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {mediaCaption && (
              <p className="text-[14px] px-1 pt-1 break-words select-text">{mediaCaption}</p>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            4.  AUDIO / VOICE NOTE
        ═══════════════════════════════════════════════════════ */}
        {type === 'audio' && (
          <div className="flex items-center gap-3 py-1" style={{ minWidth: 240, maxWidth: 320 }}>
            {/* Play/Pause button */}
            <div className="relative shrink-0">
              <button
                onClick={toggleAudio}
                className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-sm active:scale-95 transition-all ${fromMe ? 'bg-[#008069] dark:bg-[#25D366]' : 'bg-[#008069] dark:bg-[#00A884]'}`}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
              </button>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white dark:bg-[#202C33] flex items-center justify-center">
                <Mic className="w-2.5 h-2.5 text-[#008069] dark:text-[#25D366]" />
              </div>
            </div>

            {/* Waveform + timer */}
            <div className="flex-1 space-y-1">
              <div
                onClick={scrubAudio}
                className="relative w-full h-5 flex items-center gap-[2px] cursor-pointer"
                title="Tap to scrub"
              >
                {BARS.map((h, i) => {
                  const barPct = (i / BARS.length) * 100;
                  const played = playbackProgress >= barPct;
                  return (
                    <span
                      key={i}
                      style={{ height: `${h}%` }}
                      className={`flex-1 rounded-full transition-colors ${played
                        ? (fromMe ? 'bg-[#008069] dark:bg-[#25D366]' : 'bg-[#008069] dark:bg-[#00A884]')
                        : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400 font-mono">
                <span>{formatAudioTime(isPlaying ? currentSec : (audioDuration || duration || 0))}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlaybackSpeed}
                    className="px-1.5 rounded bg-black/5 dark:bg-white/10 text-[10px] font-bold hover:bg-black/10 dark:hover:bg-white/20"
                  >
                    {playbackSpeed}x
                  </button>
                  <span className="hidden sm:inline text-[10px]">Voice Note</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            5.  DOCUMENT / FILE
        ═══════════════════════════════════════════════════════ */}
        {type === 'document' && (
          <div>
            <div
              onClick={() => onOpenMedia?.({ type: 'document', url: resolvedUrl || '', caption: mediaCaption, filename, fileSize, timestamp, senderName: fromMe ? 'You' : 'Customer' })}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-black/5 dark:bg-black/20 cursor-pointer hover:bg-black/10 dark:hover:bg-black/30 transition-colors"
              style={{ minWidth: 220 }}
            >
              {/* File icon with extension badge */}
              <div className="relative shrink-0">
                <div className="w-11 h-11 rounded-xl bg-indigo-500 dark:bg-indigo-600 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <span className="absolute -bottom-1 -right-1 bg-slate-700 text-white text-[8px] font-bold px-1 rounded leading-tight">
                  {getFileExt(filename)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate text-slate-900 dark:text-slate-100">
                  {filename || 'Document'}
                </p>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {fileSize ? `${(fileSize / 1024).toFixed(0)} KB` : 'Tap to open'} · {getFileExt(filename)}
                </p>
              </div>

              <a
                href={resolvedUrl || '#'}
                download={filename || 'file'}
                onClick={e => e.stopPropagation()}
                className="shrink-0 w-8 h-8 rounded-full bg-white/70 dark:bg-slate-700 hover:bg-white dark:hover:bg-slate-600 flex items-center justify-center transition-colors shadow-xs"
                title="Download"
              >
                <Download className="w-4 h-4 text-slate-600 dark:text-slate-200" />
              </a>
            </div>

            {mediaCaption && (
              <p className="text-[14px] px-1 pt-1 break-words select-text">{mediaCaption}</p>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            6.  LOCATION
        ═══════════════════════════════════════════════════════ */}
        {type === 'location' && location && (
          <div className="space-y-1.5" style={{ minWidth: 220 }}>
            <div className="relative h-32 w-full rounded-xl overflow-hidden bg-emerald-50 dark:bg-emerald-950 flex flex-col items-center justify-center border border-emerald-200 dark:border-emerald-800">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#008069_1px,transparent_1px)] [background-size:16px_16px]" />
              <MapPin className="w-8 h-8 text-rose-500 animate-bounce mb-1" />
              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200 relative z-10 px-3 text-center">
                {location.name || 'Shared Location'}
              </span>
            </div>
            <div>
              <p className="text-[12px] text-slate-600 dark:text-slate-300">
                {location.address || `${location.latitude?.toFixed(4)}, ${location.longitude?.toFixed(4)}`}
              </p>
              <a
                href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#008069] dark:text-[#25D366] hover:underline mt-0.5"
              >
                <span>View on Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            7.  TEMPLATE
        ═══════════════════════════════════════════════════════ */}
        {type === 'template' && (
          <div className="space-y-2">
            <p className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap select-text">{text}</p>
            <div className="pt-2 border-t border-black/5 dark:border-white/10">
              <div className="w-full py-1.5 text-center text-xs font-semibold text-[#008069] dark:text-[#25D366] bg-black/5 dark:bg-white/5 rounded-lg flex items-center justify-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Visit Customer Portal</span>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            8.  UNSUPPORTED / INTERACTIVE / BUTTON — graceful fallback
        ═══════════════════════════════════════════════════════ */}
        {type !== 'text' && type !== 'image' && type !== 'sticker' && type !== 'video' && type !== 'audio' && type !== 'document' && type !== 'location' && type !== 'template' && (
          <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap select-text">
            {text || 'Message received'}
          </p>
        )}

        {/* ═══════════════════════════════════════════════════════
            Bottom row: pin + time + ticks
            Hidden for captionless images (timestamp is inside the photo pill)
        ═══════════════════════════════════════════════════════ */}
        {(!isImageOnly || imageError) && (
          <div className="flex items-center justify-end gap-1.5 mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 select-none">
            {(type === 'audio' || type === 'image' || type === 'document' || type === 'video') && (
              <button
                onClick={() => onPinToQuickFiles?.(message)}
                title="Add to Quick Files"
                className="p-0.5 hover:text-[#008069] dark:hover:text-[#25D366] transition-colors"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
              </button>
            )}
            <span>{formatTime(timestamp)}</span>
            {renderStatus()}
          </div>
        )}

      </div>
    </div>
  );
};
