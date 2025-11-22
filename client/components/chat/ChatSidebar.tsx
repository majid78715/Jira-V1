"use client";

import { ChangeEventHandler, FormEventHandler, useState, useMemo } from "react";
import clsx from "clsx";
import { TeamChatRoom, UserDirectoryEntry } from "../../lib/types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ConversationListItem } from "./ConversationListItem";
import { PersonaListItem } from "./PersonaListItem";
import { ChatDensity } from "./types";

interface ChatSidebarProps {
  density: ChatDensity;
  onDensityChange: (density: ChatDensity) => void;
  rooms: TeamChatRoom[];
  roomsLoading: boolean;
  activeRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  resolveParticipant: (userId: string) => { id: string; name: string; role?: string; title?: string } | undefined;
  showNewRoomForm: boolean;
  onToggleNewRoomForm: () => void;
  newRoomName: string;
  newRoomTopic: string;
  onNewRoomNameChange: ChangeEventHandler<HTMLInputElement>;
  onNewRoomTopicChange: ChangeEventHandler<HTMLInputElement>;
  onCreateRoom: FormEventHandler<HTMLFormElement>;
  creatingRoom: boolean;
  onRefreshRooms: () => void;
  personas: UserDirectoryEntry[];
  personasLoading: boolean;
  personasError: string | null;
  activePersonaId: string | null;
  personaRoomLoadingId: string | null;
  onPersonaClick: (persona: UserDirectoryEntry) => void;
  onVoiceCallPersona: (persona: UserDirectoryEntry) => void;
  onVideoCallPersona: (persona: UserDirectoryEntry) => void;
  callBusy: boolean;
  callServiceReady: boolean;
  onlineUserIds: string[];
  currentUserId: string;
  storageSummary: {
    percentUsed: number;
    usedLabel: string;
    remainingLabel: string;
    caption: string;
  };
}

