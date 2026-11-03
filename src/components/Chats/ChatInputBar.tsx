import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Mic, Send, Smile, Trash2, StopCircle, ArrowUp } from 'lucide-react';
import { waAudio } from '../../utils/audio';

interface ChatInputBarProps {
  onSendMessage: (text: string) => void;
  onSendVoiceNote: (audioBlob: Blob, duration: number) => void;
  onOpenAttachment: () => void;
  disabled?: boolean;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSendMessage,
  onSendVoiceNote,
  onOpenAttachment,
  disabled = false
}) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setText('');
    waAudio.playSent();
    waAudio.vibrate(20);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone access is not supported on this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);
      waAudio.vibrate([15, 30]);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Error starting audio recording:', err);
      // Fallback simulated voice note if user denied mic or environment lacks hardware mic
      simulateMockVoiceRecording();
    }
  };

  // Simulated recording if real mic permission is not granted
  const simulateMockVoiceRecording = () => {
    setIsRecording(true);
    setRecordingSeconds(0);
    timerIntervalRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  };

  // Cancel voice recording
  const cancelRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
    waAudio.vibrate(40);
  };

  // Stop and send voice recording
  const finishRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const duration = Math.max(1, recordingSeconds);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        onSendVoiceNote(audioBlob, duration);
        waAudio.playSent();
        waAudio.vibrate(25);
      };
      mediaRecorderRef.current.stop();
    } else {
      // Mock audio blob
      const mockBlob = new Blob(['mock audio'], { type: 'audio/webm' });
      onSendVoiceNote(mockBlob, duration);
      waAudio.playSent();
      waAudio.vibrate(25);
    }

    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="relative px-3 py-2 bg-slate-100 dark:bg-[#1F2C34] border-t border-slate-200 dark:border-slate-800 transition-colors select-none">
      {isRecording ? (
        /* LIVE AUDIO RECORDING BAR */
        <div className="flex items-center justify-between gap-3 h-12 px-2 bg-white dark:bg-[#2A3942] rounded-full shadow-md animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse ml-2" />
            <span className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-100">
              {formatTimer(recordingSeconds)}
            </span>
            <div className="hidden sm:flex items-center gap-1 text-xs text-slate-400">
              <span>Recording voice note...</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cancelRecording}
              className="p-2 text-slate-500 hover:text-red-500 transition-colors rounded-full"
              title="Cancel recording"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={finishRecording}
              className="w-10 h-10 rounded-full bg-[#008069] dark:bg-[#25D366] text-white flex items-center justify-center hover:opacity-90 active:scale-95 transition-all shadow-md"
              title="Send voice note"
            >
              <ArrowUp className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        </div>
      ) : (
        /* STANDARD INPUT BAR */
        <div className="flex items-end gap-2 max-w-full">
          <div className="flex-1 flex items-end bg-white dark:bg-[#2A3942] rounded-3xl px-3 py-1.5 shadow-xs border border-slate-200 dark:border-slate-700/60 focus-within:border-[#008069] dark:focus-within:border-[#25D366] transition-all">
            {/* Emoji Trigger */}
            <button
              type="button"
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
              title="Emojis"
              onClick={() => setText((prev) => prev + ' 👋')}
            >
              <Smile className="w-5 h-5" />
            </button>

            {/* Auto-growing Text Input */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              disabled={disabled}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message"
              className="flex-1 bg-transparent px-2 py-1 text-[15px] max-h-32 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none resize-none overflow-y-auto"
            />

            {/* Paperclip Attachment Trigger */}
            <button
              type="button"
              onClick={onOpenAttachment}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0 -rotate-45"
              title="Attach media or document"
            >
              <Paperclip className="w-5 h-5" />
            </button>
          </div>

          {/* Action Button: Send or Mic */}
          {text.trim() ? (
            <button
              onClick={handleSend}
              disabled={disabled}
              className="w-11 h-11 rounded-full bg-[#008069] dark:bg-[#25D366] text-white flex items-center justify-center shadow-md active:scale-95 hover:opacity-95 transition-all shrink-0"
              title="Send message"
            >
              <Send className="w-5 h-5 ml-0.5" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={disabled}
              className="w-11 h-11 rounded-full bg-[#008069] dark:bg-[#25D366] text-white flex items-center justify-center shadow-md active:scale-95 hover:opacity-95 transition-all shrink-0"
              title="Hold to record voice message"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
