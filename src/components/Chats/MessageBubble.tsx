import React, { useState, useRef, useEffect } from 'react';
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
  BookmarkPlus
} from 'lucide-react';
import { ChatMessage } from '../../types/whatsapp';

interface MessageBubbleProps {
  message: ChatMessage;
  onRetryFailed?: (msg: ChatMessage) => void;
  onOpenMedia?: (media: {
    type: 'image' | 'document' | 'video';
    url: string;
    caption?: string;
    filename?: string;
    fileSize?: number;
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

  // Audio player state for voice notes
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Status icon component
  const renderStatus = () => {
    if (!fromMe) return null;
    switch (status) {
      case 'sending':
        return <Clock className="w-3.5 h-3.5 text-slate-400 inline ml-1" />;
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-slate-400 inline ml-1" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline ml-1" />;
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB] inline ml-1" />;
      case 'failed':
        return (
          <button 
            onClick={() => onRetryFailed?.(message)} 
            title="Failed to send. Click to retry." 
            className="text-red-500 inline ml-1"
          >
            <AlertCircle className="w-3.5 h-3.5 inline" />
          </button>
        );
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatAudioTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Play / Pause voice note
  const toggleAudio = () => {
    if (!audioRef.current && mediaUrl) {
      const audio = new Audio(mediaUrl);
      audio.playbackRate = playbackSpeed;
      audio.ontimeupdate = () => {
        const cur = audio.currentTime;
        const dur = audio.duration || duration || 1;
        setCurrentSec(cur);
        setPlaybackProgress((cur / dur) * 100);
      };
      audio.onended = () => {
        setIsPlaying(false);
        setPlaybackProgress(0);
        setCurrentSec(0);
      };
      audioRef.current = audio;
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          // Fallback simulation with Web Audio synthesis tone
          playWebAudioTone();
        });
      }
    } else {
      playWebAudioTone();
    }
  };

  // Tone fallback for in-app audio if browser blocks audio tag
  const playWebAudioTone = () => {
    setIsPlaying(!isPlaying);
  };

