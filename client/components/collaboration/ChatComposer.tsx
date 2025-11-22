"use client";

import { FormEvent, KeyboardEvent, useState } from "react";
import { Button } from "../ui/Button";
import { ContextChipSelector } from "./ContextChipSelector";

interface ChatComposerProps {
  onSend: (message: string) => Promise<void> | void;
  disabled?: boolean;
  chipOptions: ReadonlyArray<{ id: string; label: string }>;
  activeChips: string[];
  onToggleChip: (chipId: string) => void;
  placeholder?: string;
}

export function ChatComposer({
  onSend,
  disabled,
  chipOptions,
  activeChips,
  onToggleChip,
  placeholder = "Ask about tasks, vendors, risks..."
}: ChatComposerProps) {
  const [value, setValue] = useState("");

  async function submit() {
    if (!value.trim() || disabled) {
      return;
    }
    await onSend(value.trim());
    setValue("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold uppercase text-ink-400">Context</p>
        <ContextChipSelector options={chipOptions} active={activeChips} onToggle={onToggleChip} />
      </div>
      <div className="flex flex-col gap-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder={placeholder}
          className="w-full rounded-xl border border-ink-200 px-3 py-2 text-sm shadow-sm focus:border-accent-turquoise focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-400">AI drafts only — no automatic approvals.</p>
          <Button type="submit" disabled={disabled}>
            {disabled ? "Thinking..." : "Send"}
          </Button>
        </div>
      </div>
    </form>
  );
}
