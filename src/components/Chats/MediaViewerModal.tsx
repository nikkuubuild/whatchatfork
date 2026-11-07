import React, { useState, useRef, useEffect } from 'react';
import { X, Download, ArrowLeft, FileText, ZoomIn, ZoomOut, Play, Pause, Mic, RotateCcw, Film, Music } from 'lucide-react';
import { resolveMediaUrl } from '../../utils/mediaResolver';
import { safeTimestamp } from '../../utils/dateFormatter';

interface MediaItem {
  type: 'image' | 'document' | 'video' | 'audio';
  url: string;
  caption?: string;
  filename?: string;
  fileSize?: number;
  mimeType?: string;
  senderName?: string;
  timestamp?: number;
}

interface MediaViewerModalProps {
  media: MediaItem | null;
  onClose: () => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({ media, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  /* ── Audio state for audio type ── */
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSec, setCurrentSec] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Reset state when media changes
    setZoom(1);
    setImgError(false);
    setImgLoaded(false);
    setIsPlaying(false);
    setProgress(0);
    setCurrentSec(0);
    setTotalDuration(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [media?.url]);

  useEffect(() => {
    // Keyboard: Escape closes
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!media) return null;

  const resolvedUrl = resolveMediaUrl(media.url);

  const formatTs = (ts?: any) => {
    if (!ts) return '';
    const ms = safeTimestamp(ts);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const fmtSec = (s: number) => {
    const r = Math.round(s);
    const m = Math.floor(r / 60);
    return `${m}:${(r % 60).toString().padStart(2, '0')}`;
  };

  const getFileExt = (name?: string) => {
    if (!name) return 'FILE';
    return (name.split('.').pop()?.toUpperCase() || 'FILE').substring(0, 5);
  };

  /* ── Audio engine (lazy init) ── */
  const ensureAudio = () => {
    if (audioRef.current || !resolvedUrl) return;
    const audio = new Audio(resolvedUrl);
    audio.playbackRate = speed;
    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration)) setTotalDuration(audio.duration);
    };
    audio.ontimeupdate = () => {
      const dur = isFinite(audio.duration) ? audio.duration : (totalDuration || 1);
      setCurrentSec(audio.currentTime);
      setProgress((audio.currentTime / dur) * 100);
    };
    audio.onended = () => { setIsPlaying(false); setProgress(0); setCurrentSec(0); };
    audioRef.current = audio;
  };

