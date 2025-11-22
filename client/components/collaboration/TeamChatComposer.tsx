"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { Button } from "../ui/Button";
import clsx from "clsx";

interface TeamChatComposerProps {
  onSend: (message: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
}

export function TeamChatComposer({
  onSend,
  disabled,
  placeholder = "Share an update or ask the room...",
  compact
}: TeamChatComposerProps) {
  const [value, setValue] = useState("");

  const submitMessage = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    await onSend(trimmed);
    setValue("");
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitMessage();
  }

  async function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await submitMessage();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={compact ? 1 : 3}
        placeholder={placeholder}
        className={clsx(
          "w-full rounded-xl border border-ink-200 px-3 py-2 text-sm shadow-sm focus:border-accent-turquoise focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all",
          compact && "resize-none"
        )}
      />
      <div className="flex items-center justify-between text-xs text-ink-400">
        {!compact && <p>Shift + Enter for a new line</p>}
        <Button type="submit" disabled={disabled || !value.trim()} size={compact ? "sm" : "md"}>
          {disabled ? "Sending..." : "Send"}
        </Button>
      </div>
    </form>
  );
}
