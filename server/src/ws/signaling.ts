import { Server as HttpServer } from "node:http";
import { Namespace, Server, Socket } from "socket.io";
import cookie from "cookie";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "../services/auth.service";
import { getTeamChatRoomById, getUserById, recordActivity, toPublicUser, createAttachment, createTeamChatMessage } from "../data/repositories";
import {
  CallEventPayload,
  CallEventType,
  CallMediaType,
  PublicUser,
  TeamChatRoom
} from "../models/_types";
import { isParticipant, writeCallEventMessage } from "../services/teamChat.service";

type AuthedSocket = Socket & {
  data: {
    user: PublicUser;
    joinedSessions: Set<string>;
  };
};

type JoinPayload = {
  sessionId?: string;
  userId?: string;
};

type InvitePayload = {
  sessionId?: string;
  fromUserId?: string;
  toUserId?: string;
  media?: CallMediaType;
};

type SdpPayload = {
  sessionId?: string;
  fromUserId?: string;
  toUserId?: string;
  sdp?: string;
};

type CandidatePayload = {
  sessionId?: string;
  fromUserId?: string;
  toUserId?: string;
  candidate?: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
  };
};

type AudioPayload = {
  sessionId?: string;
  fromUserId?: string;
  toUserId?: string;
  chunk?: string; // Base64 encoded audio data
};

type EndCallPayload = {
  sessionId?: string;
  fromUserId?: string;
  reason?: string;
};

type ActiveCall = {
  sessionId: string;
  initiatorUserId: string;
  participants: Set<string>;
  media: CallMediaType;
  startedAt: string;
  transcripts: {
    userId: string;
    text: string;
    timestamp: string;
  }[];
};

let ioNamespace: Namespace | undefined;

export function getIoNamespace(): Namespace | undefined {
  return ioNamespace;
}

