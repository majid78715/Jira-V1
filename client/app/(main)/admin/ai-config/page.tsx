"use client";

import { AiConfigForm } from "../../../../components/admin/AiConfigForm";
import { PageShell } from "../../../../components/layout/PageShell";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";

export default function AiConfigPage() {
  const { user, loading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["SUPER_ADMIN", "PM", "PROJECT_MANAGER"]
  });

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading…</div>;
  }

  return (
    <PageShell
      title="AI Configuration"
      subtitle="Manage AI providers and API keys"
      userName={`${user.profile.firstName} ${user.profile.lastName}`}
      currentUser={user}
    >
      <div className="mx-auto max-w-2xl">
        <AiConfigForm />
      </div>
    </PageShell>
  );
}
