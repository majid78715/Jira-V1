"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PageShell } from "../../../components/layout/PageShell";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { useCurrentUser } from "../../../hooks/useCurrentUser";

const destinations = [
  {
    href: "/admin/users",
    title: "Manage Users",
    description: "Create, update, and deactivate internal accounts.",
    cta: "Open Users"
  },
  {
    href: "/admin/role-permissions",
    title: "Role Permissions",
    description: "Configure module access per role.",
    cta: "Configure Permissions"
  },
  {
    href: "/admin/companies",
    title: "Manage Companies",
    description: "Maintain vendor and internal company records.",
    cta: "Open Companies"
  },
  {
    href: "/admin/company-holidays",
    title: "Company Holidays",
    description: "Review and configure the holiday calendar.",
    cta: "Open Holidays"
  },
  {
    href: "/admin/workflows",
    title: "Workflow Definitions",
    description: "Design and publish multi-step approvals.",
    cta: "Open Workflows"
  },
  {
    href: "/admin/project-managers",
    title: "Project Managers",
    description: "Invite, edit, and track project manager accounts.",
    cta: "Open Project Managers"
  },
  {
    href: "/admin/product-managers",
    title: "Product Managers",
    description: "Invite, edit, and deactivate product manager accounts.",
    cta: "Open Product Managers"
  },
  {
    href: "/admin/ai-config",
    title: "AI Configuration",
    description: "Configure AI providers, API keys, and model settings.",
    cta: "Configure AI"
  },
  {
    href: "/admin/ui-configuration",
    title: "UI Configuration",
    description: "Configure Work Item Types and Workflow Schemes.",
    cta: "Configure UI"
  }
];

export default function AdminOverviewPage() {
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
      title="Admin Control Center"
      subtitle="Quick access to internal administration tools"
      userName={userName}
      currentUser={user}
    >
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
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

