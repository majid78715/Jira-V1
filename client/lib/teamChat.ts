import { apiRequest } from "./apiClient";
import { CallEventMessage, TeamChatMessage, TeamChatRoom } from "./types";

export async function fetchTeamChatRooms(): Promise<TeamChatRoom[]> {
  const response = await apiRequest<{ rooms: TeamChatRoom[] }>("/team-chat/rooms");
  return response.rooms ?? [];
}

export async function fetchTeamChatMessages(
  roomId: string,
  options?: { limit?: number }
): Promise<{ room: TeamChatRoom; messages: TeamChatMessage[]; callEvents: CallEventMessage[] }> {
  const query = new URLSearchParams();
  if (options?.limit) {
    query.set("limit", String(options.limit));
  }
  const search = query.toString();
  return apiRequest<{ room: TeamChatRoom; messages: TeamChatMessage[]; callEvents: CallEventMessage[] }>(
    `/team-chat/rooms/${roomId}/messages${search ? `?${search}` : ""}`
  );
}

export async function sendTeamChatMessage(
  roomId: string,
  body: string,
  mentions?: string[]
): Promise<TeamChatMessage> {
  const response = await apiRequest<{ message: TeamChatMessage }>(`/team-chat/rooms/${roomId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body, mentions })
  });
  return response.message;
}

export async function createTeamChatRoom(payload: {
  name: string;
  description?: string;
  topic?: string;
}): Promise<TeamChatRoom> {
  const response = await apiRequest<{ room: TeamChatRoom }>("/team-chat/rooms", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.room;
}

export async function ensureDirectTeamChatRoom(userId: string): Promise<TeamChatRoom> {
  const response = await apiRequest<{ room: TeamChatRoom }>(`/team-chat/direct/${userId}`, {
    method: "POST"
  });
  return response.room;
}

export async function deleteTeamChatRoom(roomId: string): Promise<void> {
  await apiRequest(`/team-chat/rooms/${roomId}`, {
    method: "DELETE"
  });
}
