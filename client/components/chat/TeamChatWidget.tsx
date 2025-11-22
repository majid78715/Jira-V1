"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useTeamChatState } from "../../hooks/useTeamChatState";
import { useOnClickOutside } from "../../hooks/useOnClickOutside";
import { TeamChatMessageList } from "../collaboration/TeamChatMessageList";
import { TeamChatComposer } from "../collaboration/TeamChatComposer";
import { Button } from "../ui/Button";
import { UserDirectoryEntry } from "../../lib/types";

interface TeamChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onExpand: () => void;
}

export function TeamChatWidget({ isOpen, onClose, onExpand }: TeamChatWidgetProps) {
  const router = useRouter();
  const {
    user,
    rooms,
    roomsLoading,
    activeRoomId,
    setActiveRoomId,
    messagesLoading,
    bannerError,
    sending,
    personas,
    personasLoading,
    activeRoom,
    activeDirectPersona,
    activePeerOnline,
    resolveParticipant,
    handlePersonaClick,
    initiateCall,
    handleSend,
    timelineEntries,
    callServiceReady,
    callServiceError,
    deleteRoomById,
    onlineUserIds
  } = useTeamChatState();

  const [view, setView] = useState<"list" | "chat">("list");
  const scrollRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(widgetRef, () => {
    if (isOpen) onClose();
  });

  // Sync view with activeRoomId
  useEffect(() => {
    if (activeRoomId) {
      setView("chat");
    } else {
      setView("list");
    }
  }, [activeRoomId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timelineEntries]);

  // Helper to get display name for a room
  const getRoomDisplayName = (room: typeof rooms[0]) => {
    if (room.type === "DIRECT" || room.participantIds?.length === 2) {
      // Try to find the other participant
      const otherId = room.participantIds?.find((id) => id !== user?.id);
      if (otherId) {
        const otherPersona = personas.find((p) => p.id === otherId);
        if (otherPersona) {
          return otherPersona.name;
        }
        // Fallback if persona not found but we have a name like "A <-> B"
        if (room.name.includes(" ↔ ")) {
           const parts = room.name.split(" ↔ ");
           // If user name is in parts, return the other part
           // This is a heuristic, ideally we rely on IDs
           // But we don't have user name easily accessible here except via user object
           if (user && user.profile) {
             const myName = `${user.profile.firstName} ${user.profile.lastName}`.trim();
             const otherPart = parts.find(p => p !== myName);
             if (otherPart) return otherPart;
           }
        }
      }
    }
    return room.name;
  };

  if (!isOpen) return null;

  // Filter rooms to only show those with messages
  const visibleRooms = rooms.filter((room) => !!room.lastMessageAt);

  return (
    <div 
      ref={widgetRef}
      className="fixed bottom-2 left-2 z-50 flex h-[380px] w-[280px] flex-col overflow-hidden rounded-t-xl rounded-br-xl border border-ink-200 bg-white shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-white border-b border-ink-100 px-3 py-2 text-ink-900">
        <div className="flex items-center gap-2">
          {view === "chat" && (
            <button
              onClick={() => setActiveRoomId(null)}
              className="mr-1 rounded-full p-1 hover:bg-ink-50 text-ink-500"
            >
              <ArrowLeftIcon />
            </button>
          )}
          <h3 className="font-semibold text-sm truncate max-w-[160px]">
            {view === "chat"
              ? (activeRoom ? getRoomDisplayName(activeRoom) : (activeDirectPersona?.name ?? "Chat"))
              : "Team Chat"}
          </h3>
          {view === "chat" && activeDirectPersona && (
            <span className={clsx("h-2 w-2 rounded-full", activePeerOnline ? "bg-green-400" : "bg-gray-400")} />
          )}
        </div>
        <div className="flex items-center gap-1 text-ink-400">
          {view === "chat" && activeDirectPersona && (
            <>
              <button
                onClick={() => void initiateCall(activeDirectPersona, false)}
                className="rounded-full p-1 hover:bg-ink-50 hover:text-ink-600"
                title="Voice Call"
              >
                <PhoneIcon />
              </button>
              <button
                onClick={() => void initiateCall(activeDirectPersona, true)}
                className="rounded-full p-1 hover:bg-ink-50 hover:text-ink-600"
                title="Video Call"
              >
                <VideoIcon />
              </button>
              <div className="mx-1 h-4 w-px bg-ink-200" />
            </>
          )}
          <button
            onClick={onExpand}
            className="rounded-full p-1 hover:bg-ink-50 hover:text-ink-600"
            title="Open full window"
          >
            <ExpandIcon />
          </button>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-ink-50 hover:text-ink-600"
            title="Minimize"
          >
            <XIcon />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-white">
        {view === "list" ? (
          <div className="h-full overflow-y-auto p-2">
            {roomsLoading || personasLoading ? (
              <div className="flex h-full items-center justify-center text-ink-400 text-xs">
                Loading...
              </div>
            ) : (
              <div className="space-y-4">
                {/* Recent Rooms */}
                {visibleRooms.length > 0 && (
                  <div>
                    <h4 className="mb-2 px-2 text-[10px] font-semibold uppercase text-ink-400">Recent</h4>
                    <div className="space-y-1">
                      {visibleRooms.map((room) => {
                        const displayName = getRoomDisplayName(room);
                        return (
                          <div key={room.id} className="group relative flex items-center">
                            <button
                              onClick={() => setActiveRoomId(room.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-50"
                            >
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 text-[10px] font-bold">
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <div className="truncate text-xs font-medium text-ink-900">{displayName}</div>
                                <div className="truncate text-[10px] text-ink-500">{room.topic}</div>
                              </div>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteRoomById(room.id);
                              }}
                              className="absolute right-1 hidden rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600 group-hover:block"
                              title="Delete conversation"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Direct Messages */}
                <div>
                  <h4 className="mb-2 px-2 text-xs font-semibold uppercase text-ink-400">Direct Messages</h4>
                  <div className="space-y-1">
                    {personas
                      .filter((p) => p.id !== user?.id)
                      .map((persona) => {
                        const isOnline = onlineUserIds.includes(persona.id);
                        return (
                          <button
                            key={persona.id}
                            onClick={() => void handlePersonaClick(persona)}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-ink-50"
                          >
                          <div className="relative">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-ink-600 text-xs font-bold">
                              {persona.name.charAt(0).toUpperCase()}
                            </div>
                            {isOnline && (
                              <span className="absolute bottom-0 right-0 z-10 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500" title="Online" />
                            )}
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <div className="truncate text-sm font-medium text-ink-900">{persona.name}</div>
                            <div className="truncate text-xs text-ink-500">{persona.role}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
              {messagesLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
                </div>
              ) : (
                <TeamChatMessageList
                  entries={timelineEntries}
                  resolveParticipant={resolveParticipant}
                  currentUserId={user?.id ?? ""}
                  compact
                />
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-ink-100 bg-white p-3">
              {bannerError && (
                <div className="mb-2 text-xs text-red-600">{bannerError}</div>
              )}
              <TeamChatComposer
                onSend={handleSend}
                disabled={sending || !activeRoomId}
                placeholder="Type a message..."
                compact
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
