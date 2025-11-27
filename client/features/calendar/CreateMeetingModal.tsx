"use client";

import { useEffect, useState } from "react";
import { User, MeetingType, UserDirectoryEntry } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { apiRequest } from "../../lib/apiClient";

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSuccess: () => void;
  initialStartTime?: Date | null;
  initialEndTime?: Date | null;
}

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

export function CreateMeetingModal({ isOpen, onClose, currentUser, onSuccess, initialStartTime, initialEndTime }: CreateMeetingModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [type, setType] = useState<MeetingType>("VIRTUAL");
  const [location, setLocation] = useState("Online");
  const [participants, setParticipants] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    apiRequest<{ users: UserDirectoryEntry[] }>("/users")
      .then((response) => setAvailableUsers(Array.isArray(response.users) ? response.users : []))
      .catch((error) => console.error("Failed to load users", error));

    const roundUpToHalfHour = (date: Date) => {
      const copy = new Date(date);
      copy.setMilliseconds(0);
      copy.setSeconds(0);
      const minutes = copy.getMinutes();
      const remainder = minutes % 30;
      if (remainder !== 0) {
        copy.setMinutes(minutes + (30 - remainder));
      }
      return copy;
    };

    const toValidDate = (value?: Date | null): Date | null => {
      if (!value) return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const defaultStart = roundUpToHalfHour(new Date());
    const startCandidate = toValidDate(initialStartTime) ?? defaultStart;
    const endCandidate = toValidDate(initialEndTime) ?? new Date(startCandidate.getTime() + 30 * 60000);
    const finalEnd = endCandidate.getTime() > startCandidate.getTime() ? endCandidate : new Date(startCandidate.getTime() + 30 * 60000);

    setStartTime(formatDateTimeLocal(startCandidate));
    setEndTime(formatDateTimeLocal(finalEnd));
    setType("VIRTUAL");
    setLocation("Online");
    setSuggestions([]);
  }, [initialEndTime, initialStartTime, isOpen]);

  const handleSuggestTimes = async () => {
    setSuggesting(true);
    setSuggestions([]);
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const duration = (end.getTime() - start.getTime()) / 60000;

      const res = await apiRequest<{ suggestions: string[] }>("/meetings/suggest-times", {
        method: "POST",
        body: JSON.stringify({
          participantIds: participants,
          durationMinutes: duration > 0 ? duration : 30
        })
      });
      setSuggestions(res.suggestions);
    } catch (error) {
      console.error("Failed to suggest times", error);
    } finally {
      setSuggesting(false);
    }
  };

  const applySuggestion = (isoString: string) => {
    const start = new Date(isoString);
    const currentStart = new Date(startTime);
    const currentEnd = new Date(endTime);
    const duration = currentEnd.getTime() - currentStart.getTime();

    const end = new Date(start.getTime() + (duration > 0 ? duration : 30 * 60000));
    setStartTime(formatDateTimeLocal(start));
    setEndTime(formatDateTimeLocal(end));
    setSuggestions([]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await apiRequest("/meetings", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          organizerId: currentUser.id,
          participantIds: participants,
          type,
          location: type === "VIRTUAL" ? location || "Online" : location || undefined
        })
      });
      onSuccess();
      setTitle("");
      setDescription("");
      setParticipants([]);
      setLocation("Online");
      setSuggestions([]);
    } catch (error) {
      console.error("Failed to create meeting", error);
      alert("Failed to create meeting");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-xl font-bold text-ink-900">Schedule Meeting</h2>
        <p className="mb-3 text-xs text-ink-500">A video-ready chat room is auto-created and shared with invitees.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              placeholder="Project Sync"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700">Start</label>
              <input
                type="datetime-local"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700">End</label>
              <input
                type="datetime-local"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-ink-700">AI Scheduling</label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSuggestTimes}
                disabled={suggesting}
                className="text-xs"
              >
                {suggesting ? "Finding slots..." : "Suggest Best Times"}
              </Button>
            </div>

            {suggestions.length > 0 && (
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
                <p className="mb-2 text-xs font-medium text-brand-700">Suggested slots (based on availability):</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((iso) => (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => applySuggestion(iso)}
                      className="rounded border border-brand-200 bg-white px-2 py-1 text-xs text-brand-600 transition-colors hover:bg-brand-100"
                    >
                      {new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      {" "}
                      {new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MeetingType)}
                className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="VIRTUAL">Virtual (video)</option>
                <option value="PHYSICAL">In person</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={type === "VIRTUAL" ? "Online" : "Conference room"}
                className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700">Participants</label>
            <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-ink-200 p-2">
              {availableUsers.length === 0 ? (
                <div className="text-sm italic text-ink-400">Loading users...</div>
              ) : (
                availableUsers
                  .filter((user) => user.id !== currentUser.id)
                  .map((user) => {
                    const name = user.name?.trim() || user.email;
                    return (
                      <label
                        key={user.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-ink-50"
                      >
                        <input
                          type="checkbox"
                          checked={participants.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setParticipants([...participants, user.id]);
                            } else {
                              setParticipants(participants.filter((id) => id !== user.id));
                            }
                          }}
                          className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm text-ink-700">{name}</span>
                      </label>
                    );
                  })
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Scheduling..." : "Schedule"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
