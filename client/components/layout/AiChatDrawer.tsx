"use client";

import { useCallback, useRef } from "react";
import { ChatComposer } from "../collaboration/ChatComposer";
import { ChatTranscript } from "../collaboration/ChatTranscript";
import { useAiChat } from "../../hooks/useAiChat";
import { useOnClickOutside } from "../../hooks/useOnClickOutside";
import { Button } from "../ui/Button";

interface AiChatDrawerProps {
  open: boolean;
  onClose: () => void;
  currentUserId?: string;
}

export function AiChatDrawer({ open, onClose, currentUserId }: AiChatDrawerProps) {
  const { messages, sending, error, contextChips, toggleChip, sendMessage, chipOptions, reset } =
    useAiChat();

  const drawerRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useOnClickOutside(drawerRef, () => {
    if (open) handleClose();
  });

  if (!open) {
    return null;
  }

  return (
    <div 
      ref={drawerRef}
      className="fixed bottom-6 right-6 z-50 flex h-[600px] w-[450px] flex-col rounded-2xl bg-white shadow-2xl border border-ink-100 overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200"
    >
      <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3 bg-ink-50">
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider bg-gradient-to-r from-accent-lime via-accent-turquoise to-accent-teal bg-clip-text text-transparent">
            Workspace Copilot
          </p>
          <h2 className="text-base font-bold text-ink-900">AI Chat</h2>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
          Close
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <ChatTranscript messages={messages} currentUserId={currentUserId} />
      </div>
      <div className="border-t border-ink-100 bg-white px-4 py-3">
        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
        <ChatComposer
          onSend={sendMessage}
          disabled={sending}
          chipOptions={chipOptions}
          activeChips={contextChips}
          onToggleChip={toggleChip}
          placeholder="Ex: Summarize vendor health this week"
        />
      </div>
    </div>
  );
}
