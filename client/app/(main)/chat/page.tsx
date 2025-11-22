"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { Button } from "../../../components/ui/Button";
import { TeamChatMessageList } from "../../../components/collaboration/TeamChatMessageList";
import { TeamChatComposer } from "../../../components/collaboration/TeamChatComposer";
import { ChatSidebar } from "../../../components/chat/ChatSidebar";
import { ChatDensity } from "../../../components/chat/types";
import { apiRequest, ApiError } from "../../../lib/apiClient";
import {
  createTeamChatRoom,
  deleteTeamChatRoom,
  ensureDirectTeamChatRoom,
  fetchTeamChatMessages,
  fetchTeamChatRooms,
  sendTeamChatMessage
} from "../../../lib/teamChat";
import { CallEventMessage, TeamChatMessage, TeamChatRoom, UserDirectoryEntry } from "../../../lib/types";
import { useCallContext } from "../../../features/chat/call/CallContext";
import {
  emitNotificationsUpdated,
  fetchUnreadNotificationsByType,
  markNotificationsRead
} from "../../../lib/notifications";

export default function ChatPage() {
  const { user, loading } = useCurrentUser({ redirectTo: "/login" });
  const [rooms, setRooms] = useState<TeamChatRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [callEvents, setCallEvents] = useState<CallEventMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [personas, setPersonas] = useState<UserDirectoryEntry[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);
  const [personasError, setPersonasError] = useState<string | null>(null);
  const [personaRoomLoadingId, setPersonaRoomLoadingId] = useState<string | null>(null);
  const [showNewRoomForm, setShowNewRoomForm] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomTopic, setNewRoomTopic] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [density, setDensity] = useState<ChatDensity>("compact");
  const lastClearedChatNotificationRef = useRef(0);
  const {
    callState,
    currentCall,
    callError: callServiceError,
    isBusy: callBusy,
    serviceReady: callServiceReady,
    localStream,
    remoteStreams,
    onlineUserIds,
    startCall,
    setScopeSessionId,
    lastMessage
  } = useCallContext();

  const clearChatNotifications = useCallback(async () => {
    const now = Date.now();
    const cooldownMs = 10000;
    if (now - lastClearedChatNotificationRef.current < cooldownMs) {
      return;
    }
    lastClearedChatNotificationRef.current = now;
    try {
      const unread = await fetchUnreadNotificationsByType("CHAT_MESSAGE", 200);
      if (!unread.length) {
        return;
      }
      await markNotificationsRead(unread.map((notification) => notification.id));
      emitNotificationsUpdated();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to clear chat notifications", error);
    }
  }, []);

  // Update scope session ID when activeRoomId changes
  useEffect(() => {
    setScopeSessionId(activeRoomId);
    return () => setScopeSessionId(null);
  }, [activeRoomId, setScopeSessionId]);

  // DEBUG: Track remoteStream changes
  useEffect(() => {
    console.info("[ChatPage] Call state changed", {
      callState,
      remoteStreamsCount: remoteStreams.size,
      hasLocalStream: !!localStream,
      hasCurrentCall: !!currentCall
    });
    
    remoteStreams.forEach((stream, peerId) => {
      const audioTracks = stream.getAudioTracks();
      console.info(`[ChatPage] Remote stream details for ${peerId}`, {
        id: stream.id,
        active: stream.active,
        audioTracks: audioTracks.map(t => ({
          id: t.id,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          label: t.label
        }))
      });
    });
  }, [callState, remoteStreams, localStream, currentCall]);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const list = await fetchTeamChatRooms();
      setRooms(list);
      setActiveRoomId((current) => {
        if (current && list.some((room) => room.id === current)) {
          return current;
        }
        return list[0]?.id ?? null;
      });
    } catch (err) {
      const apiError = err as ApiError;
      setBannerError(apiError?.message ?? "Unable to load team chat rooms.");
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (roomId: string, options?: { silent?: boolean }) => {
    const showSpinner = !options?.silent;
    if (showSpinner) {
      setMessagesLoading(true);
    }
    try {
      const response = await fetchTeamChatMessages(roomId, { limit: 200 });
      setMessages(response.messages);
      setCallEvents(response.callEvents ?? []);
      await clearChatNotifications();
    } catch (err) {
      const apiError = err as ApiError;
      setBannerError(apiError?.message ?? "Unable to load conversation.");
    } finally {
      if (showSpinner) {
        setMessagesLoading(false);
      }
    }
  }, [clearChatNotifications]);

  const loadPersonas = useCallback(async () => {
    setPersonasLoading(true);
    try {
      const response = await apiRequest<{ users: UserDirectoryEntry[] }>("/users");
      setPersonas(response.users ?? []);
      setPersonasError(null);
    } catch (err) {
      const apiError = err as ApiError;
      setPersonasError(apiError?.message ?? "Unable to load personas.");
    } finally {
      setPersonasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadRooms();
      void loadPersonas();
      void clearChatNotifications();
    }
  }, [user, loadRooms, loadPersonas, clearChatNotifications]);

  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeRoomId);
  }, [activeRoomId, loadMessages]);

  useEffect(() => {
    if (!activeRoomId) {
      return;
    }
    const interval = window.setInterval(() => {
      void loadMessages(activeRoomId, { silent: true });
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [activeRoomId, loadMessages]);

  // Handle real-time messages
  useEffect(() => {
    if (!lastMessage) return;

    // If the message belongs to the active room, append it
    if (activeRoomId && lastMessage.roomId === activeRoomId) {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === lastMessage.id)) {
          return prev;
        }
        return [...prev, lastMessage];
      });
      // Also clear notifications if we are looking at the room
      void clearChatNotifications();
    }

    // Refresh room list to update previews and order
    void loadRooms();
  }, [lastMessage, activeRoomId, loadRooms, clearChatNotifications]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedDensity = window.localStorage.getItem("chatDensity");
    if (storedDensity === "compact" || storedDensity === "comfortable") {
      setDensity(storedDensity);
    }
  }, []);

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  const canDeleteActiveRoom = useMemo(() => {
    if (!activeRoom || !user) {
      return false;
    }
    return activeRoom.createdById === user.id || user.role === "SUPER_ADMIN";
  }, [activeRoom, user]);

  const participantMap = useMemo(() => {
    const map = new Map(
      personas.map((persona) => [
        persona.id,
        {
          id: persona.id,
          name: persona.name,
          role: persona.role
        }
      ])
    );
    if (user) {
      map.set(user.id, {
        id: user.id,
        name: `${user.profile.firstName} ${user.profile.lastName}`.trim(),
        role: user.role
      });
    }
    return map;
  }, [personas, user]);

  const activeDirectPersonaId = useMemo(() => {
    if (!activeRoom || (activeRoom.type ?? "GROUP") !== "DIRECT" || !activeRoom.participantIds?.length) {
      return null;
    }
    if (user) {
      return activeRoom.participantIds.find((participantId) => participantId !== user.id) ?? null;
    }
    return activeRoom.participantIds[0] ?? null;
  }, [activeRoom, user]);

  const activeDirectPersona = useMemo(
    () => personas.find((persona) => persona.id === activeDirectPersonaId) ?? null,
    [personas, activeDirectPersonaId]
  );

  const activePeerOnline = useMemo(
    () => (activeDirectPersona ? onlineUserIds.includes(activeDirectPersona.id) : false),
    [activeDirectPersona, onlineUserIds]
  );

  const callButtonDisabled =
    !activeRoomId || !activeDirectPersona || callBusy || !callServiceReady || !activePeerOnline;
  const callButtonTooltip = !activePeerOnline
    ? "User offline"
    : callBusy
      ? "Already on a call"
      : !callServiceReady
        ? "Connecting voice service..."
        : undefined;

  const resolveParticipant = useCallback(
    (userId: string) => participantMap.get(userId),
    [participantMap]
  );

  const storageSummary = useMemo(() => {
    const totalMb = 4096;
    const derivedUsage = rooms.length * 96 + (messages.length + callEvents.length) * 3.2;
    const usedMb = Math.min(totalMb, Math.max(480, Math.round(derivedUsage)));
    const percentUsed = Math.min(100, Math.round((usedMb / totalMb) * 100));
    const remainingMb = Math.max(0, totalMb - usedMb);
    return {
      percentUsed,
      usedLabel: `${(usedMb / 1024).toFixed(1)} GB`,
      remainingLabel: `${(remainingMb / 1024).toFixed(1)} GB`,
      caption:
        percentUsed > 80
          ? "Approaching workspace limit—older calls will purge soon."
          : "Transcripts auto-purge after 30 days."
    };
  }, [rooms.length, messages.length, callEvents.length]);

  const timelineEntries = useMemo(() => {
    const messageEntries = messages.map((message) => ({
      type: "message" as const,
      createdAt: message.createdAt,
      id: `message-${message.id}`,
      message
    }));
    const callEntries = callEvents.map((event) => ({
      type: "call" as const,
      createdAt: event.createdAt,
      id: `call-${event.id}`,
      event
    }));
    return [...messageEntries, ...callEntries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [messages, callEvents]);

  const handlePersonaClick = useCallback(
    async (persona: UserDirectoryEntry) => {
      setBannerError(null);
      setPersonaRoomLoadingId(persona.id);
      try {
        const room = await ensureDirectTeamChatRoom(persona.id);
        setActiveRoomId(room.id);
        await loadRooms();
      } catch (err) {
        const apiError = err as ApiError;
        setBannerError(apiError?.message ?? "Unable to start a direct chat.");
      } finally {
        setPersonaRoomLoadingId((current) => (current === persona.id ? null : current));
      }
    },
    [loadRooms]
  );

  const initiateCall = useCallback(
    async (persona: UserDirectoryEntry, video: boolean) => {
      if (!user || persona.id === user.id) {
        return;
      }
      setBannerError(null);
      setPersonaRoomLoadingId(persona.id);
      try {
        const room = await ensureDirectTeamChatRoom(persona.id);
        setActiveRoomId(room.id);
        await startCall({ sessionId: room.id, toUserId: persona.id, video });
        await loadRooms();
        await loadMessages(room.id, { silent: true });
      } catch (err) {
        const apiError = err as ApiError;
        setBannerError(apiError?.message ?? "Unable to start a call.");
        // Force clear loading state if error occurs
        setPersonaRoomLoadingId(null);
      } finally {
        setPersonaRoomLoadingId((current) => (current === persona.id ? null : current));
      }
    },
    [loadRooms, loadMessages, startCall, user]
  );

  const handleVoiceCallPersona = useCallback(
    (persona: UserDirectoryEntry) => {
      void initiateCall(persona, false);
    },
    [initiateCall]
  );

  const handleVideoCallPersona = useCallback(
    (persona: UserDirectoryEntry) => {
      void initiateCall(persona, true);
    },
    [initiateCall]
  );

  const handleDensityChange = useCallback((next: ChatDensity) => {
    setDensity(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("chatDensity", next);
    }
  }, []);

  const handleSelectRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId);
  }, []);

  const handleRefreshRooms = useCallback(() => {
    void loadRooms();
  }, [loadRooms]);

  const handleCreateRoom = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!newRoomName.trim()) {
        return;
      }
      setCreatingRoom(true);
      setBannerError(null);
      try {
        const room = await createTeamChatRoom({
          name: newRoomName.trim(),
          topic: newRoomTopic.trim() || undefined
        });
        setShowNewRoomForm(false);
        setNewRoomName("");
        setNewRoomTopic("");
        setActiveRoomId(room.id);
        await loadRooms();
      } catch (err) {
        const apiError = err as ApiError;
        setBannerError(apiError?.message ?? "Unable to create room.");
      } finally {
        setCreatingRoom(false);
      }
    },
    [newRoomName, newRoomTopic, loadRooms]
  );

  const handleSend = useCallback(
    async (body: string) => {
      if (!activeRoomId) {
        return;
      }
      setSending(true);
      setBannerError(null);
      try {
        const message = await sendTeamChatMessage(activeRoomId, body);
        setMessages((prev) => [...prev, message]);
        await loadRooms();
      } catch (err) {
        const apiError = err as ApiError;
        setBannerError(apiError?.message ?? "Unable to send message.");
      } finally {
        setSending(false);
      }
    },
    [activeRoomId, loadRooms]
  );

  const handleRefreshRoom = useCallback(() => {
    if (!activeRoomId) {
      return;
    }
    void loadRooms();
    void loadMessages(activeRoomId);
  }, [activeRoomId, loadRooms, loadMessages]);

  useEffect(() => {
    if (callState === "ENDED" && activeRoomId) {
      void loadMessages(activeRoomId, { silent: true });
    }
  }, [activeRoomId, callState, loadMessages]);

  const handleDeleteRoom = useCallback(async () => {
    if (!activeRoomId || !activeRoom) {
      return;
    }
    setDeletingRoom(true);
    setBannerError(null);
    try {
      await deleteTeamChatRoom(activeRoomId);
      setMessages([]);
      setActiveRoomId((current) => (current === activeRoomId ? null : current));
      await loadRooms();
    } catch (err) {
      const apiError = err as ApiError;
      setBannerError(apiError?.message ?? "Unable to delete room.");
    } finally {
      setDeletingRoom(false);
    }
  }, [activeRoomId, activeRoom, loadRooms]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading team chat...</div>;
  }

  return (
    <>
      <PageShell
        title="Chat"
        subtitle="Every Humain & vendor teammate - real people only."
        userName={`${user.profile.firstName} ${user.profile.lastName}`}
        currentUser={user}
        currentUserId={user.id}
      >
      <div className="grid gap-6 items-start lg:grid-cols-[320px_1fr] xl:grid-cols-[384px_1fr]">
        <ChatSidebar
          density={density}
          onDensityChange={handleDensityChange}
          rooms={rooms}
          roomsLoading={roomsLoading}
          activeRoomId={activeRoomId}
          onSelectRoom={handleSelectRoom}
          resolveParticipant={resolveParticipant}
          showNewRoomForm={showNewRoomForm}
          onToggleNewRoomForm={() => setShowNewRoomForm((prev) => !prev)}
          newRoomName={newRoomName}
          newRoomTopic={newRoomTopic}
          onNewRoomNameChange={(event) => setNewRoomName(event.target.value)}
          onNewRoomTopicChange={(event) => setNewRoomTopic(event.target.value)}
          onCreateRoom={handleCreateRoom}
          creatingRoom={creatingRoom}
          onRefreshRooms={handleRefreshRooms}
          personas={personas}
          personasLoading={personasLoading}
          personasError={personasError}
          activePersonaId={activeDirectPersonaId}
          personaRoomLoadingId={personaRoomLoadingId}
          onPersonaClick={(persona) => {
            void handlePersonaClick(persona);
          }}
          onVoiceCallPersona={handleVoiceCallPersona}
          onVideoCallPersona={handleVideoCallPersona}
          callBusy={callBusy}
          callServiceReady={callServiceReady}
          onlineUserIds={onlineUserIds}
          currentUserId={user.id}
          storageSummary={storageSummary}
        />

        <section className="flex h-[calc(100vh-120px)] flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink-100 px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <span className="text-lg font-semibold">
                  {activeRoom?.name?.charAt(0).toUpperCase() ?? "#"}
                </span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-ink-900">{activeRoom?.name ?? "Select a chat"}</h2>
                <p className="text-xs text-ink-500 line-clamp-1">
                  {activeRoom?.topic ?? (activeDirectPersona ? activeDirectPersona.role : "No topic")}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {activeRoomId && activeDirectPersona ? (
                <>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                    disabled={callButtonDisabled}
                    onClick={() =>
                      void startCall({ sessionId: activeRoomId, toUserId: activeDirectPersona.id, video: false })
                    }
                    title={callButtonTooltip ?? "Voice Call"}
                  >
                    <PhoneIcon />
                  </button>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50"
                    disabled={callButtonDisabled}
                    onClick={() =>
                      void startCall({ sessionId: activeRoomId, toUserId: activeDirectPersona.id, video: true })
                    }
                    title={callButtonTooltip ?? "Video Call"}
                  >
                    <VideoIcon />
                  </button>
                </>
              ) : null}
              
              <div className="mx-2 h-6 w-px bg-ink-100" />
              
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-600 disabled:opacity-50"
                onClick={handleRefreshRoom}
                disabled={!activeRoomId || messagesLoading}
                title="Refresh Messages"
              >
                <RefreshIcon />
              </button>
              
              {canDeleteActiveRoom ? (
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  onClick={handleDeleteRoom}
                  disabled={deletingRoom || !activeRoomId}
                  title="Delete Conversation"
                >
                  <TrashIcon />
                </button>
              ) : null}
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto bg-white px-6 py-4">
            {!activeRoomId ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 rounded-full bg-ink-50 p-6 text-ink-300">
                  <ChatIconLarge />
                </div>
                <h3 className="text-lg font-medium text-ink-900">Your Messages</h3>
                <p className="mt-1 max-w-xs text-sm text-ink-500">
                  Select a conversation from the sidebar or start a new chat to collaborate with your team.
                </p>
              </div>
            ) : messagesLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
              </div>
            ) : (
              <TeamChatMessageList
                entries={timelineEntries}
                resolveParticipant={resolveParticipant}
                currentUserId={user.id}
              />
            )}
          </div>

          {/* Composer Area */}
          <div className="border-t border-ink-100 bg-white px-6 py-4">
            {/* Status Bar */}
            <div className="mb-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {!callServiceReady ? (
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                    Connecting voice service...
                  </span>
                ) : null}
                {callServiceError && callState === "IDLE" ? (
                  <span className="text-red-600">{callServiceError}</span>
                ) : null}
                {bannerError ? <span className="text-red-600">{bannerError}</span> : null}
              </div>
              {activeDirectPersona ? (
                <span className="text-ink-400">
                  {activePeerOnline ? "Online" : "Offline"}
                </span>
              ) : null}
            </div>

            <TeamChatComposer
              onSend={handleSend}
              disabled={!activeRoomId || sending}
              placeholder={
                activeDirectPersona ? `Message ${activeDirectPersona.name}...` : "Type a message..."
              }
            />
          </div>
        </section>
      </div>
    </PageShell>
    </>
  );
}

// Icons
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function ChatIconLarge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="h-12 w-12">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  );
}
