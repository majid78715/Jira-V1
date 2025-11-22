"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "../../../lib/apiClient";

type CallMediaType = "audio" | "video";

type RoundingPayload = {
  sessionId: string;
  fromUserId: string;
  media: CallMediaType;
};

type OfferPayload = {
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  sdp: string;
};

type AnswerPayload = OfferPayload;

type CandidatePayload = {
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  candidate: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  };
};

type AudioPayload = {
  sessionId: string;
  fromUserId: string;
  chunk: string;
};

type EndedPayload = {
  sessionId: string;
  endedByUserId: string;
  reason?: string;
};

type PresencePayload = {
  sessionId?: string;
  onlineUserIds: string[];
};

type JoinedPayload = {
  sessionId: string;
  userId: string;
};

type ParticipantsPayload = {
  sessionId: string;
  participants: string[];
};

export type TranscriptPayload = {
  sessionId: string;
  fromUserId: string;
  text: string;
  isFinal: boolean;
  language?: string;
  timestamp: number;
};

type MessagePayload = {
  id: string;
  roomId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  mentions?: string[];
  attachments?: string[];
  messageType?: string;
  payload?: any;
};

type SignalingHandlers = {
  onRinging?: (payload: RoundingPayload) => void;
  onOffer?: (payload: OfferPayload) => void;
  onAnswer?: (payload: AnswerPayload) => void;
  onCandidate?: (payload: CandidatePayload) => void;
  onAudio?: (payload: AudioPayload) => void;
  onEnded?: (payload: EndedPayload) => void;
  onError?: (message: string) => void;
  onPresenceUpdate?: (payload: PresencePayload) => void;
  onTranscript?: (payload: TranscriptPayload) => void;
  onJoined?: (payload: JoinedPayload) => void;
  onParticipants?: (payload: ParticipantsPayload) => void;
  onMessage?: (payload: MessagePayload) => void;
};

type UseSignalingInput = {
  enabled: boolean;
  userId?: string;
} & SignalingHandlers;

const deriveSignalingUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_SIGNALING_URL;
  if (envUrl) {
    return envUrl;
  }
  if (API_BASE_URL.endsWith("/api")) {
    return `${API_BASE_URL.replace(/\/api$/, "")}/ws`;
  }
  return `${API_BASE_URL.replace(/\/api(?:\/.*)?$/, "")}/ws`;
};

