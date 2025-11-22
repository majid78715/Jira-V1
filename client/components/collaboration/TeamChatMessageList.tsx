"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { TeamChatMessage, Role, CallEventMessage } from "../../lib/types";
import { Avatar } from "../ui/Avatar";

type ParticipantInfo = {
  id: string;
  name: string;
  role: Role;
};

type TimelineEntry =
  | { type: "message"; createdAt: string; id: string; message: TeamChatMessage }
  | { type: "call"; createdAt: string; id: string; event: CallEventMessage };

interface TeamChatMessageListProps {
  entries: TimelineEntry[];
  resolveParticipant: (userId: string) => ParticipantInfo | undefined;
  currentUserId?: string;
  compact?: boolean;
}

export function TeamChatMessageList({ entries, resolveParticipant, currentUserId, compact }: TeamChatMessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  if (!entries.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-ink-400">
        <p className="text-sm font-medium">No messages yet</p>
        <p className="text-xs">Kick off the conversation with an update or quick question.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.map((entry) => {
        if (entry.type === "message") {
          const { message } = entry;
          const author = resolveParticipant(message.authorId);
          const isCurrentUser = currentUserId === message.authorId;
          return (
            <div
              key={message.id}
              className={clsx("flex items-start gap-3", isCurrentUser && "flex-row-reverse text-right")}
            >
              {!compact && <Avatar name={author?.name ?? "Unknown"} status="online" />}
              <div className={clsx("max-w-2xl space-y-1", isCurrentUser && "items-end text-right")}>
                {!compact && (
                  <div className="text-xs uppercase tracking-wide text-ink-400">
                    <span className="font-semibold text-ink-600">{author?.name ?? "Unknown"}</span>
                  </div>
                )}
                <div
                  className={clsx(
                    "rounded-2xl px-4 py-3 text-sm shadow-sm bg-white text-ink-900",
                    compact && "py-2 px-3 text-xs"
                  )}
                >
                  {message.body}
                </div>
                {!compact && (
                  <div className="px-1 text-[11px] text-ink-400">
                    {formatTimestamp(message.createdAt)}
                  </div>
                )}
                {message.mentions?.length ? (
                  <div className="flex flex-wrap gap-2 text-xs text-ink-500">
                    {message.mentions.map((mentionId) => {
                      const mention = resolveParticipant(mentionId);
                      return (
                        <span
                          key={`${message.id}-${mentionId}`}
                          className="rounded-full bg-ink-50 px-2 py-0.5 text-ink-600"
                        >
                          @{mention?.name ?? mentionId}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          );
        }
        return (
          <div key={entry.id} className="flex justify-center">
            <div className="rounded-full bg-ink-50 px-3 py-1 text-xs text-ink-500 shadow">
              {formatCallEvent(entry.event, currentUserId, resolveParticipant)}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function formatCallEvent(
  event: CallEventMessage,
  currentUserId: string | undefined,
  resolveParticipant: (userId: string) => ParticipantInfo | undefined
) {
  const actorLabel = event.userId === currentUserId ? "You" : resolveParticipant(event.userId)?.name ?? "Teammate";
  const payload = event.payload;
  if (!payload) {
    return "Call event";
  }
  const targetLabel =
    payload.toUserId === currentUserId ? "you" : resolveParticipant(payload.toUserId)?.name ?? "teammate";
  switch (payload.event) {
    case "call_started":
      return `${actorLabel} started a ${payload.media ?? "audio"} call with ${targetLabel}`;
    case "call_declined":
      return `${actorLabel} declined the call`;
    case "missed_call":
      return `${actorLabel} missed the call${payload.reason ? ` (${payload.reason})` : ""}`;
    default:
      return `Call ended${payload.reason ? ` (${payload.reason})` : ""}`;
  }
}

function formatTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
