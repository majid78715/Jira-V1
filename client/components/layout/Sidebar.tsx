"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { User, Role, PermissionModule } from "../../lib/types";
import { useNotificationBadge } from "../../hooks/useNotificationBadge";

type SidebarLinkId = PermissionModule;

type SidebarLink = {
  id: SidebarLinkId;
  href: string;
  label: string;
  alias?: Partial<Record<Role, string>>;
};

const NAV_BLUEPRINT: Record<SidebarLinkId, SidebarLink> = {
  dashboard: { id: "dashboard", href: "/dashboard", label: "Dashboard" },
  projects: { id: "projects", href: "/projects", label: "Projects" },
  tasks: {
    id: "tasks",
    href: "/tasks/my",
    label: "Tasks",
    alias: { DEVELOPER: "My Tasks", ENGINEER: "My Tasks" }
  },
  notifications: { id: "notifications", href: "/notifications", label: "Notifications" },
  teamDevelopers: { id: "teamDevelopers", href: "/team/developers", label: "Developers" },
  approvals: { id: "approvals", href: "/team/pending-profiles", label: "Approvals" },
  alerts: { id: "alerts", href: "/alerts", label: "Alerts & Risks" },
  reports: { id: "reports", href: "/reports", label: "Reports" },
  chat: { id: "chat", href: "/chat", label: "Chat" },
  settings: { id: "settings", href: "/settings", label: "Settings" },
  admin: { id: "admin", href: "/admin", label: "Admin" },
  adminHolidays: { id: "adminHolidays", href: "/admin/company-holidays", label: "Admin · Company Holidays" },
  personas: { id: "personas", href: "/personas", label: "Personas" }
};

const DEFAULT_ROLE_MODULES: Record<Role, SidebarLinkId[]> = {
  SUPER_ADMIN: [
    "dashboard",
    "projects",
    "notifications",
    "alerts",
    "reports",
    "approvals",
    "chat",
    "settings",
    "admin",
    "personas"
  ],
  PM: [
    "dashboard",
    "projects",
    "notifications",
    "alerts",
    "reports",
    "approvals",
    "chat",
    "settings",
    "admin",
    "personas"
  ],
  PROJECT_MANAGER: [
    "dashboard",
    "projects",
    "notifications",
    "teamDevelopers",
    "reports",
    "chat",
    "settings",
    "personas"
  ],
  DEVELOPER: ["tasks", "notifications", "chat", "settings", "personas"],
  ENGINEER: ["tasks", "notifications", "chat", "settings", "personas"],
  VP: ["dashboard", "projects", "notifications", "alerts", "reports", "chat", "settings", "personas"],
  VIEWER: ["dashboard", "projects", "notifications", "chat", "settings", "personas"]
};

const FALLBACK_MODULES: SidebarLinkId[] = ["dashboard", "projects", "notifications", "settings", "personas"];

interface SidebarProps {
  currentUser?: User | null;
  onChatClick?: () => void;
}

export function Sidebar({ currentUser, onChatClick }: SidebarProps) {
  const pathname = usePathname();
  const role = currentUser?.role;
  const isFirstLoginRestricted = Boolean(currentUser?.firstLoginRequired);
  const { pendingCount: pendingNotifications } = useNotificationBadge();
  const { pendingCount: pendingChatMessages } = useNotificationBadge({ type: "CHAT_MESSAGE", pollIntervalMs: 20000 });
  const baseNavList = isFirstLoginRestricted
    ? [
        {
          ...NAV_BLUEPRINT.settings,
          href: "/settings/first-login-password-change",
          label: "Change Password"
        }
      ]
    : buildNavList(role, currentUser?.permittedModules);
  
  const mainNavList = baseNavList.filter((item) => item.id !== "chat");
  const chatNavItem = baseNavList.find((item) => item.id === "chat");

  const initials = currentUser?.profile
    ? `${currentUser.profile.firstName?.[0] ?? ""}${currentUser.profile.lastName?.[0] ?? ""}`.toUpperCase()
    : "HU";
  
  const displayTitle = currentUser?.profile?.title || "Console";

  return (
    <aside className="flex h-full min-h-screen w-[var(--sidebar-width)] flex-col border-r border-ink-100 bg-white px-3 py-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gradient text-white font-semibold shadow-md text-[10px]">
          {initials}
        </div>
        <div>
          <p className="text-[9px] text-ink-500 uppercase tracking-wide leading-none">HUMAIN</p>
          <p className="text-xs font-semibold bg-gradient-to-r from-accent-turquoise to-accent-teal bg-clip-text text-transparent leading-tight truncate max-w-[120px]" title={displayTitle}>
            {displayTitle}
          </p>
        </div>
      </div>

      {isFirstLoginRestricted && (
        <div className="mb-3 rounded-lg bg-amber-50 p-2 text-[10px] text-amber-900 leading-tight">
          Update password.
        </div>
      )}

      <nav className="space-y-0.5 text-xs font-medium text-ink-500">
        {mainNavList.map((item) => {
          const active = pathname === item.href || (pathname?.startsWith(item.href) && item.href !== "/");
          const badgeCount = item.id === "notifications" ? pendingNotifications : 0;
          const showBadge = badgeCount > 0;
          const badgeLabel = showBadge ? (badgeCount > 99 ? "99+" : badgeCount.toString()) : null;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={clsx(
                "flex items-center justify-between rounded-md px-2 py-1.5 transition text-xs",
                active ? "bg-gradient-to-r from-brand-50 to-transparent text-brand-700 font-semibold" : "hover:text-ink-900"
              )}
              >
              <span className="flex items-center gap-2">
                {item.label}
                {showBadge && (
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                    {badgeLabel}
                  </span>
                )}
              </span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-gradient shadow-sm" />}
            </Link>
          );
        })}
      </nav>

      {chatNavItem && (
        <div className="mt-auto">
          <button
            onClick={(e) => {
              e.preventDefault();
              onChatClick?.();
            }}
            className={clsx(
              "flex w-full items-center justify-between rounded-xl p-3 transition-all duration-200",
              "bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-ink-100",
              "hover:shadow-[0_6px_16px_rgba(0,0,0,0.08)] hover:-translate-y-0.5",
              "text-brand-700 font-semibold text-xs"
            )}
          >
            <span className="flex items-center gap-2">
              {chatNavItem.label}
              {pendingChatMessages > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-none text-white shadow-sm">
                  {pendingChatMessages > 99 ? "99+" : pendingChatMessages.toString()}
                </span>
              )}
            </span>
            <span className="h-2 w-2 rounded-full bg-green-500 shadow-sm animate-pulse" />
          </button>
        </div>
      )}
    </aside>
  );
}

function buildNavList(role?: Role | null, permittedModules?: PermissionModule[] | null) {
  const allowedModules = permittedModules && permittedModules.length
    ? permittedModules
    : role
      ? DEFAULT_ROLE_MODULES[role] ?? FALLBACK_MODULES
      : FALLBACK_MODULES;
  const keys = allowedModules.filter((key) => NAV_BLUEPRINT[key]);
  return keys.map((key) => {
    const item = NAV_BLUEPRINT[key];
    const label = role && item.alias?.[role] ? item.alias[role]! : item.label;
    return { ...item, label };
  });
}


