"use client";

import { useCallback, useMemo, useState } from "react";
import { ApiError } from "../lib/apiClient";
import { sendChatMessage, CHAT_CONTEXT_CHIPS } from "../lib/aiChat";
import { ChatMessage, ChatSession } from "../lib/types";

const DEFAULT_CHIP_SELECTION = CHAT_CONTEXT_CHIPS.map((chip) => chip.id);

export function useAiChat() {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextChips, setContextChips] = useState<string[]>(DEFAULT_CHIP_SELECTION);

  const toggleChip = useCallback((chipId: string) => {
    setContextChips((prev) => {
      return prev.includes(chipId) ? prev.filter((id) => id !== chipId) : [...prev, chipId];
    });
  }, []);

  const sendMessage = useCallback(
    async (body: string) => {
      if (!body.trim()) {
        return;
      }
      setSending(true);
      setError(null);
      try {
        const response = await sendChatMessage({
          message: body,
          sessionId: session?.id,
          contextChips
        });
        setSession(response.session);
        setMessages(response.messages);
        if (!response.session.contextChips.length) {
          setContextChips(DEFAULT_CHIP_SELECTION);
        }
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError?.message ?? "Unable to reach the assistant.");
      } finally {
        setSending(false);
      }
    },
    [contextChips, session?.id]
  );

  const reset = useCallback(() => {
    setSession(null);
    setMessages([]);
    setContextChips(DEFAULT_CHIP_SELECTION);
    setError(null);
  }, []);

  return {
    session,
    messages,
    sending,
    error,
    contextChips,
    toggleChip,
    sendMessage,
    reset,
    chipOptions: CHAT_CONTEXT_CHIPS
  };
}
