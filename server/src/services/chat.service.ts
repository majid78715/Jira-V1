import { CallEventPayload, ChatMessage, ChatSession, PublicUser } from "../models/_types";
import {
  createChatMessage,
  createChatSession,
  getChatSessionById,
  listChatMessagesForSession,
  listChatSessionsForUser,
  updateChatSession,
  getTeamChatRoomById
} from "../data/repositories";
import { buildChatContext, ChatContext, DEFAULT_CHAT_CONTEXT_CHIPS } from "./chatContextBuilder";
import { LLMAdapter } from "./llmAdapter";
import { HttpError } from "../middleware/httpError";
import { createProjectDraft, listProjectsForUser } from "./project.service";
import { createTaskForProject } from "./task.service";

export type SendChatMessageInput = {
  message: string;
  sessionId?: string;
  contextChips?: string[];
};

export async function listUserChatSessions(user: PublicUser): Promise<ChatSession[]> {
  return listChatSessionsForUser(user.id);
}

export async function getChatSessionTranscript(user: PublicUser, sessionId: string): Promise<{
  session: ChatSession;
  messages: ChatMessage[];
}> {
  const session = await getChatSessionById(sessionId);
  if (!session || session.userId !== user.id) {
    throw new HttpError(404, "Chat session not found.");
  }
  const messages = await listChatMessagesForSession(session.id);
  return { session, messages };
}

export async function sendChatMessageForUser(
  user: PublicUser,
  input: SendChatMessageInput
): Promise<{
  session: ChatSession;
  messages: ChatMessage[];
  context: ChatContext;
  guardrailTriggered: boolean;
}> {
  const body = input.message?.trim();
  if (!body) {
    throw new Error("message is required.");
  }

  const normalizedChips = normalizeChips(input.contextChips);
  let session = await resolveSession(user, input.sessionId, normalizedChips);
  const context = await buildChatContext(user, session.contextChips);

  await createChatMessage({
    sessionId: session.id,
    userId: user.id,
    role: "USER",
    body,
    messageType: "TEXT"
  });

  const llmOutcome = await LLMAdapter.sendMessage({
    userId: user.id,
    message: body,
    context
  });

  let responseText = llmOutcome.text;

  if (llmOutcome.action) {
    if (user.role !== "PM") {
      responseText = "I'm sorry, but only Product Managers can create projects or tasks.";
    } else {
      try {
        if (llmOutcome.action.type === "CREATE_PROJECT") {
          const vendorId = context.vendors[0]?.companyId;
          if (!vendorId) {
            responseText +=
              "\n\nI couldn't find a valid vendor to assign this project to. Please ensure you have vendor relationships set up.";
          } else {
            const draft = await createProjectDraft(user, {
              name: llmOutcome.action.name,
              description: `Draft created by AI for ${llmOutcome.action.name}`,
              productManagerId: user.id,
              vendorCompanyId: vendorId,
              projectManagerId: user.id,
              budgetBucket: 100
            });
            responseText += `\n\n✅ Project draft "${draft.name}" created successfully (ID: ${draft.code}).`;
          }
        } else if (llmOutcome.action.type === "CREATE_TASK") {
          const projects = await listProjectsForUser(user);
          const targetProject = projects.find(
            (p) =>
              p.name.toLowerCase().includes(llmOutcome.action!.projectName.toLowerCase()) ||
              p.code.toLowerCase() === llmOutcome.action!.projectName.toLowerCase()
          );

          if (!targetProject) {
            responseText += `\n\n❌ I couldn't find a project named "${llmOutcome.action.projectName}".`;
          } else {
            const task = await createTaskForProject(
              targetProject.id,
              {
                itemType: "TASK",
                title: llmOutcome.action.title,
                taskFields: { description: "Created via AI Assistant" }
              },
              user
            );
            responseText += `\n\n✅ Task "${task.title}" created in project ${targetProject.name}.`;
          }
        }
      } catch (err: any) {
        responseText += `\n\n⚠️ Failed to execute action: ${err.message}`;
      }
    }
  }

  const assistantMessage = await createChatMessage({
    sessionId: session.id,
    userId: user.id,
    role: "ASSISTANT",
    body: responseText,
    messageType: "TEXT",
    metadata: {
      guardrailTriggered: llmOutcome.guardrailTriggered,
      topics: llmOutcome.topics,
      generatedAt: context.generatedAt
    }
  });

  session = await updateChatSession(session.id, {
    title: deriveTitle(session.title, body),
    lastMessageAt: assistantMessage.createdAt,
    lastMessagePreview: llmOutcome.text.slice(0, 200)
  });

  const messages = await listChatMessagesForSession(session.id);
  return { session, messages, context, guardrailTriggered: llmOutcome.guardrailTriggered };
}

async function resolveSession(user: PublicUser, sessionId?: string, normalizedChips?: string[]) {
  if (!sessionId) {
    return createChatSession({
      userId: user.id,
      contextChips: normalizedChips?.length ? normalizedChips : DEFAULT_CHAT_CONTEXT_CHIPS
    });
  }
  const existing = await getChatSessionById(sessionId);
  if (!existing || existing.userId !== user.id) {
    throw new HttpError(404, "Chat session not found.");
  }
  if (normalizedChips?.length) {
    return updateChatSession(existing.id, { contextChips: normalizedChips });
  }
  return existing;
}

function normalizeChips(chips?: string[]) {
  if (!chips?.length) {
    return undefined;
  }
  return Array.from(new Set(chips.map((chip) => chip.trim()).filter(Boolean)));
}

function deriveTitle(current: string, message: string) {
  if (current && current !== "Workspace Copilot") {
    return current;
  }
  return message.length > 60 ? `${message.slice(0, 57)}...` : message;
}

export async function isParticipant(sessionId: string, userId: string): Promise<boolean> {
  const room = await getTeamChatRoomById(sessionId);
  if (!room?.participantIds?.length) {
    return false;
  }
  return room.participantIds.includes(userId);
}

export async function writeCallEventMessage(
  sessionId: string,
  actorId: string,
  payload: CallEventPayload
): Promise<ChatMessage> {
  return createChatMessage({
    sessionId,
    userId: actorId,
    role: "SYSTEM",
    body: `call:${payload.event}`,
    messageType: "CALL_EVENT",
    payload
  });
}

export async function listCallEventMessages(sessionId: string): Promise<ChatMessage[]> {
  const messages = await listChatMessagesForSession(sessionId);
  return messages.filter((message) => message.messageType === "CALL_EVENT");
}