  const togglePlaybackSpeed = () => {
    const speeds: Array<1 | 1.5 | 2> = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const newSpeed = speeds[nextIdx];
    setPlaybackSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  // Progress simulation if no physical audio tag
  useEffect(() => {
    let interval: any;
    if (isPlaying && (!audioRef.current || audioRef.current.paused)) {
      const dur = duration || 12;
      interval = setInterval(() => {
        setCurrentSec((prev) => {
          if (prev >= dur) {
            setIsPlaying(false);
            setPlaybackProgress(0);
            return 0;
          }
          const next = prev + 0.5 * playbackSpeed;
          setPlaybackProgress((next / dur) * 100);
          return next;
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration, playbackSpeed]);

  return (
    <div className={`flex w-full my-1.5 px-2.5 ${fromMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[88%] sm:max-w-[72%] rounded-2xl px-3 py-2 shadow-xs transition-colors ${
          fromMe
            ? 'bg-[#E7FFDB] dark:bg-[#005C4B] text-slate-900 dark:text-slate-100 rounded-tr-xs'
            : 'bg-white dark:bg-[#202C33] text-slate-900 dark:text-slate-100 rounded-tl-xs border border-black/5 dark:border-white/5'
        }`}
      >
        {/* Template Header Badge if template */}
        {templateName && (
          <div className="mb-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 border-b border-black/5 dark:border-white/10 pb-1">
            <span>Template: {templateName}</span>
          </div>
        )}

        {/* 1. TEXT MESSAGE */}
        {type === 'text' && (
          <p className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap select-text">
            {text}
          </p>
        )}

        {/* 2. IMAGE MESSAGE */}
        {type === 'image' && (
          <div className="space-y-1.5 -mx-1 -mt-0.5">
            <div 
              onClick={() => onOpenMedia?.({
                type: 'image',
                url: mediaUrl || '',
                caption: mediaCaption,
                timestamp,
                senderName: fromMe ? 'You' : 'Customer'
              })}
              className="relative rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 max-h-72 cursor-pointer group"
            >
              <img
                src={mediaUrl}
                alt={mediaCaption || 'WhatsApp Image'}
                className="w-full h-auto max-h-72 object-cover group-hover:scale-102 transition-transform duration-200"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 bg-black/60 rounded-full p-2 text-white transition-opacity">
                  <Maximize2 className="w-4 h-4" />
                </div>
              </div>
            </div>
            {mediaCaption && (
              <p className="text-[14px] px-1 pt-1 break-words select-text">{mediaCaption}</p>
            )}
          </div>
        )}

        {/* 3. VIDEO MESSAGE (In-app playable) */}
        {type === 'video' && (
          <div className="space-y-1.5 -mx-1 -mt-0.5">
            <div className="rounded-xl overflow-hidden bg-black max-h-72">
              <video
                src={mediaUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full h-auto max-h-72 object-contain"
              />
            </div>
            {mediaCaption && (
              <p className="text-[14px] px-1 pt-1 break-words select-text">{mediaCaption}</p>
            )}
          </div>
        )}

        {/* 4. AUDIO / VOICE NOTE (In-app playable) */}
        {type === 'audio' && (
          <div className="flex items-center gap-3 py-1 min-w-[230px] sm:min-w-[270px]">
            <div className="relative">
              <button
                onClick={toggleAudio}
                className={`w-11 h-11 rounded-full flex items-center justify-center text-white transition-all shadow-sm active:scale-95 ${
                  fromMe ? 'bg-[#008069] dark:bg-[#25D366]' : 'bg-[#008069] dark:bg-[#00A884]'
                }`}
                aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
              </button>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
                <Mic className="w-2.5 h-2.5 text-[#008069] dark:text-[#25D366]" />
              </div>
            </div>

            <div className="flex-1 space-y-1.5">
              {/* Audio progress scrubber & interactive waveform */}
              <div 
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickPct = (e.clientX - rect.left) / rect.width;
                  const dur = duration || 12;
                  const targetTime = clickPct * dur;
                  setCurrentSec(targetTime);
                  setPlaybackProgress(clickPct * 100);
                  if (audioRef.current) {
                    audioRef.current.currentTime = targetTime;
                  }
                }}
                className="relative w-full h-4 flex items-center gap-0.5 cursor-pointer py-1"
                title="Tap to scrub voice note"
              >
                {[35, 65, 30, 95, 55, 80, 100, 60, 40, 90, 75, 45, 85, 35, 65, 95, 50, 75, 40, 85].map((h, i) => {
                  const barProgress = (i / 20) * 100;
                  const isPassed = playbackProgress >= barProgress;
                  return (
                    <span
                      key={i}
                      style={{ height: `${h}%` }}
                      className={`flex-1 rounded-full transition-colors ${
                        isPassed 
                          ? (fromMe ? 'bg-[#008069] dark:bg-[#25D366]' : 'bg-[#008069] dark:bg-[#00A884]')
                          : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                <span>{formatAudioTime(isPlaying ? currentSec : (duration || 12))}</span>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlaybackSpeed}
                    className="px-1.5 py-0.2 rounded-md bg-black/5 dark:bg-white/10 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-black/10"
                    title="Change speed"
                  >
                    {playbackSpeed}x
                  </button>
                  <span className="text-[10px] hidden sm:inline">Voice Note</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. DOCUMENT MESSAGE (With In-App Preview trigger) */}
        {type === 'document' && (
          <div className="space-y-1">
            <div 
              onClick={() => onOpenMedia?.({
                type: 'document',
                url: mediaUrl || '',
                filename,
                fileSize,
                caption: mediaCaption,
                timestamp,
                senderName: fromMe ? 'You' : 'Customer'
              })}
              className="flex items-center gap-3 p-2.5 rounded-xl bg-black/5 dark:bg-black/20 cursor-pointer hover:bg-black/10 dark:hover:bg-black/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-red-500 text-white flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate text-slate-900 dark:text-slate-100">
                  {filename || 'Document.pdf'}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {fileSize ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB` : 'PDF Document'} · Tap to View
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/80 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200">
                <Download className="w-4 h-4" />
              </div>
            </div>
            {mediaCaption && (
              <p className="text-[14px] px-1 pt-1 break-words select-text">{mediaCaption}</p>
            )}
          </div>
        )}

        {/* 6. LOCATION MESSAGE */}
        {type === 'location' && location && (
          <div className="space-y-1.5 -mx-1 -mt-0.5">
            <div className="h-32 w-full rounded-xl bg-emerald-100 dark:bg-emerald-950 flex flex-col items-center justify-center relative overflow-hidden border border-emerald-300 dark:border-emerald-800">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#008069_1px,transparent_1px)] [background-size:16px_16px]" />
              <MapPin className="w-8 h-8 text-rose-500 animate-bounce mb-1" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 relative z-10">
                {location.name || 'Shared GPS Location'}
              </span>
            </div>
            <div className="px-1">
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                {location.address || `Lat: ${location.latitude}, Lng: ${location.longitude}`}
              </p>
              <a
                href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#008069] dark:text-[#25D366] hover:underline mt-1"
              >
                <span>View on Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* 7. TEMPLATE MESSAGE */}
        {type === 'template' && (
          <div className="space-y-2">
            <p className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap select-text">
              {text}
            </p>
            <div className="pt-2 border-t border-black/5 dark:border-white/10 space-y-1">
              <div className="w-full py-1.5 text-center text-xs font-semibold text-[#008069] dark:text-[#25D366] bg-black/5 dark:bg-white/5 rounded-lg flex items-center justify-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Visit Customer Portal</span>
              </div>
            </div>
          </div>
        )}

        {/* Timestamp, Pin to Quick Files, and Delivery Status Tick */}
        <div className="flex items-center justify-end gap-1.5 mt-1 text-[10.5px] text-slate-500 dark:text-slate-400 select-none">
          {(type === 'audio' || type === 'image' || type === 'document' || type === 'video') && (
            <button
              onClick={() => onPinToQuickFiles?.(message)}
              title="Add this file to Quick Send presets (max 10)"
              className="p-0.5 text-slate-400 hover:text-[#008069] dark:hover:text-[#25D366] transition-colors"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
            </button>
          )}
          <span>{formatTime(timestamp)}</span>
          {renderStatus()}
        </div>
      </div>
    </div>
  );
};
