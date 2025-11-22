import {
  createTeamChatMessage,
  createTeamChatRoom,
  deleteTeamChatRoom,
  findDirectTeamChatRoom,
  getTeamChatRoomById,
  getUserById,
  listUsers,
  listTeamChatMessages,
  listTeamChatRooms,
  sendNotifications
} from "../data/repositories";
import { getIoNamespace } from "../ws/signaling";
import { HttpError } from "../middleware/httpError";
import { CallEventPayload, CallEventType, ChatMessage, PublicUser, TeamChatMessage, TeamChatRoom } from "../models/_types";

export async function listTeamChatRoomsForUser(user: PublicUser): Promise<TeamChatRoom[]> {
  const rooms = await listTeamChatRooms();
  return rooms.filter((room) => {
    const isDirect = (room.type ?? "GROUP") === "DIRECT";
    if (isDirect && room.participantIds?.length) {
      if (room.participantIds.includes(user.id)) {
        return true;
      }
      return user.role === "SUPER_ADMIN";
    }
    return true;
  });
}

export async function listCallEventMessages(roomId: string): Promise<ChatMessage[]> {
  const messages = await listTeamChatMessages(roomId);
  return messages
    .filter((msg) => msg.messageType === "CALL_EVENT")
    .map((msg) => ({
      ...msg,
      sessionId: msg.roomId, // Map roomId to sessionId for client compatibility
      userId: msg.authorId, // Map authorId to userId
      role: "SYSTEM", // Default role
      messageType: "CALL_EVENT",
      payload: msg.payload!
    } as ChatMessage));
}

export async function writeCallEventMessage(
  roomId: string,
  authorId: string,
  payload: CallEventPayload
): Promise<ChatMessage> {
  const body = `Call event: ${payload.event}`;
  
  const message = await createTeamChatMessage({
    roomId,
    authorId,
    body,
    messageType: "CALL_EVENT",
    payload
  });

  return {
    ...message,
    sessionId: message.roomId,
    userId: message.authorId,
    role: "SYSTEM",
    messageType: "CALL_EVENT",
    payload
  } as ChatMessage;
}

export async function isParticipant(roomId: string, userId: string): Promise<boolean> {
  const room = await getTeamChatRoomById(roomId);
  if (!room) return false;
  
  const isDirect = (room.type ?? "GROUP") === "DIRECT";
  if (isDirect && room.participantIds?.length) {
    return room.participantIds.includes(userId);
  }
  
  // For group rooms, if participantIds are defined, check them.
  if (room.participantIds && room.participantIds.length > 0) {
    return room.participantIds.includes(userId);
  }
  
  // Otherwise assume open access (or check if user exists in system)
  return true;
}

export async function getTeamChatMessagesForRoom(
  user: PublicUser,
  roomId: string,
  limit?: number
): Promise<{ room: TeamChatRoom; messages: TeamChatMessage[]; callEvents: ChatMessage[] }> {
  const room = await requireRoomAccess(user, roomId);
  const messages = await listTeamChatMessages(room.id, { limit, direction: "desc" });
  const callEvents = await listCallEventMessages(room.id);
  // Always return messages sorted ascending for display purposes.
  return {
    room,
    messages: messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    callEvents
  };
}

export async function postTeamChatMessage(
  user: PublicUser,
  roomId: string,
  body: string,
  mentions?: string[]
): Promise<TeamChatMessage> {
  const room = await requireRoomAccess(user, roomId);
  const trimmed = body?.trim();
  if (!trimmed) {
    throw new HttpError(400, "Message body is required.");
  }
  const message = await createTeamChatMessage({
    roomId: room.id,
    authorId: user.id,
    body: trimmed,
    mentions
  });
  
  // Broadcast message via WebSocket
  const io = getIoNamespace();
  if (io) {
    io.to(room.id).emit("message", message);
  }

  await notifyChatParticipants(user, room, message);
  return message;
}

