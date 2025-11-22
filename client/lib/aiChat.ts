import { apiRequest } from "./apiClient";
import { ChatContext, ChatMessage, ChatSession } from "./types";

export const CHAT_CONTEXT_CHIPS = [
  { id: "project", label: "Project X" },
  { id: "this-week", label: "This week" },
  { id: "my-tasks", label: "My tasks" }
] as const;

export type SendChatMessageOptions = {
  message: string;
  sessionId?: string;
  contextChips?: string[];
};

export type SendChatMessageResponse = {
  session: ChatSession;
  messages: ChatMessage[];
  context: ChatContext;
  guardrailTriggered: boolean;
};

export async function sendChatMessage(options: SendChatMessageOptions): Promise<SendChatMessageResponse> {
  return apiRequest<SendChatMessageResponse>("/ai-chat/message", {
    method: "POST",
    body: JSON.stringify(options)
  });
}

export async function fetchChatSessions(): Promise<ChatSession[]> {
  const response = await apiRequest<{ sessions: ChatSession[] }>("/ai-chat/sessions");
  return response.sessions;
}

export async function fetchChatSession(
  sessionId: string
): Promise<{ session: ChatSession; messages: ChatMessage[] }> {
  return apiRequest<{ session: ChatSession; messages: ChatMessage[] }>(`/ai-chat/sessions/${sessionId}`);
}