export function ChatSidebar({
  density,
  rooms,
  roomsLoading,
  activeRoomId,
  onSelectRoom,
  resolveParticipant,
  showNewRoomForm,
  onToggleNewRoomForm,
  newRoomName,
  newRoomTopic,
  onNewRoomNameChange,
  onNewRoomTopicChange,
  onCreateRoom,
  creatingRoom,
  onRefreshRooms,
  personas,
  personasLoading,
  personasError,
  activePersonaId,
  personaRoomLoadingId,
  onPersonaClick,
  onVoiceCallPersona,
  onVideoCallPersona,
  callBusy,
  callServiceReady,
  onlineUserIds,
  currentUserId
}: ChatSidebarProps) {
  const [activeTab, setActiveTab] = useState<"chats" | "people">("chats");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRooms = useMemo(() => {
    if (!searchQuery) return rooms;
    const lower = searchQuery.toLowerCase();
    return rooms.filter(room => room.name.toLowerCase().includes(lower));
  }, [rooms, searchQuery]);

  const filteredPersonas = useMemo(() => {
    if (!searchQuery) return personas;
    const lower = searchQuery.toLowerCase();
    return personas.filter(p => p.name.toLowerCase().includes(lower) || p.email?.toLowerCase().includes(lower));
  }, [personas, searchQuery]);

  return (
    <aside
      className="flex h-full w-full flex-col border-r border-ink-100 bg-white sm:w-80 md:w-96"
      aria-label="Chat sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <h2 className="text-lg font-semibold text-ink-900">Messages</h2>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 p-0 text-ink-500 hover:text-brand-600"
            onClick={onToggleNewRoomForm}
            title="New Chat"
          >
            <PlusIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 p-0 text-ink-500 hover:text-brand-600"
            onClick={onRefreshRooms}
            title="Refresh"
          >
            <RefreshIcon />
          </Button>
        </div>
      </div>

      {/* Search & Tabs */}
      <div className="px-4 py-3">
        <div className="relative mb-3">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-ink-50 py-2 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="flex rounded-lg bg-ink-50 p-1">
          <button
            onClick={() => setActiveTab("chats")}
            className={clsx(
              "flex-1 rounded-md py-1.5 text-sm font-medium transition-all",
              activeTab === "chats"
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500 hover:text-ink-700"
            )}
          >
            Chats
          </button>
          <button
            onClick={() => setActiveTab("people")}
            className={clsx(
              "flex-1 rounded-md py-1.5 text-sm font-medium transition-all",
              activeTab === "people"
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-500 hover:text-ink-700"
            )}
          >
            People
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-2">
        {showNewRoomForm ? (
          <div className="mb-4 px-2">
            <form
              onSubmit={onCreateRoom}
              className="space-y-3 rounded-xl border border-brand-100 bg-brand-50/30 p-3"
            >
              <Input
                value={newRoomName}
                onChange={onNewRoomNameChange}
                placeholder="Group Name"
                required
                className="bg-white text-sm"
              />
              <Input
                value={newRoomTopic}
                onChange={onNewRoomTopicChange}
                placeholder="Topic (Optional)"
                className="bg-white text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={onToggleNewRoomForm}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="h-8 text-xs" 
                  disabled={creatingRoom}
                >
                  Create
                </Button>
              </div>
            </form>
          </div>
        ) : null}

        {activeTab === "chats" ? (
          <div className="space-y-1 pb-4">
            {roomsLoading ? (
              <div className="flex justify-center py-8 text-sm text-ink-400">Loading chats...</div>
            ) : filteredRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 rounded-full bg-ink-50 p-3 text-ink-400">
                  <ChatIcon />
                </div>
                <p className="text-sm font-medium text-ink-900">No chats found</p>
                <p className="text-xs text-ink-500">Start a new conversation</p>
              </div>
            ) : (
              filteredRooms.map((room) => {
                const isDirect = (room.type ?? "GROUP") === "DIRECT";
                const otherParticipantId =
                  isDirect && room.participantIds?.length
                    ? room.participantIds.find((participantId) => participantId !== currentUserId) ??
                      room.participantIds[0]
                    : undefined;
                const otherParticipant = otherParticipantId ? resolveParticipant(otherParticipantId) : null;
                const title = isDirect && otherParticipant ? otherParticipant.name : room.name;
                const subtitle =
                  room.lastMessagePreview ??
                  (isDirect ? "Direct conversation" : room.topic ?? "No messages yet");
                const timestamp = formatRelativeTimestamp(room.lastMessageAt ?? room.updatedAt);
                const unreadCount = "unreadCount" in room ? (room as { unreadCount?: number }).unreadCount : undefined;
                
                return (
                  <ConversationListItem
                    key={room.id}
                    id={room.id}
                    name={title}
                    subtitle={subtitle}
                    timestamp={timestamp}
                    unreadCount={unreadCount}
                    density={density}
                    avatarName={isDirect && otherParticipant ? otherParticipant.name : room.name}
                    avatarStatus={isDirect ? "online" : "offline"}
                    active={room.id === activeRoomId}
                    onSelect={() => onSelectRoom(room.id)}
                  />
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-1 pb-4">
            {personasLoading ? (
              <div className="flex justify-center py-8 text-sm text-ink-400">Loading people...</div>
            ) : filteredPersonas.length === 0 ? (
              <div className="py-8 text-center text-sm text-ink-500">No people found</div>
            ) : (
              filteredPersonas.map((persona) => {
                const loadingPersona = personaRoomLoadingId === persona.id;
                const isOnline = onlineUserIds.includes(persona.id);
                // Allow calling even if offline (presence might be delayed), but show status correctly
                const disableCall = callBusy || !callServiceReady || persona.id === currentUserId;
                const callDisabledReason = callBusy
                    ? "Already on a call"
                    : !callServiceReady
                      ? "Connecting..."
                      : undefined;
                return (
                  <PersonaListItem
                    key={persona.id}
                    persona={persona}
                    density={density}
                    active={activePersonaId === persona.id}
                    loading={loadingPersona}
                    callDisabled={disableCall}
                    callDisabledReason={callDisabledReason}
                    onSelect={onPersonaClick}
                    onVoiceCallClick={onVoiceCallPersona}
                    onVideoCallClick={onVideoCallPersona}
                    isOnline={isOnline}
                  />
                );
              })
            )}
            {personasError ? <p className="px-4 text-xs text-red-600">{personasError}</p> : null}
          </div>
        )}
      </div>
    </aside>
  );
}

function formatRelativeTimestamp(raw?: string | null) {
  if (!raw) {
    return undefined;
  }
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(timestamp);
}

// Icons
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}
