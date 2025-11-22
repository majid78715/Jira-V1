"use client";

import { MouseEvent } from "react";
import clsx from "clsx";
import { Avatar } from "../ui/Avatar";
import { ChatDensity } from "./types";

interface ConversationListItemProps {
  id: string;
  name: string;
  subtitle?: string;
  timestamp?: string;
  unreadCount?: number;
  active?: boolean;
  density: ChatDensity;
  avatarName: string;
  avatarStatus?: "online" | "offline";
  onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function ConversationListItem({
  id,
  name,
  subtitle,
  timestamp,
  unreadCount,
  active,
  density,
  avatarName,
  avatarStatus = "online",
  onSelect
}: ConversationListItemProps) {
  const avatarSize = density === "compact" ? 36 : 40;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={clsx(
        "group w-full rounded-md px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset",
        active ? "bg-brand-50" : "hover:bg-ink-50"
      )}
      data-conversation-id={id}
    >
      <div className="flex items-center gap-3">
        <Avatar name={avatarName} status={avatarStatus} size={avatarSize} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between">
            <p className={clsx(
              "truncate text-sm font-medium",
              active ? "text-brand-900" : "text-ink-900"
            )}>
              {name}
            </p>
            {timestamp ? (
              <span className="text-[11px] text-ink-400">{timestamp}</span>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <p className={clsx(
              "truncate text-xs",
              active ? "text-brand-600" : "text-ink-500"
            )}>
              {subtitle}
            </p>
            {unreadCount && unreadCount > 0 ? (
              <span className="ml-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
