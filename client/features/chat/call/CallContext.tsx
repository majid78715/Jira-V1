"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { useCall, UseCallReturn } from "./useCall";

interface CallContextType extends UseCallReturn {
  setScopeSessionId: (id: string | null) => void;
  scopeSessionId: string | null;
}

const CallContext = createContext<CallContextType | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser();
  const [scopeSessionId, setScopeSessionId] = useState<string | null>(null);
  const [lockedSessionId, setLockedSessionId] = useState<string | null>(null);

  // If we are in a call, we must stay connected to that session (lockedSessionId).
  // Otherwise, we connect to the requested scope session (scopeSessionId).
  const effectiveSessionId = lockedSessionId ?? scopeSessionId;

  const callReturn = useCall({ userId: user?.id, sessionId: effectiveSessionId });
  const { callState, currentCall } = callReturn;

  // Lock the session when a call starts
  useEffect(() => {
    const isCallActive = ["OUTGOING", "RINGING", "IN_CALL"].includes(callState);
    
    if (isCallActive && currentCall?.sessionId) {
      setLockedSessionId(currentCall.sessionId);
    } else if (callState === "IDLE" || callState === "ENDED") {
      // Delay unlocking slightly to ensure cleanup? No, immediate is probably fine.
      // Actually, if we unlock immediately on ENDED, useCall might reconnect to scopeSessionId
      // which is what we want.
      setLockedSessionId(null);
    }
  }, [callState, currentCall?.sessionId]);

  const value: CallContextType = {
    ...callReturn,
    setScopeSessionId,
    scopeSessionId
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCallContext() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCallContext must be used within a CallProvider");
  }
  return context;
}
