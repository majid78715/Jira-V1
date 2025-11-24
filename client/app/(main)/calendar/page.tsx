"use client";

import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { PageShell } from "../../../components/layout/PageShell";
import { CalendarView } from "../../../features/calendar/CalendarView";

export default function CalendarPage() {
  const { user, loading: sessionLoading } = useCurrentUser({ redirectTo: "/login" });

  if (sessionLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading workspace…</div>;
  }

  return (
    <PageShell
      title="Calendar"
      subtitle="Manage your schedule and meetings"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="h-[calc(100vh-12rem)]">
        <CalendarView currentUser={user} />
      </div>
    </PageShell>
  );
}
