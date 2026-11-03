import React from 'react';
import { X, Download, ArrowLeft, FileText, Share2, ZoomIn, ZoomOut } from 'lucide-react';
import { ChatMessage } from '../../types/whatsapp';

interface MediaViewerModalProps {
  media: {
    type: 'image' | 'document' | 'video';
    url: string;
    caption?: string;
    filename?: string;
    fileSize?: number;
    senderName?: string;
    timestamp?: number;
  } | null;
  onClose: () => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({ media, onClose }) => {
  const [zoom, setZoom] = React.useState(1);

  if (!media) return null;

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md text-white animate-in fade-in select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
            title="Back to chat"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate text-white">
              {media.filename || media.caption || (media.type === 'image' ? 'Photo' : 'Media')}
            </h3>
            <p className="text-[11px] text-slate-400">
              {media.senderName} · {formatTime(media.timestamp)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {media.type === 'image' && (
            <>
              <button
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.3))}
                className="p-2 rounded-full hover:bg-white/10 text-slate-300 hover:text-white"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.8, z - 0.3))}
                className="p-2 rounded-full hover:bg-white/10 text-slate-300 hover:text-white"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </>
          )}

          {media.url && (
            <a
              href={media.url}
              download={media.filename || 'whatsapp_media'}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full hover:bg-white/10 text-slate-300 hover:text-white"
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </a>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-slate-300 hover:text-white ml-1"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Viewport */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {media.type === 'image' && (
          <div className="max-w-4xl max-h-full flex flex-col items-center justify-center">
            <img
              src={media.url}
              alt={media.caption || 'Image'}
              style={{ transform: `scale(${zoom})` }}
              className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-200 cursor-zoom-in"
              onClick={() => setZoom((z) => (z > 1 ? 1 : 1.6))}
            />
          </div>
        )}

        {media.type === 'document' && (
          <div className="w-full max-w-md bg-[#1F2C34] rounded-2xl p-6 border border-white/10 text-center shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto">
              <FileText className="w-8 h-8" />
            </div>

            <div>
              <h4 className="text-base font-bold text-white break-words">
                {media.filename || 'Document.pdf'}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {media.fileSize ? `${(media.fileSize / (1024 * 1024)).toFixed(2)} MB` : 'PDF Document'} · WhatsApp Verified
              </p>
            </div>

            {media.caption && (
              <p className="text-xs text-slate-300 bg-white/5 p-3 rounded-xl border border-white/5 italic">
                "{media.caption}"
              </p>
            )}

            <div className="pt-2 flex items-center gap-2">
              <a
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#008069] hover:bg-[#00A884] text-white font-semibold text-xs shadow-md transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Open &amp; Download Document</span>
              </a>
            </div>
          </div>
        )}

        {media.type === 'video' && (
          <div className="max-w-3xl w-full">
            <video
              src={media.url}
              controls
              autoPlay
              className="w-full max-h-[75vh] rounded-xl shadow-2xl object-contain bg-black"
            />
          </div>
        )}
      </div>

      {/* Caption Footer */}
      {media.caption && (
        <div className="px-6 py-3.5 bg-black/60 border-t border-white/10 text-center text-xs text-slate-200 shrink-0">
          <p className="max-w-2xl mx-auto">{media.caption}</p>
        </div>
      )}
    </div>
  );
};