  const toggleAudio = () => {
    ensureAudio();
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false)); }
  };

  const toggleSpeed = () => {
    const speeds: Array<1 | 1.5 | 2> = [1, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const scrub = (e: React.MouseEvent<HTMLDivElement>) => {
    ensureAudio();
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = isFinite(audioRef.current.duration) ? audioRef.current.duration : (totalDuration || 1);
    audioRef.current.currentTime = pct * dur;
  };

  const title = media.filename || media.caption || (() => {
    switch (media.type) {
      case 'image':    return 'Photo';
      case 'video':    return 'Video';
      case 'audio':    return 'Voice Note';
      case 'document': return 'Document';
    }
  })();

  const BARS = [35, 65, 30, 95, 55, 80, 100, 60, 40, 90, 75, 45, 85, 35, 65, 95, 50, 75, 40, 85, 55, 70, 40, 60];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/97 backdrop-blur-md text-white animate-in fade-in select-none">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors" title="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{title}</h3>
            <p className="text-[11px] text-slate-400">{media.senderName && `${media.senderName} · `}{formatTs(media.timestamp)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls only for images */}
          {media.type === 'image' && (
            <>
              <button onClick={() => setZoom(z => Math.min(3, z + 0.4))} className="p-2 rounded-full hover:bg-white/10 text-slate-300" title="Zoom in">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.4))} className="p-2 rounded-full hover:bg-white/10 text-slate-300" title="Zoom out">
                <ZoomOut className="w-4 h-4" />
              </button>
              {zoom !== 1 && (
                <button onClick={() => setZoom(1)} className="p-2 rounded-full hover:bg-white/10 text-slate-300 text-[11px] font-bold" title="Reset zoom">
                  {Math.round(zoom * 100)}%
                </button>
              )}
            </>
          )}

          {/* Download */}
          {resolvedUrl && (
            <a
              href={resolvedUrl}
              download={media.filename || 'whatchat_media'}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full hover:bg-white/10 text-slate-300"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </a>
          )}

          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-slate-300 ml-1" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">

        {/* ─────── IMAGE ─────── */}
        {media.type === 'image' && (
          <div className="max-w-5xl max-h-full flex flex-col items-center gap-3 overflow-auto">
            {!resolvedUrl || imgError ? (
              <div className="flex flex-col items-center gap-3 p-8">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                  <RotateCcw className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-slate-400 text-sm">Could not load image</p>
                {resolvedUrl && (
                  <button
                    onClick={() => { setImgError(false); setImgLoaded(false); }}
                    className="px-4 py-2 bg-[#008069] hover:bg-[#006b57] text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
            ) : (
              <div className="relative overflow-auto min-h-[200px] flex items-center justify-center" style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}>
                {!imgLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                <img
                  src={resolvedUrl}
                  alt={media.caption || 'Photo'}
                  loading="eager"
                  decoding="async"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 0.2s' }}
                  className={`max-h-[78vh] w-auto max-w-full object-contain rounded-lg shadow-2xl transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setImgLoaded(true)}
                  onError={() => setImgError(true)}
                  onClick={() => setZoom(z => z > 1 ? 1 : 2)}
                  draggable={false}
                />
              </div>
            )}
          </div>
        )}

        {/* ─────── VIDEO ─────── */}
        {media.type === 'video' && (
          <div className="max-w-4xl w-full">
            {resolvedUrl ? (
              <video
                src={resolvedUrl}
                controls
                autoPlay
                playsInline
                className="w-full max-h-[78vh] rounded-xl shadow-2xl object-contain bg-black"
                style={{ background: '#000' }}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 p-8 text-slate-400">
                <Film className="w-12 h-12 opacity-40" />
                <p>Video not available</p>
              </div>
            )}
          </div>
        )}

        {/* ─────── AUDIO / VOICE NOTE ─────── */}
        {media.type === 'audio' && (
          <div className="w-full max-w-sm bg-[#1F2C34] rounded-2xl p-6 border border-white/10 shadow-2xl space-y-5">
            {/* Icon */}
            <div className="flex items-center gap-4">
              <button
                onClick={toggleAudio}
                className="w-14 h-14 rounded-full bg-[#008069] hover:bg-[#006b57] flex items-center justify-center shadow-lg transition-all active:scale-95"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-white text-white" /> : <Play className="w-6 h-6 fill-white text-white ml-0.5" />}
              </button>
              <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-slate-400">{media.senderName || 'Voice Note'}</p>
              </div>
            </div>

            {/* Waveform scrubber */}
            <div
              onClick={scrub}
              className="w-full h-10 flex items-center gap-[2px] cursor-pointer"
            >
              {BARS.map((h, i) => (
                <span
                  key={i}
                  style={{ height: `${h}%` }}
                  className={`flex-1 rounded-full transition-colors ${(i / BARS.length) * 100 <= progress ? 'bg-[#25D366]' : 'bg-slate-600'}`}
                />
              ))}
            </div>

            {/* Timer row */}
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>{fmtSec(currentSec)}</span>
              <button
                onClick={toggleSpeed}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 font-bold text-[11px]"
              >
                {speed}x
              </button>
              <span>{totalDuration > 0 ? fmtSec(totalDuration) : (media.filename ? '' : '—')}</span>
            </div>

            {/* Download link */}
            {resolvedUrl && (
              <a
                href={resolvedUrl}
                download={media.filename || 'voice_note.ogg'}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Voice Note
              </a>
            )}
          </div>
        )}

        {/* ─────── DOCUMENT ─────── */}
        {media.type === 'document' && (
          <div className="w-full max-w-sm bg-[#1F2C34] rounded-2xl p-6 border border-white/10 text-center shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-base text-white break-words">{media.filename || 'Document'}</p>
              <p className="text-xs text-slate-400 mt-1">
                {media.fileSize ? `${(media.fileSize / 1024).toFixed(0)} KB` : getFileExt(media.filename) + ' File'}
              </p>
            </div>
            {media.caption && (
              <p className="text-xs text-slate-300 bg-white/5 p-3 rounded-xl border border-white/5 italic">
                {media.caption}
              </p>
            )}
            <a
              href={resolvedUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={media.filename}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#008069] hover:bg-[#006b57] text-white font-semibold text-sm transition-all shadow"
            >
              <Download className="w-4 h-4" />
              Open & Download
            </a>
          </div>
        )}
      </div>

      {/* ── Caption footer ── */}
      {media.caption && media.type !== 'document' && (
        <div className="px-6 py-3 bg-black/60 border-t border-white/10 text-center text-sm text-slate-200 shrink-0">
          <p className="max-w-2xl mx-auto">{media.caption}</p>
        </div>
      )}
    </div>
  );
};