export async function createTeamChatRoomForUser(
  user: PublicUser,
  payload: { name: string; description?: string; topic?: string }
): Promise<TeamChatRoom> {
  const name = payload.name?.trim();
  if (!name) {
    throw new HttpError(400, "Room name is required.");
  }
  return createTeamChatRoom({
    name,
    description: payload.description,
    topic: payload.topic,
    createdById: user.id
  });
}

export async function ensureDirectTeamChatRoomForUser(user: PublicUser, targetUserId: string): Promise<TeamChatRoom> {
  const trimmedTarget = targetUserId?.trim();
  if (!trimmedTarget) {
    throw new HttpError(400, "Target user is required.");
  }
  if (trimmedTarget === user.id) {
    throw new HttpError(400, "You cannot start a direct chat with yourself.");
  }
  const target = await getUserById(trimmedTarget);
  if (!target) {
    throw new HttpError(404, "User not found.");
  }
  const existing = await findDirectTeamChatRoom(user.id, target.id);
  if (existing) {
    return existing;
  }
  const displayName = `${target.profile.firstName} ${target.profile.lastName}`.trim() || target.email;
  const currentUserName = `${user.profile.firstName} ${user.profile.lastName}`.trim() || user.email;
  return createTeamChatRoom({
    name: `${currentUserName} ↔ ${displayName}`,
    topic: `Direct chat between ${currentUserName} and ${displayName}`,
    createdById: user.id,
    type: "DIRECT",
    participantIds: [user.id, target.id]
  });
}

export async function deleteTeamChatRoomForUser(user: PublicUser, roomId: string): Promise<void> {
  const room = await requireRoomAccess(user, roomId);
  const isOwner = room.createdById === user.id;
  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isDirectParticipant = (room.type === "DIRECT" && room.participantIds?.includes(user.id));

  if (!isOwner && !isSuperAdmin && !isDirectParticipant) {
    throw new HttpError(403, "Only the creator, a participant of a direct chat, or a super admin can delete this room.");
  }
  await deleteTeamChatRoom(room.id);
}

async function requireRoomAccess(user: PublicUser, roomId: string): Promise<TeamChatRoom> {
  const room = await getTeamChatRoomById(roomId);
  if (!room) {
    throw new HttpError(404, "Chat room not found.");
  }
  const isDirect = (room.type ?? "GROUP") === "DIRECT";
  if (isDirect && room.participantIds?.length) {
    if (room.participantIds.includes(user.id) || user.role === "SUPER_ADMIN") {
      return room;
    }
    throw new HttpError(403, "You do not have access to this conversation.");
  }
  return room;
}

async function notifyChatParticipants(sender: PublicUser, room: TeamChatRoom, message: TeamChatMessage) {
  const recipients = await resolveChatRecipients(room, sender.id);
  if (!recipients.length) {
    return;
  }
  const senderName = buildUserDisplayName(sender);
  const preview = message.body.length > 160 ? `${message.body.slice(0, 157)}...` : message.body;
  const label =
    (room.type ?? "GROUP") === "DIRECT"
      ? `${senderName} sent you a message`
      : `${senderName} posted in ${room.name}`;
  await sendNotifications(recipients, label, "CHAT_MESSAGE", {
    roomId: room.id,
    roomName: room.name,
    senderId: sender.id,
    preview
  });
}

async function resolveChatRecipients(room: TeamChatRoom, authorId: string): Promise<string[]> {
  if ((room.type ?? "GROUP") === "DIRECT" && room.participantIds?.length) {
    return room.participantIds.filter((id) => id && id !== authorId);
  }
  const baseIds =
    room.participantIds && room.participantIds.length
      ? room.participantIds
      : (await listUsers()).filter((user) => user.isActive).map((user) => user.id);
  const unique = new Set(baseIds.filter((id) => id && id !== authorId));
  return Array.from(unique);
}

function buildUserDisplayName(user: PublicUser): string {
  const compact = `${user.profile.firstName} ${user.profile.lastName}`.trim();
  return compact || user.email;
}
