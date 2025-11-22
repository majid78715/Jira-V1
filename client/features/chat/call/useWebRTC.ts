"use client";

import { useCallback, useRef, useState } from "react";

type InitPeerOptions = {
  isVideo: boolean;
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  onRemoteStream?: (stream: MediaStream) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onNegotiationNeeded?: () => void;
  onPeerLog?: (message: string, details?: unknown) => void;
};

const DEFAULT_LOG = (message: string, details?: unknown) => {
  if (details) {
    console.info(message, details);
  } else {
    console.info(message);
  }
};

export function useWebRTC() {
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStreamState] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const peerLogRef = useRef<(message: string, details?: unknown) => void>(DEFAULT_LOG);

  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const initPeer = useCallback(
    (peerId: string, {
      iceServers,
      iceTransportPolicy = "all",
      onRemoteStream,
      onIceCandidate,
      onConnectionStateChange,
      onNegotiationNeeded,
      onPeerLog
    }: InitPeerOptions) => {
      if (peersRef.current.has(peerId)) {
        peersRef.current.get(peerId)?.close();
      }

      peerLogRef.current = onPeerLog ?? DEFAULT_LOG;
      const peer = new RTCPeerConnection({ iceServers, iceTransportPolicy });
      peersRef.current.set(peerId, peer);

      peer.onnegotiationneeded = () => {
        peerLogRef.current(`[WebRTC:${peerId}] negotiation needed`);
        onNegotiationNeeded?.();
      };

      peer.onicecandidate = (event) => {
        if (event.candidate && onIceCandidate) {
          const payload =
            typeof event.candidate.toJSON === "function"
              ? event.candidate.toJSON()
              : {
                  candidate: event.candidate.candidate,
                  sdpMid: event.candidate.sdpMid ?? undefined,
                  sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined
                };
          onIceCandidate(payload);
        }
      };

      peer.ontrack = (event) => {
        peerLogRef.current(`[WebRTC:${peerId}] ontrack fired`, {
          trackId: event.track.id,
          kind: event.track.kind
        });
        
        let stream = event.streams?.[0];
        if (!stream) {
          stream = new MediaStream();
          stream.addTrack(event.track);
        }
        
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.set(peerId, stream!);
          return next;
        });
        
        onRemoteStream?.(stream);
      };

      peer.onconnectionstatechange = () => {
        peerLogRef.current(`[WebRTC:${peerId}] connection state`, peer.connectionState);
        onConnectionStateChange?.(peer.connectionState);
      };

      const currentLocalStream = localStreamRef.current;
      if (currentLocalStream) {
        currentLocalStream.getTracks().forEach((track) => {
          peer.addTrack(track, currentLocalStream);
        });
      }

      return peer;
    },
    []
  );

  const getLocalStream = useCallback(async (constraints: { audio: boolean; video?: boolean }) => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error("Media devices are not available in this browser.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: constraints.audio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        : false,
      video: constraints.video
        ? {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          }
        : false
    });
    localStreamRef.current = stream;
    setLocalStreamState(stream);
    
    // Add new tracks to existing peers
    peersRef.current.forEach((peer) => {
      stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
      });
    });

    return stream;
  }, []);

  const setLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    setLocalStreamState(stream);
  }, []);

  const createOffer = useCallback(async (peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not initialized.`);
    }
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    return offer;
  }, []);

  const createAnswer = useCallback(async (peerId: string, remoteOfferSdp: string) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not initialized.`);
    }
    await peer.setRemoteDescription({ type: "offer", sdp: remoteOfferSdp });
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    return answer;
  }, []);

  const setRemoteDescription = useCallback(async (peerId: string, description: RTCSessionDescriptionInit) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) {
      throw new Error(`Peer ${peerId} not initialized.`);
    }
    await peer.setRemoteDescription(description);
  }, []);

  const addIceCandidate = useCallback(async (peerId: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(peerId);
    if (!peer) {
      return "no-peer";
    }
    if (!peer.remoteDescription) {
      return "no-remote-description";
    }
    try {
      await peer.addIceCandidate(candidate);
      return "added";
    } catch (error) {
      console.error("Unable to add ICE candidate", error);
      return "error";
    }
  }, []);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return false;
    }
    let allMuted = true;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
      if (track.enabled) {
        allMuted = false;
      }
    });
    return allMuted;
  }, []);

  const toggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) {
      return false;
    }
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
      let anyEnabled = false;
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
        if (track.enabled) {
          anyEnabled = true;
        }
      });
      return anyEnabled;
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        }
      });
      const newTrack = videoStream.getVideoTracks()[0];
      if (!newTrack) {
        return false;
      }

      stream.addTrack(newTrack);
      peersRef.current.forEach(peer => {
        peer.addTrack(newTrack, stream);
      });

      setLocalStreamState(stream);
      return true;
    } catch (err) {
      return false;
    }
  }, []);

  const end = useCallback((peerId?: string) => {
    if (peerId) {
      peersRef.current.get(peerId)?.close();
      peersRef.current.delete(peerId);
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    } else {
      peersRef.current.forEach((peer) => peer.close());
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStreamState(null);
      setRemoteStreams(new Map());
    }
  }, []);

  const hasRemoteDescription = useCallback((peerId: string) => {
    return Boolean(peersRef.current.get(peerId)?.remoteDescription);
  }, []);

  return {
    initPeer,
    getLocalStream,
    setLocalStream,
    createOffer,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
    hasRemoteDescription,
    toggleMute,
    toggleVideo,
    end,
    localStream,
    remoteStreams
  };
}
