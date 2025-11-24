"use client";

import type { ReactNode } from "react";
import { CalendarRange, Clock3, MapPin, Video, X } from "lucide-react";
import { CalendarEvent, User } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { useCallContext } from "../chat/call/CallContext";

interface MeetingDetailsPanelProps {
  event: CalendarEvent | null;
  onClose: () => void;
  currentUser: User;
}

export function MeetingDetailsPanel({ event, onClose, currentUser: _currentUser }: MeetingDetailsPanelProps) {
  const { startCall } = useCallContext();

  if (!event) return null;

  const isMeeting = event.type === "MEETING";
  const canJoin = isMeeting && Boolean(event.linkedChatRoomId);
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const timeLabel = event.allDay
    ? "All day"
    : `${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      })}`;

  const handleJoin = async () => {
    if (event.linkedChatRoomId) {
      await startCall({
        sessionId: event.linkedChatRoomId,
        video: true
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 overflow-y-auto border-l border-ink-200 bg-white p-6 shadow-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-ink-900">Event Details</h2>
        <button onClick={onClose} className="text-ink-400 transition hover:text-ink-700">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{event.type}</p>
          <h3 className="text-2xl font-bold text-ink-900">{event.title}</h3>
          {event.subtitle ? <p className="text-sm text-ink-500">{event.subtitle}</p> : null}
        </div>

        {canJoin ? (
          <Button className="flex w-full items-center justify-center gap-2" onClick={handleJoin}>
            <Video className="h-4 w-4" />
            Join video call
          </Button>
        ) : null}

        <div className="space-y-4">
          <InfoRow icon={<CalendarRange className="h-5 w-5 text-ink-400" />} label={dateLabel} subLabel={timeLabel} />
          <InfoRow icon={<MapPin className="h-5 w-5 text-ink-400" />} label={event.location || "No location provided"} />
          {event.description ? (
            <InfoRow icon={<Clock3 className="h-5 w-5 text-ink-400" />} label="Details" subLabel={event.description} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, subLabel }: { icon: ReactNode; label: string; subLabel?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-25">{icon}</div>
      <div className="space-y-0.5">
        <div className="text-sm font-semibold text-ink-900">{label}</div>
        {subLabel ? <div className="text-sm text-ink-500 whitespace-pre-wrap">{subLabel}</div> : null}
      </div>
    </div>
  );
}