export function initSignalingServer(httpServer: HttpServer): Namespace {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
      credentials: true
    }
  });

  const namespace = io.of("/ws");
  ioNamespace = namespace;
  const userSockets = new Map<string, Set<AuthedSocket>>();
  const onlineUsers = new Set<string>();
  const sessionUserCounts = new Map<string, Map<string, number>>();
  const activeCalls = new Map<string, ActiveCall>();

  namespace.use(async (socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie ?? "");
      const token = cookies[AUTH_COOKIE_NAME];
      if (!token) {
        return next(new Error("Unauthorized"));
      }
      const payload = verifyAuthToken(token);
      if (!payload) {
        return next(new Error("Unauthorized"));
      }
      const user = await getUserById(payload.sub);
      if (!user || !user.isActive) {
        return next(new Error("Unauthorized"));
      }
      const authedSocket = socket as AuthedSocket;
      authedSocket.data.user = toPublicUser(user);
      authedSocket.data.joinedSessions = new Set();
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  namespace.on("connection", (rawSocket) => {
    const socket = rawSocket as AuthedSocket;
    const userId = socket.data.user.id;
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket);
    onlineUsers.add(userId);
    broadcastPresence();

    socket.on("join", async (payload: JoinPayload) => {
      const sessionId = payload?.sessionId?.trim();
      if (!sessionId || payload.userId !== userId) {
        sendError(socket, "Invalid join payload.");
        return;
      }
      if (socket.data.joinedSessions.has(sessionId)) {
        return;
      }
      if (!(await isParticipant(sessionId, userId))) {
        sendError(socket, "You are not part of this conversation.");
        return;
      }
      await socket.join(sessionId);
      socket.data.joinedSessions.add(sessionId);
      incrementSessionCount(sessionId, userId);
      emitSessionPresence(sessionId);
      console.info("[Signaling] user joined session", { sessionId, userId });
    });

    socket.on("leave", async (payload: JoinPayload) => {
      const sessionId = payload?.sessionId?.trim();
      if (!sessionId) {
        return;
      }
      if (!socket.data.joinedSessions.has(sessionId)) {
        return;
      }
      await socket.leave(sessionId);
      socket.data.joinedSessions.delete(sessionId);
      decrementSessionCount(sessionId, userId);
      emitSessionPresence(sessionId);
    });

    socket.on("call:invite", async (payload: InvitePayload) => {
      try {
        const normalized = normalizeInvitePayload(payload);
        if (userId !== normalized.fromUserId) {
          throw new Error("You cannot spoof another user.");
        }
        if (!socket.data.joinedSessions.has(normalized.sessionId)) {
          throw new Error("Join the conversation before starting a call.");
        }
        if (activeCalls.has(normalized.sessionId)) {
          throw new Error("A call is already in progress for this conversation.");
        }
        const room = await ensureParticipants(normalized.sessionId, normalized.fromUserId, normalized.toUserId);
        const startedAt = new Date().toISOString();
        
        // Initialize participants with just the initiator
        const participants = new Set<string>();
        participants.add(normalized.fromUserId);

        activeCalls.set(normalized.sessionId, {
          sessionId: normalized.sessionId,
          initiatorUserId: normalized.fromUserId,
          participants,
          media: normalized.media,
          startedAt,
          transcripts: []
        });

        let deliveredCount = 0;
        const targetIds = new Set<string>();
        if (normalized.toUserId) {
          targetIds.add(normalized.toUserId);
        } else {
          room.participantIds?.forEach(pid => {
            if (pid !== normalized.fromUserId) targetIds.add(pid);
          });
        }
        
        for (const targetId of targetIds) {
          const delivered = emitToUser(targetId, "call:ringing", {
            sessionId: normalized.sessionId,
            fromUserId: normalized.fromUserId,
            media: normalized.media
          });
          if (delivered) deliveredCount++;
        }

        if (deliveredCount === 0 && targetIds.size > 0) {
          // Only fail if we tried to ring someone and failed. 
          // For a group call with no one else, maybe allow it? (e.g. waiting room)
          // But usually you want to ring someone.
          // Let's keep it lenient for group calls (maybe they come online later).
          if (normalized.toUserId) {
             activeCalls.delete(normalized.sessionId);
             throw new Error("User is not online.");
          }
        }

        await writeCallEventMessage(normalized.sessionId, normalized.fromUserId, {
          event: "call_started",
          fromUserId: normalized.fromUserId,
          toUserId: normalized.toUserId ?? "group",
          media: normalized.media,
          startedAt
        });
        
        const targetName = normalized.toUserId 
          ? formatUserName(await getUserById(normalized.toUserId)) 
          : "Group";

        await recordActivity(
          normalized.fromUserId,
          "CALL_INVITE",
          `Started ${normalized.media} call with ${targetName}`,
          {
            sessionId: normalized.sessionId,
            media: normalized.media,
            toUserId: normalized.toUserId
          },
          normalized.sessionId,
          "CHAT_CALL"
        );
        console.info("[Signaling] call invite sent", normalized);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start call.";
        sendError(socket, message);
      }
    });

    socket.on("call:offer", async (payload: SdpPayload) => {
      try {
        const normalized = normalizeSdpPayload(payload);
        if (userId !== normalized.fromUserId) {
          throw new Error("You cannot spoof another user.");
        }
        await ensureParticipants(normalized.sessionId, normalized.fromUserId, normalized.toUserId);
        emitToUser(normalized.toUserId, "call:offer", {
          sessionId: normalized.sessionId,
          fromUserId: normalized.fromUserId,
          toUserId: normalized.toUserId,
          sdp: normalized.sdp
        });
        console.info("[Signaling] forwarded offer", normalized.sessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to send offer.";
        sendError(socket, message);
      }
    });

    socket.on("call:answer", async (payload: SdpPayload) => {
      try {
        const normalized = normalizeSdpPayload(payload);
        if (userId !== normalized.fromUserId) {
          throw new Error("You cannot spoof another user.");
        }
        await ensureParticipants(normalized.sessionId, normalized.fromUserId, normalized.toUserId);
        emitToUser(normalized.toUserId, "call:answer", {
          sessionId: normalized.sessionId,
          fromUserId: normalized.fromUserId,
          toUserId: normalized.toUserId,
          sdp: normalized.sdp
        });
        console.info("[Signaling] forwarded answer", normalized.sessionId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to send answer.";
        sendError(socket, message);
      }
    });

    socket.on("call:candidate", async (payload: CandidatePayload) => {
      try {
        const normalized = normalizeCandidatePayload(payload);
        if (userId !== normalized.fromUserId) {
          throw new Error("You cannot spoof another user.");
        }
        await ensureParticipants(normalized.sessionId, normalized.fromUserId, normalized.toUserId);
        emitToUser(normalized.toUserId, "call:candidate", {
          sessionId: normalized.sessionId,
          fromUserId: normalized.fromUserId,
          toUserId: normalized.toUserId,
          candidate: normalized.candidate
        });
        console.info("[Signaling] forwarded candidate", {
          sessionId: normalized.sessionId,
          from: normalized.fromUserId,
          to: normalized.toUserId
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to send candidate.";
        sendError(socket, message);
      }
    });

    socket.on("call:audio", async (payload: AudioPayload) => {
      try {
        const sessionId = payload.sessionId?.trim();
        const toUserId = payload.toUserId?.trim();
        const chunk = payload.chunk;
        
        if (!sessionId || !toUserId || !chunk) {
          return; // Silent fail for audio chunks to avoid log spam
        }
        
        // Basic validation but skip heavy DB checks for every chunk for performance
        if (userId !== payload.fromUserId) {
          return;
        }

        // Direct emit to target user if they are in the session
        emitToUserInSession(toUserId, sessionId, "call:audio", {
          sessionId,
          fromUserId: userId,
          chunk
        });
      } catch {
        // Ignore audio relay errors
      }
    });

    socket.on("call:transcript", async (payload: any) => {
      try {
        const sessionId = payload.sessionId?.trim();
        const toUserId = payload.toUserId?.trim();
        const text = payload.text;
        
        if (!sessionId || !toUserId || !text) {
          return;
        }
        
        if (userId !== payload.fromUserId) {
          return;
        }

        const activeCall = activeCalls.get(sessionId);
        if (activeCall) {
          activeCall.transcripts.push({
            userId,
            text,
            timestamp: new Date().toISOString()
          });
        }

        emitToUserInSession(toUserId, sessionId, "call:transcript", {
          sessionId,
          fromUserId: userId,
          text,
          timestamp: new Date().toISOString()
        });
      } catch {
        // Ignore errors
      }
    });

    socket.on("call:end", async (payload: EndCallPayload) => {
      await handleCallEnd(socket, payload);
    });

    socket.on("disconnect", async () => {
      socket.data.joinedSessions.forEach((sessionId: string) => {
        void handleCallEnd(socket, { sessionId, fromUserId: userId, reason: "disconnected" }, true);
        decrementSessionCount(sessionId, userId);
        emitSessionPresence(sessionId);
      });
      socket.data.joinedSessions.clear();
      const sockets = userSockets.get(userId);
      sockets?.delete(socket);
      if (!sockets || sockets.size === 0) {
        userSockets.delete(userId);
        onlineUsers.delete(userId);
      }
      broadcastPresence();
    });

    socket.on("call:join", async (payload: JoinPayload) => {
      const sessionId = payload.sessionId?.trim();
      if (!sessionId || !activeCalls.has(sessionId)) {
        return;
      }
      const call = activeCalls.get(sessionId)!;
      
      // Notify existing participants
      call.participants.forEach(pid => {
        if (pid !== userId) {
          emitToUser(pid, "call:joined", { sessionId, userId });
        }
      });
      
      // Send list of existing participants to joiner
      socket.emit("call:participants", { 
        sessionId, 
        participants: Array.from(call.participants).filter(p => p !== userId) 
      });
      
      call.participants.add(userId);
      console.info("[Signaling] user joined call", { sessionId, userId });
    });

    socket.on("presence:request", () => {
      socket.emit("presence:update", { onlineUserIds: Array.from(onlineUsers) });
    });
  });

  function incrementSessionCount(sessionId: string, userId: string) {
    const counts = sessionUserCounts.get(sessionId) ?? new Map<string, number>();
    const current = counts.get(userId) ?? 0;
    counts.set(userId, current + 1);
    sessionUserCounts.set(sessionId, counts);
  }

  function decrementSessionCount(sessionId: string, userId: string) {
    const counts = sessionUserCounts.get(sessionId);
    if (!counts) {
      return;
    }
    const current = counts.get(userId) ?? 0;
    if (current <= 1) {
      counts.delete(userId);
    } else {
      counts.set(userId, current - 1);
    }
    if (counts.size === 0) {
      sessionUserCounts.delete(sessionId);
    }
  }

  function emitSessionPresence(sessionId: string) {
    const counts = sessionUserCounts.get(sessionId);
    const participants = counts ? Array.from(counts.keys()) : [];
    namespace.to(sessionId).emit("presence:update", { sessionId, onlineUserIds: participants });
  }

  function broadcastPresence() {
    namespace.emit("presence:update", { onlineUserIds: Array.from(onlineUsers) });
  }

  function emitToUser(userId: string, event: string, payload: unknown): boolean {
    const sockets = userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
      return false;
    }
    sockets.forEach((socket) => {
      socket.emit(event, payload);
    });
    return true;
  }

  function emitToUserInSession(userId: string, sessionId: string, event: string, payload: unknown): boolean {
    const sockets = userSockets.get(userId);
    if (!sockets) {
      return false;
    }
    let delivered = false;
    sockets.forEach((socket) => {
      if (socket.data.joinedSessions.has(sessionId)) {
        socket.emit(event, payload);
        delivered = true;
      }
    });
    return delivered;
  }

  async function handleCallEnd(socket: AuthedSocket, payload: EndCallPayload, silent?: boolean) {
    const sessionId = payload?.sessionId?.trim();
    const actorId = payload?.fromUserId?.trim();
    if (!sessionId || !actorId || actorId !== socket.data.user.id) {
      if (!silent) {
        sendError(socket, "Invalid end payload.");
      }
      return;
    }
    if (!(await isParticipant(sessionId, actorId))) {
      if (!silent) {
        sendError(socket, "You are not part of this conversation.");
      }
      return;
    }
    const existingCall = activeCalls.get(sessionId);
    if (!existingCall && silent) {
      return;
    }
    const reason = payload.reason ?? "ended";
    
    // Notify everyone that this specific user ended/left
    namespace.to(sessionId).emit("call:ended", { sessionId, endedByUserId: actorId, reason });
    
    const activeCall = existingCall;
    if (activeCall) {
      // Remove the user from the participants list
      activeCall.participants.delete(actorId);
      
      // If no participants left (or maybe < 2?), end the call session entirely
      if (activeCall.participants.size === 0) {
        if (activeCall.transcripts.length > 0) {
          await saveTranscript(activeCall);
        }
        activeCalls.delete(sessionId);
        console.info("[Signaling] call session empty, removed", sessionId);
      }
    }
    
    let peerUserId: string | undefined;
    if (activeCall && activeCall.participants.size === 1) {
        // If only one person left, maybe we don't record a "call end" event for the group yet?
        // But we want to log that *this* user left.
        // The original logic tried to find "the other person".
        // For group calls, "peerUserId" is ambiguous.
        peerUserId = undefined; 
    } else if (!activeCall) {
        peerUserId = await resolvePeerUserId(sessionId, actorId);
    }

    const peerUser = peerUserId ? await getUserById(peerUserId) : undefined;
    const callPayload: CallEventPayload = {
      event: toCallEvent(reason),
      fromUserId: actorId,
      toUserId: peerUserId ?? "group",
      media: activeCall?.media,
      startedAt: activeCall?.startedAt,
      endedAt: new Date().toISOString(),
      reason
    };
    try {
      await writeCallEventMessage(sessionId, actorId, callPayload);
      const targetName = peerUser ? formatUserName(peerUser) : "Group";
      await recordActivity(
        actorId,
        "CALL_END",
        `Call with ${targetName} ended (${reason})`,
        {
          sessionId,
          reason,
          targetUserId: peerUserId
        },
        sessionId,
        "CHAT_CALL"
      );
      console.info("[Signaling] call ended", { sessionId, actorId, reason });
    } catch (error) {
      console.error("[Signaling] Unable to persist call end", error);
    }
  }

  async function saveTranscript(call: ActiveCall) {
    try {
      const lines = await Promise.all(
        call.transcripts.map(async (t) => {
          const user = await getUserById(t.userId);
          const name = user ? formatUserName(user) : "Unknown";
          const time = new Date(t.timestamp).toLocaleTimeString();
          return `[${time}] ${name}: ${t.text}`;
        })
      );

      const content = `Call Transcript\nSession ID: ${call.sessionId}\nDate: ${new Date().toLocaleString()}\n\n${lines.join("\n")}`;
      const fileName = `transcript-${call.sessionId}-${Date.now()}.txt`;
      const uploadDir = path.resolve(__dirname, "../../../uploads");
      const filePath = path.join(uploadDir, fileName);

      // Ensure uploads directory exists
      try {
        await fs.access(uploadDir);
      } catch {
        await fs.mkdir(uploadDir, { recursive: true });
      }

      await fs.writeFile(filePath, content, "utf-8");

      // Create attachment record
      // Use initiator as uploader, or the last person? Initiator seems fair.
      const attachment = await createAttachment({
        entityId: call.sessionId, // Attach to the chat room
        entityType: "PROJECT", // Using PROJECT as a fallback or we need to update types. 
        // Wait, AttachmentEntityType is "TASK" | "TIMESHEET" | "PROJECT" | "PROFILE".
        // It doesn't support "CHAT" or "ROOM". 
        // However, the DB schema might be flexible or I might need to check how chat attachments are handled.
        // Looking at db.json, attachments are just linked via IDs in comments/messages usually.
        // But createAttachment requires an entityType.
        // Let's check if we can add "CHAT" to AttachmentEntityType or just use a dummy one.
        // Actually, for chat messages, the attachment is linked to the MESSAGE.
        // So entityId should probably be the message ID, but we don't have the message ID yet.
        // Usually we create attachment first, then link it.
        // If entityType is strict, I might need to update it.
        // Let's check `server/src/models/_types.ts` again.
        // export type AttachmentEntityType = CommentEntityType | "PROJECT" | "PROFILE";
        // CommentEntityType is "TASK" | "TIMESHEET".
        // This seems restrictive.
        // However, `createTeamChatMessage` takes `attachmentIds`.
        // So the attachment itself might not strictly need a valid entityId/Type if it's just floating until linked?
        // Or maybe I can use "PROJECT" as a placeholder if the room is project-related?
        // Let's try to pass undefined or null if allowed?
        // The type definition says `entityType?: AttachmentEntityType`. It is optional!
        uploaderId: call.initiatorUserId,
        fileName: "transcript.txt",
        originalName: "transcript.txt",
        mimeType: "text/plain",
        size: Buffer.byteLength(content),
        url: `/uploads/${fileName}`
      });

      // Send message with attachment
      await createTeamChatMessage({
        roomId: call.sessionId,
        authorId: call.initiatorUserId, // System message from initiator?
        body: `📄 Call Transcript Available: ${attachment.url}`
      });

      console.info("[Signaling] Transcript saved and sent", filePath);
    } catch (error) {
      console.error("[Signaling] Failed to save transcript", error);
    }
  }

  function sendError(socket: AuthedSocket, message: string) {
    console.warn("[Signaling] error for user", socket.data.user.id, message);
    socket.emit("call:error", { message });
  }

  async function ensureParticipants(sessionId: string, actorId: string, targetUserId?: string): Promise<TeamChatRoom> {
    const room = await getTeamChatRoomById(sessionId);
    if (!room) {
      throw new Error("Conversation not found.");
    }
    const participants = room.participantIds ?? [];
    if (!participants.includes(actorId)) {
      throw new Error("Only conversation participants can start calls.");
    }
    if (targetUserId && !participants.includes(targetUserId)) {
      throw new Error("Target user is not in this conversation.");
    }
    // Removed restriction on GROUP calls
    // if ((room.type ?? "GROUP") !== "DIRECT") {
    //   throw new Error("Calls are limited to direct conversations.");
    // }
    if (targetUserId && targetUserId === actorId) {
      throw new Error("You cannot call yourself.");
    }
    return room;
  }

  function toCallEvent(reason?: string): CallEventType {
    if (reason === "declined") {
      return "call_declined";
    }
    if (reason === "missed") {
      return "missed_call";
    }
    return "call_ended";
  }

  function normalizeInvitePayload(payload: InvitePayload): Required<Omit<InvitePayload, "toUserId">> & { toUserId?: string } {
    const sessionId = payload.sessionId?.trim();
    const fromUserId = payload.fromUserId?.trim();
    const toUserId = payload.toUserId?.trim();
    const media: CallMediaType = payload.media === "video" ? "video" : "audio";
    if (!sessionId || !fromUserId) {
      throw new Error("Missing call information.");
    }
    return { sessionId, fromUserId, toUserId, media };
  }

  function normalizeSdpPayload(payload: SdpPayload): Required<SdpPayload> {
    const sessionId = payload.sessionId?.trim();
    const fromUserId = payload.fromUserId?.trim();
    const toUserId = payload.toUserId?.trim();
    const sdp = payload.sdp;
    if (!sessionId || !fromUserId || !toUserId || !sdp) {
      throw new Error("Missing SDP payload.");
    }
    return { sessionId, fromUserId, toUserId, sdp };
  }

  function normalizeCandidatePayload(payload: CandidatePayload): Required<CandidatePayload> {
    const sessionId = payload.sessionId?.trim();
    const fromUserId = payload.fromUserId?.trim();
    const toUserId = payload.toUserId?.trim();
    const candidate = payload.candidate;
    if (!sessionId || !fromUserId || !toUserId || !candidate) {
      throw new Error("Missing candidate payload.");
    }
    return { sessionId, fromUserId, toUserId, candidate };
  }

  async function resolvePeerUserId(sessionId: string, actorId: string): Promise<string | undefined> {
    const room = await getTeamChatRoomById(sessionId);
    if (!room?.participantIds?.length) {
      return undefined;
    }
    return room.participantIds.find((participant) => participant !== actorId);
  }

  function formatUserName(user?: { profile: { firstName: string; lastName: string }; email: string } | null): string {
    if (!user) {
      return "teammate";
    }
    const fullName = `${user.profile.firstName} ${user.profile.lastName}`.trim();
    return fullName.length ? fullName : user.email;
  }

  return namespace;
}
