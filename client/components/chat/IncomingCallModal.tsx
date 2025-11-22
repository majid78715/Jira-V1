"use client";

import { useEffect, useRef } from "react";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";

type MediaType = "audio" | "video";

interface IncomingCallModalProps {
  caller?: {
    id?: string;
    name?: string;
    title?: string;
  };
  media: MediaType;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallModal({ caller, media, onAccept, onDecline }: IncomingCallModalProps) {
  const acceptRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    acceptRef.current?.focus({ preventScroll: true });
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onAccept();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onDecline();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onAccept, onDecline]);

  const headline = `${caller?.name ?? "Teammate"} is calling`;
  const mediaLabel = media === "video" ? "Video call" : "Audio call";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl focus-within:ring-2 focus-within:ring-brand-300">
        <div className="flex items-center gap-4">
          <Avatar name={caller?.name ?? "Incoming caller"} size={48} status="online" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">{headline}</p>
            <p className="text-xs text-ink-500">{caller?.title ?? mediaLabel}</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-ink-500">
          {media === "video"
            ? "Join the video call or decline if you're unavailable."
            : "Pick up to start an audio call or decline if now isn't a good time."}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            ref={acceptRef}
            type="button"
            className="flex-1"
            onClick={onAccept}
            aria-label="Accept call"
          >
            Accept
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 border-red-100 text-red-600 hover:bg-red-50"
            onClick={onDecline}
            aria-label="Decline call"
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
