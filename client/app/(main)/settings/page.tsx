"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Tabs } from "../../../components/ui/Tabs";
import { Badge } from "../../../components/ui/Badge";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { apiRequest, ApiError } from "../../../lib/apiClient";
import { UserPreferences, WorkScheduleSlot } from "../../../lib/types";

const dayOptions = [
  { day: 0, label: "Sunday" },
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" }
];

type ScheduleState = Record<
  number,
  {
    enabled: boolean;
    start: string;
    end: string;
  }
>;

type StatusMessage = { tone: "success" | "error"; message: string };

type PreferencesFormState = {
  notificationPreferences: UserPreferences["notificationPreferences"];
  workflowPreferences: UserPreferences["workflowPreferences"];
  availabilityPreferences: UserPreferences["availabilityPreferences"];
};

const createDefaultScheduleState = (): ScheduleState =>
  dayOptions.reduce<ScheduleState>((acc, option) => {
    acc[option.day] = { enabled: false, start: "09:00", end: "17:00" };
    return acc;
  }, {} as ScheduleState);

const createDefaultPreferencesState = (): PreferencesFormState => ({
  notificationPreferences: {
    dailyDigestEmail: true,
    taskAssignmentEmail: true,
    commentMentionEmail: true,
    timesheetReminderEmail: true,
    alertEscalationsEmail: true
  },
  workflowPreferences: {
    autoSubscribeOnAssignment: true,
    autoShareStatusWithTeam: true,
    autoCaptureFocusBlocks: false
  },
  availabilityPreferences: {
    meetingHoursStart: "09:00",
    meetingHoursEnd: "17:00",
    shareCalendarWithTeam: true,
    protectFocusTime: false
  }
});

