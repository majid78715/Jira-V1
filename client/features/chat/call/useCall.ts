"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../../lib/apiClient";
import { CallMediaType } from "../../../lib/types";
import { useSignaling, TranscriptPayload } from "./useSignaling";
import { useWebRTC } from "./useWebRTC";
import { useAudioRelay } from "./useAudioRelay";
import { TeamChatMessage } from "../../../lib/types";

export type CallState = "IDLE" | "OUTGOING" | "RINGING" | "IN_CALL" | "ENDED";

type StartCallInput = {
  sessionId: string;
  toUserId?: string;
  video?: boolean;
};

type IncomingCall = {
  sessionId: string;
  fromUserId: string;
  media: CallMediaType;
};

type ActiveCall = {
  sessionId: string;
  media: CallMediaType;
  direction: "outgoing" | "incoming";
  isGroup: boolean;
};

type UseCallOptions = {
  userId?: string;
  sessionId?: string | null;
};

const CALL_RING_TIMEOUT_MS = 30_000;

type ExtendedWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function createAudioContextInstance(): AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const browserWindow = window as ExtendedWindow;
  const AudioContextCtor = browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
  if (!AudioContextCtor) {
    return undefined;
  }
  return new AudioContextCtor();
}

export type UseCallReturn = {
  callState: CallState;
  currentCall: ActiveCall | null;
  incomingCall: IncomingCall | null;
  callError: string | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  callTimerMs: number;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  onlineUserIds: string[];
  sessionOnlineUserIds: string[];
  serviceReady: boolean;
  isBusy: boolean;
  startCall: (input: StartCallInput) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: (reason?: string) => void;
  endCall: (reason?: string) => void;
  toggleMute: () => void;
  toggleVideo: () => Promise<void>;
  remoteAudioReady: boolean;
  remoteAudioLevel: number;
  remoteAudioError: string | null;
  resumeRemoteAudio: () => Promise<boolean>;
  sendTranscript: (sessionId: string, toUserId: string, text: string, isFinal: boolean, language?: string) => void;
  remoteTranscripts: TranscriptPayload[];
  lastMessage: TeamChatMessage | null;
};

