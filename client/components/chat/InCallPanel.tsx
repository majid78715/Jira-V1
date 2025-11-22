"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { CallState } from "../../features/chat/call/useCall";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useSpeechToText } from "../../hooks/useSpeechToText";

interface InCallPanelProps {
  callState: CallState;
  peerUser?: { name?: string; title?: string }; // For 1:1 fallback
  participantDetails?: Map<string, { name: string; title?: string }>;
  media: "audio" | "video";
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  isVideoEnabled: boolean;
  callTimerMs: number;
  debugLogs?: string[];
  remoteAudioReady: boolean;
  remoteAudioLevel: number;
  remoteAudioError?: string | null;
  onResumeRemoteAudio?: () => Promise<boolean> | boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onEnd: () => void;
  onTranscriptComplete?: (transcript: string) => void;
  currentUserName?: string;
  sendTranscript?: (text: string) => void;
  remoteTranscripts?: Array<{ fromUserId: string; text: string; timestamp: string }>;
}

function ParticipantView({ 
  stream, 
  isLocal = false, 
  muted = false, 
  name = "Participant",
  className 
}: { 
  stream: MediaStream | null; 
  isLocal?: boolean; 
  muted?: boolean; 
  name?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={clsx("relative overflow-hidden rounded-xl bg-black shadow-lg ring-1 ring-white/10", className)}>
      {stream ? (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          muted={isLocal || muted} // Always mute local, optionally mute remote
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-ink-900">
          <Avatar name={name} size={64} />
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-sm">
        {name} {isLocal && "(You)"}
      </div>
    </div>
  );
}

export function InCallPanel({
  callState,
  peerUser,
  participantDetails,
  media,
  localStream,
  remoteStreams,
  isMuted,
  isVideoEnabled,
  callTimerMs,
  debugLogs,
  remoteAudioReady,
  remoteAudioLevel,
  remoteAudioError,
  onResumeRemoteAudio,
  onToggleMute,
  onToggleVideo,
  onEnd,
  onTranscriptComplete,
  currentUserName,
  sendTranscript,
  remoteTranscripts = []
}: InCallPanelProps) {
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [resumePending, setResumePending] = useState(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);
  const resumeMessageTimeoutRef = useRef<number | null>(null);

  const [localTranscripts, setLocalTranscripts] = useState<Array<{ fromUserId: string; text: string; timestamp: string }>>([]);

  // Transcription Hook
  const { 
    isListening, 
    transcript, 
    interimTranscript, 
    startListening, 
    stopListening,
    error: transcriptionError 
  } = useSpeechToText({ 
    speakerName: currentUserName,
    onSegmentRecognized: (text) => {
      if (sendTranscript) {
        sendTranscript(text);
      }
      setLocalTranscripts(prev => [...prev, { 
        fromUserId: 'me', 
        text, 
        timestamp: new Date().toISOString() 
      }]);
    }
  });

  const allTranscripts = useMemo(() => {
    const remote = remoteTranscripts.map(t => ({ ...t, isLocal: false, name: peerUser?.name || 'Remote' }));
    const local = localTranscripts.map(t => ({ ...t, isLocal: true, name: currentUserName || 'Me' }));
    return [...remote, ...local].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [remoteTranscripts, localTranscripts, peerUser?.name, currentUserName]);
  
  const [transcriptionLang, setTranscriptionLang] = useState<'en-US' | 'ar-AE' | 'auto'>('en-US');
  const [showTranscript, setShowTranscript] = useState(false);

  const toggleTranscription = useCallback(() => {
    if (isListening) {
      stopListening();
      setShowTranscript(false);
    } else {
      startListening(transcriptionLang);
      setShowTranscript(true);
    }
  }, [isListening, stopListening, startListening, transcriptionLang]);

  // Restart listening if language changes while active
  useEffect(() => {
    if (isListening && transcriptionLang) {
      const restart = async () => {
         stopListening();
         await new Promise(resolve => setTimeout(resolve, 200));
         startListening(transcriptionLang);
      };
      restart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptionLang]);

  const cleanupResumeMessage = useCallback(() => {
    if (resumeMessageTimeoutRef.current) {
      window.clearTimeout(resumeMessageTimeoutRef.current);
      resumeMessageTimeoutRef.current = null;
    }
  }, []);

  const handleResumeAudio = useCallback(async () => {
    if (!onResumeRemoteAudio) {
      return;
    }
    cleanupResumeMessage();
    setResumePending(true);
    try {
      const result = await onResumeRemoteAudio();
      setResumeMessage(result ? "Audio link resumed" : "Audio output unavailable");
    } catch (error) {
      console.error("[CallUI] manual audio resume failed", error);
      setResumeMessage("Unable to resume audio");
    } finally {
      setResumePending(false);
      resumeMessageTimeoutRef.current = window.setTimeout(() => setResumeMessage(null), 4000);
    }
  }, [cleanupResumeMessage, onResumeRemoteAudio]);

  useEffect(() => () => cleanupResumeMessage(), [cleanupResumeMessage]);

  const timerLabel = useMemo(() => {
    const totalSeconds = Math.floor(callTimerMs / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [callTimerMs]);

  const statusLabel =
    callState === "RINGING"
      ? "Ringing..."
      : callState === "OUTGOING"
        ? "Calling..."
        : callState === "IN_CALL"
          ? "Live"
          : "Call ended";

  const handleEndCall = useCallback(() => {
    if (onTranscriptComplete) {
      const fullTranscript = allTranscripts
        .map(t => `**${t.name}:** ${t.text}`)
        .join('\n\n');
      onTranscriptComplete(fullTranscript || transcript);
    }
    onEnd();
  }, [transcript, onEnd, onTranscriptComplete, allTranscripts]);

  const remoteStreamsArray = useMemo(() => Array.from(remoteStreams.entries()), [remoteStreams]);
  const isGroupCall = remoteStreamsArray.length > 1;

  return (
    <div className="w-full relative flex flex-col h-full max-h-[80vh]">
      {/* Transcription Overlay */}
      {showTranscript && (
        <div className="absolute bottom-24 left-4 right-4 z-40 flex flex-col justify-end pointer-events-none">
          <div className="pointer-events-auto bg-ink-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[40vh] animate-in slide-in-from-bottom-4 fade-in duration-200">
             <div className="flex justify-between items-center px-4 py-3 bg-white/5 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-4">
                    <span className="text-[10px] font-bold text-brand-400 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/> 
                      Live Transcript
                    </span>
                    <div className="flex items-center gap-1 bg-white/5 rounded-md p-0.5 border border-white/5">
                        <button 
                            onClick={() => setTranscriptionLang('en-US')} 
                            className={clsx("px-2 py-0.5 rounded-[4px] text-[10px] font-medium transition-all", transcriptionLang === 'en-US' ? "bg-brand-500 text-white shadow-sm" : "text-white/40 hover:text-white hover:bg-white/5")}
                        >
                            EN
                        </button>
                        <button 
                            onClick={() => setTranscriptionLang('ar-AE')} 
                            className={clsx("px-2 py-0.5 rounded-[4px] text-[10px] font-medium transition-all", transcriptionLang === 'ar-AE' ? "bg-brand-500 text-white shadow-sm" : "text-white/40 hover:text-white hover:bg-white/5")}
                        >
                            AR
                        </button>
                        <button 
                            onClick={() => setTranscriptionLang('auto')} 
                            className={clsx("px-2 py-0.5 rounded-[4px] text-[10px] font-medium transition-all", transcriptionLang === 'auto' ? "bg-brand-500 text-white shadow-sm" : "text-white/40 hover:text-white hover:bg-white/5")}
                        >
                            AUTO
                        </button>
                    </div>
                </div>
                <button 
                    onClick={toggleTranscription}
                    className="text-white/40 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
                    title="Close Transcription"
                >
                    <XIcon className="w-4 h-4" />
                </button>
             </div>
             <div className="overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {allTranscripts.length === 0 && !interimTranscript && (
                  <div className="text-center text-white/30 italic py-8 text-xs">Listening for speech...</div>
                )}
                {allTranscripts.map((t, i) => (
                  <div key={i} className={clsx("flex flex-col", t.isLocal ? "items-end" : "items-start")}>
                    <span className="text-[9px] uppercase tracking-wider text-white/30 mb-1 px-1 font-medium">{t.name}</span>
                    <div className={clsx("px-3 py-2 rounded-xl max-w-[90%] text-sm leading-relaxed shadow-sm", t.isLocal ? "bg-brand-500/20 text-brand-50 border border-brand-500/20 rounded-tr-sm" : "bg-white/10 text-white/90 border border-white/5 rounded-tl-sm")}>
                      {t.text}
                    </div>
                  </div>
                ))}
                {interimTranscript && (
                  <div className="flex flex-col items-end animate-pulse">
                    <span className="text-[9px] uppercase tracking-wider text-brand-300/50 mb-1 px-1">Me (Speaking...)</span>
                    <div className="px-3 py-2 rounded-xl rounded-tr-sm max-w-[90%] bg-brand-500/10 text-brand-100/70 italic border border-brand-500/10 text-sm">
                      {interimTranscript}
                    </div>
                  </div>
                )}
                <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })} />
             </div>
          </div>
        </div>
      )}

      {/* Header Info */}
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Avatar name={peerUser?.name ?? "Group Call"} size={40} status="online" />
          <div>
            <p className="text-sm font-semibold text-white">{isGroupCall ? "Group Call" : (peerUser?.name ?? "Teammate")}</p>
            <div className="flex items-center gap-2 text-xs text-ink-300">
              <span className="uppercase tracking-wide">{statusLabel}</span>
              <span>•</span>
              <span className="font-mono">{timerLabel}</span>
            </div>
          </div>
        </div>
        
        {/* Audio Visualizer (Simple) */}
        {media === "audio" && remoteAudioLevel > 0.01 ? (
          <div className="flex items-end gap-1 h-4">
            {[...Array(5)].map((_, i) => (
              <div 
                key={i} 
                className="w-1 bg-brand-400 rounded-full animate-pulse"
                style={{ height: `${Math.min(100, Math.max(20, remoteAudioLevel * 100 * (i + 1)))}%` }}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Main Stage */}
      <div className="flex-1 relative min-h-0 flex flex-col gap-4">
        {/* Grid Layout */}
        <div className={clsx(
          "grid gap-4 flex-1 min-h-0",
          remoteStreamsArray.length === 0 ? "grid-cols-1" :
          remoteStreamsArray.length === 1 ? "grid-cols-1" :
          remoteStreamsArray.length <= 4 ? "grid-cols-2" :
          "grid-cols-3"
        )}>
          {/* Remote Participants */}
          {remoteStreamsArray.map(([peerId, stream]) => (
            <ParticipantView 
              key={peerId} 
              stream={stream} 
              name={participantDetails?.get(peerId)?.name ?? `User ${peerId.slice(0, 4)}`}
              className="w-full h-full"
            />
          ))}
          
          {/* Local Participant (if grid or no remote) */}
          {(remoteStreamsArray.length > 0 || media === "video") && (
             <ParticipantView 
               stream={localStream} 
               isLocal 
               name={currentUserName}
               className={clsx(
                 remoteStreamsArray.length === 0 ? "w-full h-full" : "absolute bottom-4 right-4 w-40 h-28 shadow-2xl border-2 border-white/20 z-10"
               )}
             />
          )}
          
          {/* Placeholder if no video and no remote */}
          {remoteStreamsArray.length === 0 && !localStream && (
             <div className="flex flex-col items-center justify-center rounded-xl bg-white/5 h-full">
                <Avatar name={peerUser?.name ?? "Remote"} size={96} status="online" className="mb-4" />
                <p className="text-white/60">Waiting for others to join...</p>
             </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center gap-3 py-4 shrink-0">
            <Button
              type="button"
              variant="ghost"
              className={clsx(
                "h-12 w-12 rounded-full p-0 hover:bg-white/10",
                isMuted ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-ink-800 text-white"
              )}
              onClick={onToggleMute}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOffIcon /> : <MicIcon />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={clsx(
                "h-12 w-12 rounded-full p-0 hover:bg-white/10",
                !isVideoEnabled ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-ink-800 text-white"
              )}
              onClick={onToggleVideo}
              title={isVideoEnabled ? "Turn video off" : "Turn video on"}
            >
              {!isVideoEnabled ? <VideoOffIcon /> : <VideoIcon />}
            </Button>
            
            <div className="mx-1 h-8 w-px bg-white/20" />
            
            <Button
              type="button"
              variant="ghost"
              className={clsx(
                "h-12 w-12 rounded-full p-0",
                isListening ? "bg-brand-500 text-white" : "bg-ink-800 text-ink-400 hover:text-white"
              )}
              onClick={toggleTranscription}
              title="Toggle Transcription"
            >
              <CaptionsIcon />
            </Button>

            <div className="mx-1 h-8 w-px bg-white/20" />
            
            <Button
              type="button"
              variant="ghost"
              className="h-12 w-12 rounded-full bg-red-600 p-0 text-white hover:bg-red-700"
              onClick={handleEndCall}
              title="End Call"
            >
              <PhoneOffIcon />
            </Button>
        </div>
      </div>

      {/* Audio elements for remote streams */}
      {remoteStreamsArray.map(([peerId, stream]) => (
        <audio 
          key={peerId}
          ref={(el) => {
            if (el) {
              el.srcObject = stream;
              el.play().catch(e => console.warn("Audio play failed", e));
            }
          }}
          autoPlay
          playsInline 
          className="sr-only"
        />
      ))}
    </div>
  );
}

// Icons
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 19.5l-15-15m3.75 11.25v1.5a6 6 0 0 0 10.5 3.75m1.5-1.5v-1.5m-6-9v-4.5a3 3 0 0 1 3 3v3.75M12 15.75a3 3 0 0 1-3-3V6.75" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

function VideoOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 3.75L18 6m0 0l2.25 2.25M18 6l2.25-2.25M18 6l-2.25 2.25m1.5 13.5c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 0 1 4.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.055.902-.417 1.173l-1.293.97a1.062 1.062 0 0 0-.38 1.21 12.035 12.035 0 0 0 7.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 0 1 1.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 0 1-2.25 2.25Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CaptionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6c0-1.1.9-2 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6zm3.5 5.5h3a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm7 0h3a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5z" />
    </svg>
  );
}
