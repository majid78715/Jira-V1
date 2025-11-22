"use client";

import clsx from "clsx";
import { MouseEvent } from "react";
import { Avatar } from "../ui/Avatar";
import { UserDirectoryEntry } from "../../lib/types";
import { ChatDensity } from "./types";

interface PersonaListItemProps {
  persona: UserDirectoryEntry;
  density: ChatDensity;
  active?: boolean;
  loading?: boolean;
  callDisabled?: boolean;
  callDisabledReason?: string;
  onSelect?: (persona: UserDirectoryEntry) => void;
  onVoiceCallClick?: (persona: UserDirectoryEntry) => void;
  onVideoCallClick?: (persona: UserDirectoryEntry) => void;
  isOnline?: boolean;
}

export function PersonaListItem({
  persona,
  density,
  active,
  loading,
  callDisabled,
  callDisabledReason,
  onSelect,
  onVoiceCallClick,
  onVideoCallClick,
  isOnline
}: PersonaListItemProps) {
  const avatarSize = density === "compact" ? 30 : 32;
  const disableCallButton = callDisabled || loading;

  const handleSelect = () => {
    if (loading) {
      return;
    }
    onSelect?.(persona);
  };

  const handleVoiceCall = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disableCallButton) {
      return;
    }
    onVoiceCallClick?.(persona);
  };

  const handleVideoCall = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disableCallButton) {
      return;
    }
    onVideoCallClick?.(persona);
  };

  return (
    <div
      className={clsx(
        "flex items-center rounded-lg border transition focus-within:ring-1 focus-within:ring-brand-400",
        active ? "border-brand-200 bg-brand-50/60" : "border-transparent bg-white/70 hover:border-ink-100",
        loading && "opacity-60"
      )}
      style={{
        paddingInline: "var(--chat-space-item-x)",
        paddingBlock: "var(--chat-space-item-y)"
      }}
    >
      <button
        type="button"
        onClick={handleSelect}
        disabled={loading}
        aria-current={active ? "true" : undefined}
        className="flex flex-1 items-center gap-[var(--chat-gap)] text-left focus-visible:outline-none"
      >
        <Avatar name={persona.name} status={isOnline ? "online" : "offline"} size={avatarSize} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-900">{persona.name}</p>
          <p className="text-xs text-ink-500 line-clamp-1">
            {persona.title ?? persona.role.replace(/_/g, " ")}
          </p>
          {loading ? <p className="text-[11px] uppercase tracking-wide text-ink-400">Connecting…</p> : null}
        </div>
      </button>
      <div className="ml-3 flex gap-2">
        <button
          type="button"
          onClick={handleVoiceCall}
          disabled={disableCallButton}
          className={clsx(
            "inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-700 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400",
            disableCallButton ? "cursor-not-allowed bg-ink-50 text-ink-300" : "bg-brand-50 hover:bg-brand-100"
          )}
          aria-label={`Start audio call with ${persona.name}`}
          title={callDisabledReason}
        >
          <PhoneIcon />
        </button>
        <button
          type="button"
          onClick={handleVideoCall}
          disabled={disableCallButton}
          className={clsx(
            "inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-700 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-400",
            disableCallButton ? "cursor-not-allowed bg-ink-50 text-ink-300" : "bg-brand-50 hover:bg-brand-100"
          )}
          aria-label={`Start video call with ${persona.name}`}
          title={callDisabledReason}
        >
          <VideoIcon />
        </button>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M6.5 4h3l1 4-2 1.5c.9 1.8 2.4 3.3 4.2 4.2L14 11l4 1v3a2 2 0 0 1-2 2c-7.18 0-13-5.82-13-13a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M15 9.5V7a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 7.5v9A2.5 2.5 0 0 0 5.5 19H13a2 2 0 0 0 2-2v-2.5l4 3v-9l-4 3Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
