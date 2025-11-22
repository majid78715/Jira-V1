import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useCurrentUser } from "./useCurrentUser";
import { useCallContext } from "../features/chat/call/CallContext";
import {
  createTeamChatRoom,
  deleteTeamChatRoom,
  ensureDirectTeamChatRoom,
  fetchTeamChatMessages,
  fetchTeamChatRooms,
  sendTeamChatMessage
} from "../lib/teamChat";
import {
  emitNotificationsUpdated,
  fetchUnreadNotificationsByType,
  markNotificationsRead
} from "../lib/notifications";
import { apiRequest, ApiError } from "../lib/apiClient";
import { CallEventMessage, TeamChatMessage, TeamChatRoom, UserDirectoryEntry } from "../lib/types";

export function useTeamChatState() {
  const { user, loading: userLoading } = useCurrentUser();
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
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  
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
      console.error("Failed to clear chat notifications", error);
    }
  }, []);

  // Update scope session ID when activeRoomId changes
  useEffect(() => {
    setScopeSessionId(activeRoomId);
    return () => setScopeSessionId(null);
  }, [activeRoomId, setScopeSessionId]);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const list = await fetchTeamChatRooms();
      setRooms(list);
      // We don't automatically set activeRoomId here to allow flexibility
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

  // Initial load
  useEffect(() => {
    if (user) {
      void loadRooms();
      void loadPersonas();
      void clearChatNotifications();
    }
  }, [user, loadRooms, loadPersonas, clearChatNotifications]);

  // Load messages when active room changes
  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeRoomId);
  }, [activeRoomId, loadMessages]);

  // Poll messages
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

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  const canDeleteActiveRoom = useMemo(() => {
    if (!activeRoom || !user) {
      return false;
    }
    const isDirectParticipant = (activeRoom.type === "DIRECT" && activeRoom.participantIds?.includes(user.id));
    return activeRoom.createdById === user.id || user.role === "SUPER_ADMIN" || isDirectParticipant;
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

  const resolveParticipant = useCallback(
    (userId: string) => participantMap.get(userId),
    [participantMap]
  );

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
        setPersonaRoomLoadingId(null);
      } finally {
        setPersonaRoomLoadingId((current) => (current === persona.id ? null : current));
      }
    },
    [loadRooms, loadMessages, startCall, user]
  );

  const handleCreateRoom = useCallback(
    async (name: string, topic: string) => {
      if (!name.trim()) {
        return;
      }
      setCreatingRoom(true);
      setBannerError(null);
      try {
        const room = await createTeamChatRoom({
          name: name.trim(),
          topic: topic.trim() || undefined
        });
        setActiveRoomId(room.id);
        await loadRooms();
        return room;
      } catch (err) {
        const apiError = err as ApiError;
        setBannerError(apiError?.message ?? "Unable to create room.");
        throw err;
      } finally {
        setCreatingRoom(false);
      }
    },
    [loadRooms]
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

  const handleDeleteRoom = useCallback(async () => {
    if (!activeRoomId || !activeRoom) {
      return;
    }
    setDeletingRoom(true);
    setBannerError(null);
    try {
      await deleteTeamChatRoom(activeRoomId);
      setMessages([]);
      setActiveRoomId(null);
      await loadRooms();
    } catch (err) {
      const apiError = err as ApiError;
      setBannerError(apiError?.message ?? "Unable to delete room.");
    } finally {
      setDeletingRoom(false);
    }
  }, [activeRoomId, activeRoom, loadRooms]);

  const deleteRoomById = useCallback(async (roomId: string) => {
    setBannerError(null);
    try {
      await deleteTeamChatRoom(roomId);
      if (activeRoomId === roomId) {
        setMessages([]);
        setActiveRoomId(null);
      }
      await loadRooms();
    } catch (err) {
      const apiError = err as ApiError;
      setBannerError(apiError?.message ?? "Unable to delete room.");
    }
  }, [activeRoomId, loadRooms]);

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

  return {
    user,
    userLoading,
    rooms,
    roomsLoading,
    activeRoomId,
    setActiveRoomId,
    messages,
    messagesLoading,
    callEvents,
    bannerError,
    setBannerError,
    sending,
    personas,
    personasLoading,
    personasError,
    personaRoomLoadingId,
    creatingRoom,
    deletingRoom,
    activeRoom,
    canDeleteActiveRoom,
    participantMap,
    activeDirectPersona,
    activePeerOnline,
    resolveParticipant,
    handlePersonaClick,
    initiateCall,
    handleCreateRoom,
    handleSend,
    handleDeleteRoom,
    deleteRoomById,
    loadRooms,
    loadMessages,
    timelineEntries,
    callState,
    callServiceReady,
    callServiceError,
    callBusy,
    onlineUserIds
  };
}
