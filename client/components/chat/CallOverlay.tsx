"use client";

import { useEffect, useState } from "react";
import { useCallContext } from "../../features/chat/call/CallContext";
import { InCallPanel } from "./InCallPanel";
import { IncomingCallModal } from "./IncomingCallModal";
import { apiRequest } from "../../lib/apiClient";
import { UserDirectoryEntry } from "../../lib/types";
import { sendTeamChatMessage } from "../../lib/teamChat";
import { useCurrentUser } from "../../hooks/useCurrentUser";

export function CallOverlay() {
  const { user } = useCurrentUser();
  const {
    callState,
    currentCall,
    incomingCall,
    acceptCall,
    declineCall,
    localStream,
    remoteStreams,
    isMuted,
    isVideoEnabled,
    callTimerMs,
    remoteAudioReady,
    remoteAudioLevel,
    remoteAudioError,
    resumeRemoteAudio,
    toggleMute,
    toggleVideo,
    endCall,
    sendTranscript,
    remoteTranscripts
  } = useCallContext();

  const [peerUser, setPeerUser] = useState<{ name: string; title?: string } | undefined>(undefined);
  const [callerUser, setCallerUser] = useState<{ name: string; title?: string } | undefined>(undefined);
  const [participantDetails, setParticipantDetails] = useState<Map<string, { name: string; title?: string }>>(new Map());

  useEffect(() => {
    // If it's a group call, we might not have a single peerUserId
    // But if it's 1:1 (which we can infer if remoteStreams has 1 entry or currentCall.isGroup is false)
    // we can try to fetch user details.
    // For now, if currentCall.isGroup is true, we can set peerUser to "Group Call" or similar.
    
    if (currentCall?.isGroup) {
        setPeerUser({ name: "Group Call" });
        // We still want to fetch participant details for the grid view
    }

    const peerIds = Array.from(remoteStreams.keys());
    if (peerIds.length === 0) {
        setParticipantDetails(new Map());
        if (!currentCall?.isGroup) setPeerUser(undefined);
        return;
    }

    apiRequest<{ users: UserDirectoryEntry[] }>("/users")
      .then((response) => {
        const newDetails = new Map();
        peerIds.forEach(peerId => {
            const user = response.users.find((u) => u.id === peerId);
            if (user) {
                newDetails.set(peerId, { name: user.name, title: user.role });
            }
        });
        setParticipantDetails(newDetails);

        // Update peerUser for 1:1 calls if not already set by group logic
        if (!currentCall?.isGroup) {
            if (peerIds.length === 1) {
                const peerId = peerIds[0];
                const details = newDetails.get(peerId);
                if (details) {
                    setPeerUser(details);
                }
            } else if (peerIds.length > 1) {
                setPeerUser({ name: `${peerIds.length} Participants` });
            } else {
                setPeerUser(undefined);
            }
        }
      })
      .catch((err) => console.error("Failed to load participant details", err));
  }, [currentCall, remoteStreams]);

  useEffect(() => {
    if (incomingCall?.fromUserId) {
      apiRequest<{ users: UserDirectoryEntry[] }>("/users")
        .then((response) => {
          const user = response.users.find((u) => u.id === incomingCall.fromUserId);
          if (user) {
            setCallerUser({ name: user.name, title: user.role });
          }
        })
        .catch((err) => console.error("Failed to load caller details", err));
    } else {
      setCallerUser(undefined);
    }
  }, [incomingCall?.fromUserId]);

  const handleTranscriptComplete = (transcript: string) => {
    if (!currentCall?.sessionId) return;

    const formattedMessage = `📝 **Call Transcription**\n\n${transcript}`;
    
    // Try sending to Team Chat first (most likely scenario for calls)
    sendTeamChatMessage(currentCall.sessionId, formattedMessage)
      .catch((err) => {
        console.warn("Failed to save transcript to Team Chat, trying AI Chat...", err);
        // Fallback to AI Chat if Team Chat fails (e.g. if sessionId is actually a ChatSessionId)
        return apiRequest("/chat/message", {
          method: "POST",
          body: JSON.stringify({
            message: formattedMessage,
            sessionId: currentCall.sessionId
          })
        });
      })
      .catch(err => console.error("Failed to save transcript", err));
  };

  if (incomingCall) {
    return (
      <IncomingCallModal
        caller={callerUser}
        media={incomingCall.media}
        onAccept={() => void acceptCall()}
        onDecline={() => declineCall("declined")}
      />
    );
  }

  if (!["OUTGOING", "RINGING", "IN_CALL"].includes(callState) || !currentCall) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-md overflow-hidden rounded-2xl bg-ink-900 shadow-2xl ring-1 ring-white/10 transition-all duration-300 ease-in-out">
      <div className="p-4">
        <InCallPanel
          callState={callState}
          peerUser={peerUser}
          participantDetails={participantDetails}
          media={currentCall.media}
          localStream={localStream}
          remoteStreams={remoteStreams}
          isMuted={isMuted}
          isVideoEnabled={isVideoEnabled}
          callTimerMs={callTimerMs}
          remoteAudioReady={remoteAudioReady}
          remoteAudioLevel={remoteAudioLevel}
          remoteAudioError={remoteAudioError}
          onResumeRemoteAudio={resumeRemoteAudio}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          onEnd={() => endCall("ended")}
          onTranscriptComplete={handleTranscriptComplete}
          currentUserName={user ? `${user.profile.firstName} ${user.profile.lastName}` : undefined}
        />
      </div>
    </div>
  );
}