export default function SettingsPage() {
  const { user, loading, refresh } = useCurrentUser({ redirectTo: "/login" });
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    country: "",
    city: "",
    timeZone: "",
    title: ""
  });
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleState, setScheduleState] = useState<ScheduleState>(() => createDefaultScheduleState());
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleTimeZone, setScheduleTimeZone] = useState<string>("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: ""
  });
  const [passwordStatus, setPasswordStatus] = useState<StatusMessage | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [preferencesForm, setPreferencesForm] = useState<PreferencesFormState>(() => createDefaultPreferencesState());
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<StatusMessage | null>(null);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [availabilityPrefStatus, setAvailabilityPrefStatus] = useState<StatusMessage | null>(null);
  const [availabilityPrefSaving, setAvailabilityPrefSaving] = useState(false);

  const userId = user?.id;

  const syncPreferences = useCallback((preferences: UserPreferences) => {
    setPreferencesForm({
      notificationPreferences: { ...preferences.notificationPreferences },
      workflowPreferences: { ...preferences.workflowPreferences },
      availabilityPreferences: { ...preferences.availabilityPreferences }
    });
  }, []);

  const loadPreferences = useCallback(async () => {
    if (!userId) {
      return;
    }
    setPreferencesLoading(true);
    setPreferencesError(null);
    try {
      const response = await apiRequest<{ preferences: UserPreferences }>(`/users/${userId}/preferences`);
      syncPreferences(response.preferences);
    } catch (error) {
      const apiError = error as ApiError;
      setPreferencesError(apiError?.message ?? "Unable to load preferences.");
    } finally {
      setPreferencesLoading(false);
    }
  }, [userId, syncPreferences]);

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.profile.firstName,
      lastName: user.profile.lastName,
      country: user.profile.country ?? "",
      city: user.profile.city ?? "",
      timeZone: user.profile.timeZone ?? "",
      title: user.profile.title
    });
    setScheduleTimeZone(user.profile.timeZone ?? "");
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadSchedule = async () => {
      try {
        const response = await apiRequest<{ schedule: { timeZone: string; slots: WorkScheduleSlot[] } }>(
          `/schedule/${user.id}`
        );
        setScheduleTimeZone(response.schedule.timeZone);
        const nextState = createDefaultScheduleState();
        response.schedule.slots.forEach((slot) => {
          nextState[slot.day] = { enabled: true, start: slot.start, end: slot.end };
        });
        setScheduleState(nextState);
      } catch (error) {
        const apiError = error as ApiError;
        setScheduleStatus(apiError?.message ?? "Unable to load schedule.");
      }
    };
    void loadSchedule();
  }, [user]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    void loadPreferences();
  }, [userId, loadPreferences]);

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      if (canBypassProfileApproval) {
        await apiRequest<{ user: unknown }>("/users/me/profile", {
          method: "POST",
          body: JSON.stringify({ profile: form })
        });
        setStatus("Profile updated.");
        await refresh();
      } else {
        await apiRequest<{ request: unknown }>("/profile-change-requests", {
          method: "POST",
          body: JSON.stringify({ profile: form })
        });
        setStatus("Profile change request submitted.");
      }
    } catch (error) {
      const apiError = error as ApiError;
      setStatus(apiError?.message ?? "Unable to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordChange = (field: keyof typeof passwordForm, value: string) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setPasswordSaving(true);
    setPasswordStatus(null);
    try {
      await apiRequest<{ user: unknown }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(passwordForm)
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
      setPasswordStatus({ tone: "success", message: "Password updated." });
    } catch (error) {
      const apiError = error as ApiError;
      setPasswordStatus({
        tone: "error",
        message: apiError?.message ?? "Unable to update password."
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleNotificationToggle = (
    field: keyof PreferencesFormState["notificationPreferences"],
    value: boolean
  ) => {
    setPreferencesForm((prev) => ({
      ...prev,
      notificationPreferences: {
        ...prev.notificationPreferences,
        [field]: value
      }
    }));
  };

  const handleWorkflowToggle = (field: keyof PreferencesFormState["workflowPreferences"], value: boolean) => {
    setPreferencesForm((prev) => ({
      ...prev,
      workflowPreferences: {
        ...prev.workflowPreferences,
        [field]: value
      }
    }));
  };

  const handleAvailabilityPreferenceChange = (
    field: keyof PreferencesFormState["availabilityPreferences"],
    value: string | boolean
  ) => {
    setPreferencesForm((prev) => ({
      ...prev,
      availabilityPreferences: {
        ...prev.availabilityPreferences,
        [field]: value
      }
    }));
  };

  const handleNotificationsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setNotificationSaving(true);
    setNotificationStatus(null);
    try {
      const response = await apiRequest<{ preferences: UserPreferences }>(`/users/${user.id}/preferences`, {
        method: "POST",
        body: JSON.stringify({
          notificationPreferences: preferencesForm.notificationPreferences,
          workflowPreferences: preferencesForm.workflowPreferences
        })
      });
      syncPreferences(response.preferences);
      setNotificationStatus({ tone: "success", message: "Notification preferences updated." });
    } catch (error) {
      const apiError = error as ApiError;
      setNotificationStatus({
        tone: "error",
        message: apiError?.message ?? "Unable to update notification preferences."
      });
    } finally {
      setNotificationSaving(false);
    }
  };

  const handleAvailabilityPreferencesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setAvailabilityPrefSaving(true);
    setAvailabilityPrefStatus(null);
    try {
      const response = await apiRequest<{ preferences: UserPreferences }>(`/users/${user.id}/preferences`, {
        method: "POST",
        body: JSON.stringify({
          availabilityPreferences: preferencesForm.availabilityPreferences
        })
      });
      syncPreferences(response.preferences);
      setAvailabilityPrefStatus({ tone: "success", message: "Availability preferences updated." });
    } catch (error) {
      const apiError = error as ApiError;
      setAvailabilityPrefStatus({
        tone: "error",
        message: apiError?.message ?? "Unable to update availability preferences."
      });
    } finally {
      setAvailabilityPrefSaving(false);
    }
  };

  const handleScheduleToggle = (day: number, enabled: boolean) => {
    setScheduleState((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        enabled
      }
    }));
  };

  const handleScheduleTimeChange = (day: number, field: "start" | "end", value: string) => {
    setScheduleState((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }));
  };

  const handleScheduleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setScheduleSaving(true);
    setScheduleStatus(null);
    try {
      const slots: WorkScheduleSlot[] = Object.entries(scheduleState)
        .filter(([, config]) => config.enabled && config.start && config.end)
        .map(([day, config]) => ({ day: Number(day), start: config.start, end: config.end }));
      await apiRequest(`/schedule/${user.id}`, {
        method: "POST",
        body: JSON.stringify({ slots })
      });
      setScheduleStatus("Schedule updated.");
    } catch (error) {
      const apiError = error as ApiError;
      setScheduleStatus(apiError?.message ?? "Unable to save schedule.");
    } finally {
      setScheduleSaving(false);
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading profile...</div>;
  }

  const profileStatusTone = user.profileStatus === "ACTIVE" ? "success" : user.profileStatus === "PENDING_APPROVAL" ? "warning" : "neutral";
  const canBypassProfileApproval = ["SUPER_ADMIN", "PM", "VP"].includes(user.role);

  const renderPreferencesError = (
    <Card title="Preferences unavailable" helperText="Live settings could not be loaded.">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-rose-600">{preferencesError}</p>
        <div>
          <Button type="button" onClick={() => void loadPreferences()}>
            Retry
          </Button>
        </div>
      </div>
    </Card>
  );

  const accountTab = (
    <div className="space-y-6">
      <Card title="Profile overview" helperText="Synced with your company directory">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Name</p>
            <p className="text-sm font-medium text-ink-900">
              {user.profile.firstName} {user.profile.lastName}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Title</p>
            <p className="text-sm text-ink-900">{user.profile.title}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Email</p>
            <p className="text-sm text-ink-900">{user.email}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Location</p>
            <p className="text-sm text-ink-900">
              {user.profile.city}, {user.profile.country}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Time zone</p>
            <p className="text-sm text-ink-900">{user.profile.timeZone}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Badge label={user.role.replace(/_/g, " ")} />
          <Badge label={`Status: ${user.profileStatus}`} tone={profileStatusTone} />
        </div>
      </Card>
      <Card
        title="Edit profile"
        helperText={canBypassProfileApproval ? "Updates apply immediately" : "Changes route to your PM for approval"}
      >
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink-700">First name</label>
              <Input value={form.firstName} onChange={(e) => handleChange("firstName", e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Last name</label>
              <Input value={form.lastName} onChange={(e) => handleChange("lastName", e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink-700">Country (ISO-2)</label>
              <Input value={form.country} onChange={(e) => handleChange("country", e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink-700">City</label>
              <Input value={form.city} onChange={(e) => handleChange("city", e.target.value)} required />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Time zone</label>
              <Input value={form.timeZone} onChange={(e) => handleChange("timeZone", e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-700">Title</label>
            <Input value={form.title} onChange={(e) => handleChange("title", e.target.value)} required />
          </div>
          {status && <p className="text-sm text-ink-500">{status}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving..."
              : canBypassProfileApproval
                ? "Save profile"
                : "Submit change request"}
          </Button>
        </form>
      </Card>
      <Card title="Password & security" helperText="Applies immediately to new sessions">
        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-ink-700">Current password</label>
              <Input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => handlePasswordChange("currentPassword", e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">New password</label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => handlePasswordChange("newPassword", e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-700">Confirm password</label>
              <Input
                type="password"
                value={passwordForm.confirmNewPassword}
                onChange={(e) => handlePasswordChange("confirmNewPassword", e.target.value)}
                required
              />
            </div>
          </div>
          {passwordStatus && (
            <p className={`text-sm ${passwordStatus.tone === "success" ? "text-emerald-600" : "text-rose-600"}`}>
              {passwordStatus.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? "Saving..." : "Update password"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );

  const notificationsTab = (
    <div className="space-y-6">
      {preferencesLoading ? (
        <Card>
          <p className="text-sm text-ink-500">Loading preferences...</p>
        </Card>
      ) : preferencesError ? (
        renderPreferencesError
      ) : (
        <form className="space-y-6" onSubmit={handleNotificationsSubmit}>
          <Card title="Email notifications" helperText="Control what lands in your inbox">
            <div className="space-y-4">
              {[
                {
                  key: "dailyDigestEmail",
                  label: "Daily digest",
                  description: "Get a quick summary of new assignments, blockers, and approvals."
                },
                {
                  key: "taskAssignmentEmail",
                  label: "Task assignments",
                  description: "Email me immediately when I am assigned to a task."
                },
                {
                  key: "commentMentionEmail",
                  label: "Mentions & comments",
                  description: "Send alerts when teammates mention me in chat or task comments."
                },
                {
                  key: "timesheetReminderEmail",
                  label: "Timesheet nudges",
                  description: "Remind me before the submission deadline for my timesheets."
                },
                {
                  key: "alertEscalationsEmail",
                  label: "Escalation alerts",
                  description: "Escalate critical project alerts to my inbox."
                }
              ].map((option) => (
                <label
                  key={option.key}
                  className="flex items-start gap-3 rounded-xl border border-ink-100 p-3 text-sm text-ink-800"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-ink-200 text-brand-600 focus:ring-brand-200"
                    checked={preferencesForm.notificationPreferences[option.key as keyof PreferencesFormState["notificationPreferences"]]}
                    onChange={(e) =>
                      handleNotificationToggle(
                        option.key as keyof PreferencesFormState["notificationPreferences"],
                        e.target.checked
                      )
                    }
                  />
                  <span>
                    <span className="font-semibold text-ink-900">{option.label}</span>
                    <br />
                    <span className="text-ink-500">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </Card>
          <Card title="Workflow automation" helperText="Tune how automation helps you">
            <div className="space-y-4">
              {[
                {
                  key: "autoSubscribeOnAssignment",
                  label: "Auto-subscribe to new tasks",
                  description: "Add tasks I am assigned to into my personal focus list automatically."
                },
                {
                  key: "autoShareStatusWithTeam",
                  label: "Share daily status in chat",
                  description: "Post a short summary to team chat when I submit updates."
                },
                {
                  key: "autoCaptureFocusBlocks",
                  label: "Protect focus time",
                  description: "Block the calendar when I mark work as focus-only."
                }
              ].map((option) => (
                <label
                  key={option.key}
                  className="flex items-start gap-3 rounded-xl border border-ink-100 p-3 text-sm text-ink-800"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-ink-200 text-brand-600 focus:ring-brand-200"
                    checked={preferencesForm.workflowPreferences[option.key as keyof PreferencesFormState["workflowPreferences"]]}
                    onChange={(e) =>
                      handleWorkflowToggle(option.key as keyof PreferencesFormState["workflowPreferences"], e.target.checked)
                    }
                  />
                  <span>
                    <span className="font-semibold text-ink-900">{option.label}</span>
                    <br />
                    <span className="text-ink-500">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </Card>
          {notificationStatus && (
            <p className={`text-sm ${notificationStatus.tone === "success" ? "text-emerald-600" : "text-rose-600"}`}>
              {notificationStatus.message}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={notificationSaving}>
              {notificationSaving ? "Saving..." : "Save notification settings"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );

  const availabilityTab = (
    <div className="space-y-6">
      {preferencesLoading ? (
        <Card>
          <p className="text-sm text-ink-500">Loading availability preferences...</p>
        </Card>
      ) : preferencesError ? (
        renderPreferencesError
      ) : (
        <Card title="Availability preferences" helperText="Used for meeting coordination & focus time">
          <form className="space-y-4" onSubmit={handleAvailabilityPreferencesSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-ink-700">Earliest meeting time</label>
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  value={preferencesForm.availabilityPreferences.meetingHoursStart}
                  onChange={(e) => handleAvailabilityPreferenceChange("meetingHoursStart", e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-ink-700">Latest meeting time</label>
                <input
                  type="time"
                  className="mt-1 w-full rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  value={preferencesForm.availabilityPreferences.meetingHoursEnd}
                  onChange={(e) => handleAvailabilityPreferenceChange("meetingHoursEnd", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm text-ink-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-200 text-brand-600 focus:ring-brand-200"
                  checked={preferencesForm.availabilityPreferences.shareCalendarWithTeam}
                  onChange={(e) => handleAvailabilityPreferenceChange("shareCalendarWithTeam", e.target.checked)}
                />
                Share my calendar availability with my team
              </label>
              <label className="flex items-center gap-3 text-sm text-ink-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-200 text-brand-600 focus:ring-brand-200"
                  checked={preferencesForm.availabilityPreferences.protectFocusTime}
                  onChange={(e) => handleAvailabilityPreferenceChange("protectFocusTime", e.target.checked)}
                />
                Auto-block focus sessions on my calendar
              </label>
            </div>
            {availabilityPrefStatus && (
              <p className={`text-sm ${availabilityPrefStatus.tone === "success" ? "text-emerald-600" : "text-rose-600"}`}>
                {availabilityPrefStatus.message}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={availabilityPrefSaving}>
                {availabilityPrefSaving ? "Saving..." : "Save availability preferences"}
              </Button>
            </div>
          </form>
        </Card>
      )}
      <Card title="Calendar & time tools" helperText="Jump straight into daily workflows">
        <div className="flex flex-col gap-3 md:flex-row">
          <Link
            href="/calendar"
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-ink-100 px-4 py-3 text-sm font-semibold text-ink-800 shadow-sm transition hover:border-brand-200 hover:text-brand-700"
          >
            Open calendar
          </Link>
          <Link
            href="/timesheets"
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-ink-100 px-4 py-3 text-sm font-semibold text-ink-800 shadow-sm transition hover:border-brand-200 hover:text-brand-700"
          >
            Review timesheets
          </Link>
          <Link
            href="/dayoffs"
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-ink-100 px-4 py-3 text-sm font-semibold text-ink-800 shadow-sm transition hover:border-brand-200 hover:text-brand-700"
          >
            Request day off
          </Link>
        </div>
      </Card>
      <Card
        title="Work schedule"
        helperText={`Used for capacity & timeline calculations (${scheduleTimeZone || user.profile.timeZone})`}
      >
        <form className="space-y-4" onSubmit={handleScheduleSubmit}>
          <div className="rounded-xl border border-ink-100">
            <div className="grid grid-cols-4 gap-4 border-b border-ink-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
              <div>Day</div>
              <div>Start</div>
              <div>End</div>
              <div>&nbsp;</div>
            </div>
            {dayOptions.map((option) => {
              const config = scheduleState[option.day];
              return (
                <div key={option.day} className="grid grid-cols-4 items-center gap-4 border-b border-ink-50 px-4 py-3 text-sm last:border-b-0">
                  <label className="flex items-center gap-2 text-ink-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-ink-200 text-brand-600 focus:ring-brand-200"
                      checked={config.enabled}
                      onChange={(e) => handleScheduleToggle(option.day, e.target.checked)}
                    />
                    {option.label}
                  </label>
                  <input
                    type="time"
                    className="rounded-lg border border-ink-100 px-2 py-1 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    value={config.start}
                    disabled={!config.enabled}
                    onChange={(e) => handleScheduleTimeChange(option.day, "start", e.target.value)}
                  />
                  <input
                    type="time"
                    className="rounded-lg border border-ink-100 px-2 py-1 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                    value={config.end}
                    disabled={!config.enabled}
                    onChange={(e) => handleScheduleTimeChange(option.day, "end", e.target.value)}
                  />
                  <div className="text-xs text-ink-400">TZ: {scheduleTimeZone}</div>
                </div>
              );
            })}
          </div>
          {scheduleStatus && <p className="text-sm text-ink-500">{scheduleStatus}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={scheduleSaving}>
              {scheduleSaving ? "Saving..." : "Save schedule"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );

  const tabs = [
    { id: "account", label: "Account", content: accountTab },
    { id: "notifications", label: "Notifications", content: notificationsTab },
    { id: "availability", label: "Availability & Schedule", content: availabilityTab }
  ];

  return (
    <PageShell
      title="Settings"
      subtitle="Manage your profile, notifications, and availability"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <Tabs tabs={tabs} />
    </PageShell>
  );
}
