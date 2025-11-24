import {
  createMeeting,
  deleteMeeting,
  getMeetingById,
  listMeetings,
  updateMeeting,
  createTeamChatRoom,
  sendNotifications
} from "../data/repositories";
import { Meeting, PublicUser } from "../models/_types";
import { NewMeetingInput, UpdateMeetingInput } from "../data/repositories";
import { HttpError } from "../middleware/httpError";
import { getUserCalendar } from "./calendar.service";
import { DateTime } from "luxon";

export async function createMeetingService(actor: PublicUser, input: NewMeetingInput): Promise<Meeting> {
  // 1. Create Chat Room
  const roomName = `Meeting: ${input.title}`;
  // Ensure organizer is in participants
  const participantIds = [...input.participantIds];
  if (!participantIds.includes(actor.id)) {
    participantIds.push(actor.id);
  }
  const uniqueParticipants = Array.from(new Set(participantIds));
  
  const chatRoom = await createTeamChatRoom({
    name: roomName,
    description: input.description,
    topic: `Chat for meeting: ${input.title}`,
    createdById: actor.id,
    type: "GROUP",
    participantIds: uniqueParticipants
  });

  // 2. Create Meeting
  const meeting = await createMeeting({
    ...input,
    linkedChatRoomId: chatRoom.id,
    organizerId: actor.id,
    participantIds: uniqueParticipants
  });

  // 3. Notify Participants
  const recipients = uniqueParticipants.filter(id => id !== actor.id);
  if (recipients.length > 0) {
    await sendNotifications(
      recipients,
      `You have been invited to a meeting: ${meeting.title}`,
      "MEETING_INVITE",
      { meetingId: meeting.id, roomId: chatRoom.id }
    );
  }

  return meeting;
}

export async function listMeetingsService(actor: PublicUser, filters: { startDate?: string; endDate?: string; projectId?: string }): Promise<Meeting[]> {
  return listMeetings({
    userId: actor.id,
    ...filters
  });
}

export async function getMeetingService(actor: PublicUser, id: string): Promise<Meeting> {
  const meeting = await getMeetingById(id);
  if (!meeting) {
    throw new HttpError(404, "Meeting not found.");
  }
  if (meeting.organizerId !== actor.id && !meeting.participantIds.includes(actor.id)) {
    throw new HttpError(403, "You do not have access to this meeting.");
  }
  return meeting;
}

export async function updateMeetingService(actor: PublicUser, id: string, update: UpdateMeetingInput): Promise<Meeting> {
  const meeting = await getMeetingById(id);
  if (!meeting) {
    throw new HttpError(404, "Meeting not found.");
  }
  if (meeting.organizerId !== actor.id) {
    throw new HttpError(403, "Only the organizer can update the meeting.");
  }

  const updated = await updateMeeting(id, update);
  
  // Notify participants of update
  const recipients = updated.participantIds.filter(pid => pid !== actor.id);
  if (recipients.length > 0) {
     await sendNotifications(
      recipients,
      `Meeting updated: ${updated.title}`,
      "MEETING_UPDATE",
      { meetingId: updated.id }
    );
  }

  return updated;
}

export async function deleteMeetingService(actor: PublicUser, id: string): Promise<void> {
  const meeting = await getMeetingById(id);
  if (!meeting) {
    throw new HttpError(404, "Meeting not found.");
  }
  if (meeting.organizerId !== actor.id) {
    throw new HttpError(403, "Only the organizer can cancel the meeting.");
  }

  await deleteMeeting(id);
  
  // Notify participants
  const recipients = meeting.participantIds.filter(pid => pid !== actor.id);
  if (recipients.length > 0) {
     await sendNotifications(
      recipients,
      `Meeting cancelled: ${meeting.title}`,
      "MEETING_CANCEL",
      { meetingId: meeting.id }
    );
  }
}

export async function suggestMeetingTimesService(
  actor: PublicUser,
  participantIds: string[],
  durationMinutes: number = 30
): Promise<string[]> {
  // 1. Define search window (next 5 days)
  const start = DateTime.now().plus({ minutes: 30 }).startOf('hour'); // Start soon
  const end = start.plus({ days: 5 });
  const workStartHour = 9;
  const workEndHour = 17;

  // 2. Get calendars for all participants
  const allUserIds = Array.from(new Set([...participantIds, actor.id]));
  // We use a try-catch inside map to handle permissions gracefully (treat as free if unknown)
  const calendars = await Promise.all(
    allUserIds.map(id => getUserCalendar(actor, id).catch(() => null))
  );

  // 3. Flatten busy times
  const busySlots: { start: DateTime; end: DateTime }[] = [];
  for (const cal of calendars) {
    if (!cal) continue;
    for (const event of cal.events) {
      // Consider all events as busy for now
      busySlots.push({
        start: DateTime.fromISO(event.startDate),
        end: DateTime.fromISO(event.endDate)
      });
    }
  }

  // 4. Find free slots
  const suggestions: string[] = [];
  let current = start;

  while (current < end && suggestions.length < 5) {
    // Skip weekends
    if (current.weekday > 5) {
      current = current.plus({ days: 1 }).startOf('day').set({ hour: workStartHour });
      continue;
    }

    // Skip non-work hours
    if (current.hour < workStartHour) {
      current = current.set({ hour: workStartHour });
      continue;
    }
    if (current.hour >= workEndHour) {
      current = current.plus({ days: 1 }).startOf('day').set({ hour: workStartHour });
      continue;
    }

    const slotEnd = current.plus({ minutes: durationMinutes });
    
    // Check overlap
    const isBusy = busySlots.some(slot => 
      (current >= slot.start && current < slot.end) ||
      (slotEnd > slot.start && slotEnd <= slot.end) ||
      (current <= slot.start && slotEnd >= slot.end)
    );

    if (!isBusy) {
      suggestions.push(current.toISO()!);
      // Jump forward to give options spread out
      current = current.plus({ minutes: 60 }); 
    } else {
      current = current.plus({ minutes: 30 });
    }
  }

  return suggestions;
}
