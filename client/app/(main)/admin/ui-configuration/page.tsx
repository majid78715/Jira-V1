"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PageShell } from "../../../../components/layout/PageShell";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";

const destinations = [
  {
    href: "/admin/ui-configuration/work-item-types",
    title: "Work Item Types",
    description: "Define types like Bug, Story, Feature and their fields.",
    cta: "Manage Types"
  },
  {
    href: "/admin/ui-configuration/workflow-schemes",
    title: "Workflow Schemes",
    description: "Define statuses and transitions for your projects.",
    cta: "Manage Schemes"
  }
];

export default function UiConfigurationPage() {
  const { user, loading } = useCurrentUser({
    redirectTo: "/login",
    requiredRoles: ["SUPER_ADMIN", "PM"]
  });

  const userName = useMemo(() => {
    if (!user) {
      return "";
    }
    return `${user.profile.firstName} ${user.profile.lastName}`;
  }, [user]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-ink-400">Loading…</div>;
  }

  return (
    <PageShell
      title="UI Configuration"
      subtitle="Manage Work Item Types and Workflow Schemes"
      userName={userName}
      currentUser={user}
    >
      <div className="grid gap-6 md:grid-cols-2">
        {destinations.map((destination) => (
          <Card key={destination.href} title={destination.title} helperText={destination.description}>
            <Link href={destination.href} className="inline-block">
              <Button className="mt-4 w-full">{destination.cta}</Button>
            </Link>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