export function useSignaling({
  enabled,
  userId,
  onRinging,
  onOffer,
  onAnswer,
  onCandidate,
  onAudio,
  onEnded,
  onError,
  onPresenceUpdate,
  onTranscript,
  onJoined,
  onParticipants,
  onMessage
}: UseSignalingInput) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const handlersRef = useRef<SignalingHandlers>({});
  handlersRef.current = { onRinging, onOffer, onAnswer, onCandidate, onAudio, onEnded, onError, onPresenceUpdate, onTranscript, onJoined, onParticipants, onMessage };

  const signalingUrl = useMemo(() => deriveSignalingUrl(), []);

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }
    const socket = io(signalingUrl, {
      withCredentials: true,
      transports: ["websocket"]
    });
    socketRef.current = socket;

    const handleConnect = () => {
      setConnected(true);
      if (activeSessionRef.current) {
        socket.emit("join", { sessionId: activeSessionRef.current, userId });
      }
    };
    const handleDisconnect = () => {
      setConnected(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("call:ringing", (payload: RoundingPayload) => {
      handlersRef.current.onRinging?.(payload);
    });
    socket.on("call:offer", (payload: OfferPayload) => {
      handlersRef.current.onOffer?.(payload);
    });
    socket.on("call:answer", (payload: AnswerPayload) => {
      handlersRef.current.onAnswer?.(payload);
    });
    socket.on("call:candidate", (payload: CandidatePayload) => {
      handlersRef.current.onCandidate?.(payload);
    });
    socket.on("call:audio", (payload: AudioPayload) => handlersRef.current.onAudio?.(payload));
    socket.on("call:ended", (payload: EndedPayload) => {
      handlersRef.current.onEnded?.(payload);
    });
    socket.on("call:error", ({ message }: { message?: string }) => {
      handlersRef.current.onError?.(message ?? "Call error");
    });
    socket.on("presence:update", (payload: PresencePayload) => {
      handlersRef.current.onPresenceUpdate?.(payload);
    });
    socket.on("call:transcript", (payload: TranscriptPayload) => {
      handlersRef.current.onTranscript?.(payload);
    });
    socket.on("call:joined", (payload: JoinedPayload) => {
      handlersRef.current.onJoined?.(payload);
    });
    socket.on("call:participants", (payload: ParticipantsPayload) => {
      handlersRef.current.onParticipants?.(payload);
    });
    socket.on("message", (payload: MessagePayload) => {
      handlersRef.current.onMessage?.(payload);
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("call:ringing");
      socket.off("call:offer");
      socket.off("call:answer");
      socket.off("call:candidate");
      socket.off("call:audio");
      socket.off("call:ended");
      socket.off("call:error");
      socket.off("presence:update");
      socket.off("call:transcript");
      socket.off("call:joined");
      socket.off("call:participants");
      socket.off("message");
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [enabled, signalingUrl, userId]);

  const join = useCallback(
    (sessionId: string) => {
      const socket = socketRef.current;
      if (!socket || !userId || !sessionId) {
        return;
      }
      if (activeSessionRef.current && activeSessionRef.current !== sessionId) {
        socket.emit("leave", { sessionId: activeSessionRef.current, userId });
      }
      activeSessionRef.current = sessionId;
      socket.emit("join", { sessionId, userId });
    },
    [userId]
  );

  const leave = useCallback(
    (sessionId?: string | null) => {
      const socket = socketRef.current;
      if (!socket || !userId) {
        return;
      }
      const target = sessionId ?? activeSessionRef.current;
      if (!target) {
        return;
      }
      socket.emit("leave", { sessionId: target, userId });
      if (!sessionId || sessionId === activeSessionRef.current) {
        activeSessionRef.current = null;
      }
    },
    [userId]
  );

  const emitIfReady = useCallback((event: string, payload: Record<string, unknown>) => {
    if (!socketRef.current || !userId) {
      return;
    }
    socketRef.current.emit(event, { ...payload, fromUserId: userId });
  }, [userId]);

  const joinCall = useCallback(
    (sessionId: string) => {
      emitIfReady("call:join", { sessionId });
    },
    [emitIfReady]
  );

  const sendInvite = useCallback(
    (sessionId: string, toUserId: string | undefined, media: CallMediaType) => {
      emitIfReady("call:invite", { sessionId, toUserId, media });
    },
    [emitIfReady]
  );

  const sendOffer = useCallback(
    (sessionId: string, toUserId: string, sdp: string) => {
      emitIfReady("call:offer", { sessionId, toUserId, sdp });
    },
    [emitIfReady]
  );

  const sendAnswer = useCallback(
    (sessionId: string, toUserId: string, sdp: string) => {
      emitIfReady("call:answer", { sessionId, toUserId, sdp });
    },
    [emitIfReady]
  );

  const sendCandidate = useCallback(
    (sessionId: string, toUserId: string, candidate: CandidatePayload["candidate"]) => {
      emitIfReady("call:candidate", { sessionId, toUserId, candidate });
    },
    [emitIfReady]
  );

  const sendAudio = useCallback(
    (sessionId: string, toUserId: string, chunk: string) => {
      emitIfReady("call:audio", { sessionId, toUserId, chunk });
    },
    [emitIfReady]
  );

  const sendTranscript = useCallback(
    (sessionId: string, toUserId: string, text: string, isFinal: boolean, language?: string) => {
      emitIfReady("call:transcript", { sessionId, toUserId, text, isFinal, language, timestamp: Date.now() });
    },
    [emitIfReady]
  );

  const requestPresence = useCallback(() => {
    if (!socketRef.current || !userId) {
      return;
    }
    socketRef.current.emit("presence:request");
  }, [userId]);

  const endCall = useCallback(
    (sessionId: string, reason?: string) => {
      if (!socketRef.current || !userId) {
        return;
      }
      socketRef.current.emit("call:end", { sessionId, fromUserId: userId, reason });
    },
    [userId]
  );

  return {
    connected,
    join,
    leave,
    joinCall,
    sendInvite,
    sendOffer,
    sendAnswer,
    sendCandidate,
    sendAudio,
    sendTranscript,
    requestPresence,
    endCall
  };
}