export function useCall({ userId, sessionId }: UseCallOptions): UseCallReturn {
  const [callState, setCallState] = useState<CallState>("IDLE");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [currentCall, setCurrentCall] = useState<ActiveCall | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [callTimerMs, setCallTimerMs] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [sessionOnlineUserIds, setSessionOnlineUserIds] = useState<string[]>([]);
  const [remoteAudioReady, setRemoteAudioReady] = useState(false);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);
  const [remoteAudioError, setRemoteAudioError] = useState<string | null>(null);
  const [remoteTranscripts, setRemoteTranscripts] = useState<TranscriptPayload[]>([]);
  const [lastMessage, setLastMessage] = useState<TeamChatMessage | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const ringTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const incomingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callStateRef = useRef<CallState>("IDLE");
  const activePeersRef = useRef<Set<string>>(new Set());
  const pendingOffersRef = useRef<Map<string, string>>(new Map()); // Key: sessionId:fromUserId
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map()); // Key: sessionId:fromUserId
  const iceServersRef = useRef<RTCIceServer[] | null>(null);
  const iceRequestRef = useRef<Promise<RTCIceServer[]> | null>(null);
  const signalingRef = useRef<ReturnType<typeof useSignaling> | null>(null);
  const ringtoneRef = useRef<{
    ctx: AudioContext;
    oscillator: OscillatorNode;
    gain: GainNode;
    intervalId: number;
  } | null>(null);
  const remoteAudioCtxRef = useRef<AudioContext | null>(null);
  
  const appendDebug = useCallback((_message: string, _details?: unknown) => {
    // Debug logging disabled
  }, []);

  const startRingtone = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }
    if (ringtoneRef.current) {
      return;
    }
    const ctx = createAudioContextInstance();
    if (!ctx) {
      appendDebug("AudioContext not supported for ringtone");
      return;
    }
    await ctx.resume().catch(() => undefined);
    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 440;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    const intervalId = window.setInterval(() => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.1);
      gain.gain.linearRampToValueAtTime(0, now + 0.6);
    }, 1200);
    ringtoneRef.current = { ctx, oscillator, gain, intervalId };
    appendDebug("ringtone started");
  }, [appendDebug]);

  const stopRingtone = useCallback(() => {
    const controller = ringtoneRef.current;
    if (!controller) {
      return;
    }
    controller.oscillator.stop();
    controller.gain.disconnect();
    controller.ctx.close().catch(() => undefined);
    window.clearInterval(controller.intervalId);
    ringtoneRef.current = null;
    appendDebug("ringtone stopped");
  }, [appendDebug]);

  const {
    initPeer,
    getLocalStream,
    setLocalStream,
    createOffer,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
    toggleMute: toggleMuteTracks,
    toggleVideo: toggleVideoTracks,
    end: teardownPeer,
    localStream,
    remoteStreams,
    hasRemoteDescription
  } = useWebRTC();

  const handleNegotiationNeeded = useCallback(async (peerId: string) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;

    try {
      appendDebug("negotiation needed, creating offer", { peerId });
      const offer = await createOffer(peerId);
      signalingRef.current?.sendOffer(sessionId, peerId, offer.sdp ?? "");
    } catch (error) {
      console.error("Negotiation failed", error);
      appendDebug("negotiation failed", error);
    }
  }, [createOffer, appendDebug]);

  const ensureIceServers = useCallback(async () => {
    if (iceServersRef.current) {
      return iceServersRef.current;
    }
    if (!iceRequestRef.current) {
      iceRequestRef.current = apiRequest<{ iceServers: RTCIceServer[] }>("/calls/config").then((response) => {
        const servers = response.iceServers ?? [];
        iceServersRef.current = servers;
        return servers;
      });
    }
    return iceRequestRef.current;
  }, []);

  const cleanupRemoteAudio = useCallback(() => {
    if (remoteAudioCtxRef.current) {
      remoteAudioCtxRef.current.close().catch(() => undefined);
      remoteAudioCtxRef.current = null;
    }
    setRemoteAudioReady(false);
    setRemoteAudioLevel(0);
  }, []);

  const cleanupTimers = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (incomingTimeoutRef.current) {
      clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  }, []);

  const resetCallState = useCallback(
    (next: CallState = "IDLE", reason?: string) => {
      appendDebug("resetting call state", { from: callStateRef.current, to: next, reason });
      cleanupTimers();
      activePeersRef.current.clear();
      pendingOffersRef.current.clear();
      pendingCandidatesRef.current.clear();
      teardownPeer();
      cleanupRemoteAudio();
      setIncomingCall(null);
      setCurrentCall(null);
      setIsMuted(false);
      setIsVideoEnabled(false);
      setCallTimerMs(0);
      setCallState(next);
      setRemoteAudioError(null);
    },
    [appendDebug, cleanupRemoteAudio, cleanupTimers, teardownPeer]
  );

  const handleTranscript = useCallback((payload: TranscriptPayload) => {
    if (payload.sessionId !== sessionIdRef.current) return;
    setRemoteTranscripts(prev => {
      const newHistory = [...prev, payload];
      if (newHistory.length > 50) {
        return newHistory.slice(newHistory.length - 50);
      }
      return newHistory;
    });
  }, []);

  const ensurePlaybackAudioContext = useCallback(async (): Promise<AudioContext | undefined> => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const browserWindow = window as ExtendedWindow;
    const AudioContextCtor = browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
    if (!AudioContextCtor) {
      setRemoteAudioError("Audio output is not supported in this browser.");
      return undefined;
    }
    let ctx = remoteAudioCtxRef.current;
    if (!ctx) {
      ctx = new AudioContextCtor();
      remoteAudioCtxRef.current = ctx;
      appendDebug("created playback audio context", { sampleRate: ctx.sampleRate });
    }
    if (ctx.state === "suspended") {
      await ctx.resume().catch((error) => {
        appendDebug("audio context resume failed", error instanceof Error ? error.message : error);
      });
    }
    return ctx;
  }, [appendDebug]);

  const beginCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    const startedAt = Date.now();
    setCallTimerMs(0);
    callTimerRef.current = setInterval(() => {
      setCallTimerMs(Date.now() - startedAt);
    }, 1000);
    appendDebug("timer started");
  }, [appendDebug]);

  const handlePresenceUpdate = useCallback(
    (payload: { sessionId?: string; onlineUserIds: string[] }) => {
      if (payload.sessionId && payload.sessionId === sessionIdRef.current) {
        setSessionOnlineUserIds(payload.onlineUserIds);
        return;
      }
      if (!payload.sessionId) {
        setOnlineUserIds(payload.onlineUserIds);
      }
      appendDebug("presence update", payload);
    },
    [appendDebug]
  );

  const handleSignalError = useCallback(
    (message?: string) => {
      console.error("Call Signal Error:", message);
      appendDebug("signaling error", message);
      setCallError(message ?? "Call error.");
      resetCallState("ENDED", `signal error: ${message}`);
    },
    [appendDebug, resetCallState]
  );

  const handleRinging = useCallback(
    (payload: { sessionId: string; fromUserId: string; media: CallMediaType }) => {
      if (["OUTGOING", "RINGING", "IN_CALL"].includes(callStateRef.current)) {
        appendDebug("rejecting call (busy)", { payload, currentState: callStateRef.current });
        signalingRef.current?.endCall(payload.sessionId, "busy");
        return;
      }

      appendDebug("incoming call", payload);
      try {
        setIncomingCall(payload);
        setCurrentCall({
          sessionId: payload.sessionId,
          media: payload.media,
          direction: "incoming",
          isGroup: false // Initial assumption, updated if multiple participants
        });
        setIsVideoEnabled(payload.media === "video");
        setCallState("RINGING");
        callStateRef.current = "RINGING";
        if (incomingTimeoutRef.current) {
          clearTimeout(incomingTimeoutRef.current);
        }
        incomingTimeoutRef.current = setTimeout(() => {
          setCallError("Missed call.");
          signalingRef.current?.endCall(payload.sessionId, "missed");
          resetCallState("ENDED", "incoming timeout");
        }, CALL_RING_TIMEOUT_MS);
      } catch (error) {
        console.error("Error handling ringing", error);
        appendDebug("handleRinging error", error);
      }
    },
    [appendDebug, resetCallState]
  );

  const flushPendingCandidates = useCallback(
    async (sessionId: string, peerId: string) => {
      const key = `${sessionId}:${peerId}`;
      const queue = pendingCandidatesRef.current.get(key);
      if (!queue?.length) {
        return;
      }
      const remaining: RTCIceCandidateInit[] = [];
      for (const candidate of queue) {
        const result = await addIceCandidate(peerId, candidate);
        if (result !== "added") {
          remaining.push(candidate);
        } else {
          appendDebug("flushed ICE candidate", { sessionId, peerId });
        }
      }
      if (remaining.length) {
        pendingCandidatesRef.current.set(key, remaining);
      } else {
        pendingCandidatesRef.current.delete(key);
      }
    },
    [addIceCandidate, appendDebug]
  );

  const setupPeerConnection = useCallback(async (peerId: string, video: boolean) => {
    const servers = await ensureIceServers();
    initPeer(peerId, {
      isVideo: video,
      iceServers: servers,
      iceTransportPolicy: "all",
      onIceCandidate: (candidate) => {
        if (candidate.candidate && sessionIdRef.current) {
          signalingRef.current?.sendCandidate(sessionIdRef.current, peerId, {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex
          });
        }
      },
      onConnectionStateChange: (state) => {
        if (state === "failed") {
          // Handle peer failure
          appendDebug(`Peer ${peerId} connection failed`);
        }
      },
      onNegotiationNeeded: () => handleNegotiationNeeded(peerId),
      onPeerLog: appendDebug
    });
  }, [ensureIceServers, initPeer, handleNegotiationNeeded, appendDebug]);

  const handleOffer = useCallback(async (payload: { sessionId: string; fromUserId: string; sdp: string }) => {
    appendDebug("received offer", { sessionId: payload.sessionId, from: payload.fromUserId });
    
    if (!currentCall || currentCall.sessionId !== payload.sessionId) {
        // If we are not in a call, this might be a late offer or we need to accept it implicitly?
        // For now, store it.
        pendingOffersRef.current.set(`${payload.sessionId}:${payload.fromUserId}`, payload.sdp);
        return;
    }

    // If we are in call, we should accept the offer automatically (renegotiation or new peer)
    try {
        activePeersRef.current.add(payload.fromUserId);
        await setupPeerConnection(payload.fromUserId, isVideoEnabled);
        const answer = await createAnswer(payload.fromUserId, payload.sdp);
        await flushPendingCandidates(payload.sessionId, payload.fromUserId);
        signalingRef.current?.sendAnswer(payload.sessionId, payload.fromUserId, answer.sdp ?? "");
    } catch (error) {
        console.error("Error handling offer", error);
    }
  }, [appendDebug, currentCall, createAnswer, flushPendingCandidates, isVideoEnabled, setupPeerConnection]);

  const handleAnswer = useCallback(
    async (payload: { sessionId: string; fromUserId: string; sdp: string }) => {
      if (!currentCall || currentCall.sessionId !== payload.sessionId) {
        return;
      }
      try {
        activePeersRef.current.add(payload.fromUserId);
        await setRemoteDescription(payload.fromUserId, { type: "answer", sdp: payload.sdp });
        if (ringTimeoutRef.current) {
          clearTimeout(ringTimeoutRef.current);
          ringTimeoutRef.current = null;
        }
        if (callStateRef.current !== "IN_CALL") {
            setCallState("IN_CALL");
            callStateRef.current = "IN_CALL";
            beginCallTimer();
        }
        await flushPendingCandidates(payload.sessionId, payload.fromUserId);
      } catch (error) {
        console.error("Unable to set remote description", error);
      }
    },
    [beginCallTimer, currentCall, flushPendingCandidates, setRemoteDescription]
  );

  const handleCandidate = useCallback(
    (payload: { sessionId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => {
      void (async () => {
        if (!hasRemoteDescription(payload.fromUserId)) {
          const key = `${payload.sessionId}:${payload.fromUserId}`;
          appendDebug("queueing ICE candidate", key);
          const queue = pendingCandidatesRef.current.get(key) ?? [];
          queue.push(payload.candidate);
          pendingCandidatesRef.current.set(key, queue);
          return;
        }
        await addIceCandidate(payload.fromUserId, payload.candidate);
      })();
    },
    [addIceCandidate, appendDebug, hasRemoteDescription]
  );

  const handleJoined = useCallback(async (payload: { sessionId: string; userId: string }) => {
      if (currentCall?.sessionId !== payload.sessionId) return;
      appendDebug("User joined call", payload);
      activePeersRef.current.add(payload.userId);
      // We wait for the joining user to send an offer (Newcomer Initiates pattern)
      // to avoid glare/collision.
  }, [currentCall, appendDebug]);

  const handleParticipants = useCallback(async (payload: { sessionId: string; participants: string[] }) => {
      if (currentCall?.sessionId !== payload.sessionId) return;
      appendDebug("Received participants list", payload);
      
      for (const participantId of payload.participants) {
          activePeersRef.current.add(participantId);
          try {
              await setupPeerConnection(participantId, isVideoEnabled);
              const offer = await createOffer(participantId);
              signalingRef.current?.sendOffer(payload.sessionId, participantId, offer.sdp ?? "");
          } catch (error) {
              console.error(`Error connecting to ${participantId}`, error);
          }
      }
  }, [currentCall, createOffer, isVideoEnabled, setupPeerConnection, appendDebug]);

  const handleMessage = useCallback((payload: any) => {
    // Map payload to TeamChatMessage if needed, or just pass it through
    // Assuming payload matches TeamChatMessage structure roughly
    setLastMessage(payload as TeamChatMessage);
  }, []);

  const handleEnded = useCallback(
    (payload: { sessionId: string; reason?: string; endedByUserId?: string }) => {
      if (payload.sessionId !== sessionIdRef.current) {
        return;
      }
      
      // If specific user ended, close their peer connection
      if (payload.endedByUserId) {
          teardownPeer(payload.endedByUserId);
          activePeersRef.current.delete(payload.endedByUserId);

          if (activePeersRef.current.size === 0) {
            if (payload.reason && payload.reason !== "ended" && payload.reason !== "disconnected") {
              setCallError(
                payload.reason === "declined"
                  ? "Call declined."
                  : payload.reason === "missed"
                    ? "Call missed."
                    : "Call ended."
              );
            }
            resetCallState("ENDED", "all peers left");
          }
          return;
      }

      if (payload.reason && payload.reason !== "ended") {
        setCallError(
          payload.reason === "declined"
            ? "Call declined."
            : payload.reason === "missed"
              ? "Call missed."
              : "Call ended."
        );
      }
      resetCallState("ENDED", "remote ended");
    },
    [resetCallState, teardownPeer]
  );

  const { isRelaying, playChunk } = useAudioRelay({
    enabled: false,
    inputStream: localStream,
    onAudioData: (chunk) => {
      if (currentCall) {
        // Broadcast audio to all? Or specific?
        // Signaling server handles relay if toUserId is not provided?
        // Currently signaling requires toUserId for audio.
        // We might need to iterate peers.
        // For now, disable audio relay as WebRTC handles it.
      }
    },
    onDebug: appendDebug
  });

  const handleAudio = useCallback((payload: { sessionId: string; chunk: string }) => {
    if (currentCall?.sessionId === payload.sessionId) {
      playChunk(payload.chunk);
    }
  }, [currentCall, playChunk]);

  const resumeRemoteAudio = useCallback(async () => {
    const ctx = await ensurePlaybackAudioContext();
    if (!ctx) {
      return false;
    }
    setRemoteAudioError(null);
    return ctx.state === "running";
  }, [ensurePlaybackAudioContext]);

  const signaling = useSignaling({
    enabled: Boolean(userId),
    userId,
    onRinging: handleRinging,
    onOffer: handleOffer,
    onAnswer: handleAnswer,
    onCandidate: handleCandidate,
    onAudio: handleAudio,
    onEnded: handleEnded,
    onError: handleSignalError,
    onPresenceUpdate: handlePresenceUpdate,
    onTranscript: handleTranscript,
    onJoined: handleJoined,
    onParticipants: handleParticipants,
    onMessage: handleMessage
  });

  useEffect(() => {
    signalingRef.current = signaling;
  }, [signaling]);

  useEffect(() => {
    if (signaling.connected) {
      signaling.requestPresence();
    }
  }, [signaling]);

  const startCall = useCallback(
    async ({ sessionId: session, toUserId, video }: StartCallInput) => {
      if (!userId) {
        setCallError("You must be signed in to place a call.");
        return;
      }
      if (!signaling.connected) {
        setCallError("Connecting to signaling server. Please try again.");
        return;
      }
      if (["OUTGOING", "RINGING", "IN_CALL"].includes(callStateRef.current)) {
        setCallError("You are already in a call.");
        return;
      }

      // Set state immediately to prevent race condition (double clicks)
      setCallState("OUTGOING");
      callStateRef.current = "OUTGOING";
      setCurrentCall({
        sessionId: session,
        media: video ? "video" : "audio",
        direction: "outgoing",
        isGroup: !toUserId
      });

      try {
        sessionIdRef.current = session;
        signaling.join(session);
        appendDebug("starting call", { session, toUserId, video });
        setCallError(null);
        
        await ensurePlaybackAudioContext();
        
        const stream = await getLocalStream({ audio: true, video: Boolean(video) });
        setLocalStream(stream);
        setIsVideoEnabled(Boolean(video));
        setIsMuted(false);

        signaling.sendInvite(session, toUserId, video ? "video" : "audio");
        
        // If direct call, initiate immediately
        if (toUserId) {
            activePeersRef.current.add(toUserId);
            await setupPeerConnection(toUserId, Boolean(video));
            const offer = await createOffer(toUserId);
            signaling.sendOffer(session, toUserId, offer.sdp ?? "");
        } else {
            // Group call: wait for people to join or answer
            // We don't initiate connections yet until we know who is there.
            // Actually, we should probably join the call room to get participants?
            signaling.joinCall(session);
        }

        setCallState("RINGING");
        if (ringTimeoutRef.current) {
          clearTimeout(ringTimeoutRef.current);
        }
        ringTimeoutRef.current = setTimeout(() => {
            // Only timeout if no one joined?
            // For group calls, maybe don't timeout strictly?
            // For now, keep timeout.
          signaling.endCall(session, "missed");
          setCallError("No response.");
          resetCallState("ENDED", "ring timeout");
        }, CALL_RING_TIMEOUT_MS);
      } catch (error) {
        console.error("Unable to start call", error);
        setCallError("Unable to access your microphone/camera.");
        signaling.endCall(session, "error");
        resetCallState("ENDED", "start error");
      }
    },
    [
      ensurePlaybackAudioContext,
      getLocalStream,
      resetCallState,
      setLocalStream,
      signaling,
      userId,
      createOffer,
      appendDebug,
      setupPeerConnection
    ]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !userId) {
      return;
    }
    try {
      appendDebug("acceptCall started");
      if (incomingTimeoutRef.current) {
        clearTimeout(incomingTimeoutRef.current);
        incomingTimeoutRef.current = null;
      }

      setCallError(null);
      await ensurePlaybackAudioContext();
      
      let stream: MediaStream;
      let videoEnabled = incomingCall.media === "video";
      
      try {
        stream = await getLocalStream({
          audio: true,
          video: videoEnabled
        });
      } catch (error) {
        if (videoEnabled) {
          stream = await getLocalStream({ audio: true, video: false });
          videoEnabled = false;
        } else {
          throw error;
        }
      }

      setLocalStream(stream);
      setIsVideoEnabled(videoEnabled);
      setIsMuted(false);
      
      setCallState("IN_CALL");
      callStateRef.current = "IN_CALL";
      setCurrentCall({
        sessionId: incomingCall.sessionId,
        media: incomingCall.media,
        direction: "incoming",
        isGroup: false // Will update
      });
      beginCallTimer();
      setIncomingCall(null);

      // Join the call room to discover participants
      signaling.joinCall(incomingCall.sessionId);
      
      // Also check for pending offers (from the caller)
      const key = `${incomingCall.sessionId}:${incomingCall.fromUserId}`;
      const offerSdp = pendingOffersRef.current.get(key);
      if (offerSdp) {
          activePeersRef.current.add(incomingCall.fromUserId);
          await setupPeerConnection(incomingCall.fromUserId, videoEnabled);
          const answer = await createAnswer(incomingCall.fromUserId, offerSdp);
          await flushPendingCandidates(incomingCall.sessionId, incomingCall.fromUserId);
          signaling.sendAnswer(incomingCall.sessionId, incomingCall.fromUserId, answer.sdp ?? "");
          pendingOffersRef.current.delete(key);
      }

    } catch (error) {
      console.error("Unable to accept call", error);
      setCallError("Unable to join the call.");
      signaling.endCall(incomingCall.sessionId, "error");
      resetCallState("ENDED", "accept error");
    }
  }, [
    appendDebug,
    beginCallTimer,
    createAnswer,
    ensurePlaybackAudioContext,
    flushPendingCandidates,
    getLocalStream,
    incomingCall,
    resetCallState,
    setLocalStream,
    signaling,
    userId,
    setupPeerConnection
  ]);

  const declineCall = useCallback(
    (reason = "declined") => {
      if (!incomingCall) {
        return;
      }
      signaling.endCall(incomingCall.sessionId, reason);
      pendingOffersRef.current.clear();
      setIncomingCall(null);
      resetCallState("ENDED", "local decline");
    },
    [incomingCall, resetCallState, signaling]
  );

  const endCall = useCallback(
    (reason = "ended") => {
      const targetSession = currentCall?.sessionId ?? incomingCall?.sessionId;
      if (targetSession) {
        signaling.endCall(targetSession, reason);
      }
      resetCallState("ENDED", "local end");
    },
    [currentCall, incomingCall, resetCallState, signaling]
  );

  const toggleMute = useCallback(() => {
    const muted = toggleMuteTracks();
    setIsMuted(muted);
  }, [toggleMuteTracks]);

  const toggleVideo = useCallback(async () => {
    const enabled = await toggleVideoTracks();
    setIsVideoEnabled(enabled);
  }, [toggleVideoTracks]);

  useEffect(() => {
    const instance = signalingRef.current;
    if (!instance || !signaling.connected) {
      return;
    }
    if (!sessionId || !userId) {
      if (sessionIdRef.current) {
        instance.leave(sessionIdRef.current);
      }
      sessionIdRef.current = null;
      setSessionOnlineUserIds([]);
      return;
    }
    sessionIdRef.current = sessionId;
    instance.join(sessionId);
  }, [sessionId, signaling.connected, userId]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    const shouldRing = callState === "OUTGOING" || callState === "RINGING";
    if (shouldRing) {
      void startRingtone();
      return () => {
        stopRingtone();
      };
    }
    stopRingtone();
    return undefined;
  }, [callState, startRingtone, stopRingtone]);

  useEffect(() => {
    if (callState === "ENDED") {
      const timer = setTimeout(() => setCallState("IDLE"), 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [callState]);

  useEffect(() => {
    return () => {
      cleanupTimers();
      cleanupRemoteAudio();
      teardownPeer();
      stopRingtone();
    };
  }, [cleanupRemoteAudio, cleanupTimers, stopRingtone, teardownPeer]);

  const busy = useMemo(() => ["OUTGOING", "RINGING", "IN_CALL"].includes(callState), [callState]);

  return {
    callState,
    currentCall,
    incomingCall,
    callError,
    isMuted,
    isVideoEnabled,
    callTimerMs,
    localStream,
    remoteStreams,
    onlineUserIds,
    sessionOnlineUserIds,
    serviceReady: signaling.connected,
    isBusy: busy,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
    remoteAudioReady,
    remoteAudioLevel,
    remoteAudioError,
    resumeRemoteAudio,
    sendTranscript: signaling.sendTranscript,
    remoteTranscripts,
    lastMessage
  };
}
