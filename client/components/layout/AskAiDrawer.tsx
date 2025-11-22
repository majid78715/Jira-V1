"use client";

import { useCallback } from "react";
import { ChatComposer } from "../collaboration/ChatComposer";
import { ChatTranscript } from "../collaboration/ChatTranscript";
import { useAiChat } from "../../hooks/useAiChat";
import { Button } from "../ui/Button";

interface AskAiDrawerProps {
  open: boolean;
  onClose: () => void;
  currentUserId?: string;
}

export function AskAiDrawer({ open, onClose, currentUserId }: AskAiDrawerProps) {
  const { messages, sending, error, contextChips, toggleChip, sendMessage, chipOptions, reset } =
    useAiChat();

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/30" onClick={handleClose}>
      <div
        className="ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <div>
            <p className="text-xs uppercase font-semibold bg-gradient-to-r from-accent-lime via-accent-turquoise to-accent-teal bg-clip-text text-transparent">Workspace copilot</p>
            <h2 className="text-lg font-semibold text-ink-900">AI Chat</h2>
          </div>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ChatTranscript messages={messages} currentUserId={currentUserId} />
        </div>
        <div className="border-t border-ink-100 bg-ink-25 px-6 py-4">
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
    </div>
  );
}
