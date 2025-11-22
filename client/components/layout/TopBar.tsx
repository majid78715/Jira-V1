"use client";

import { Input } from "../ui/Input";
import { Avatar } from "../ui/Avatar";
import { NotificationBell } from "./NotificationBell";
import { Button } from "../ui/Button";

interface TopBarProps {
  title?: string;
  subtitle?: string;
  userName?: string;
  onLogout?: () => void;
}

export function TopBar({
  title = "Overview",
  subtitle = "Realtime pulse",
  userName = "Studio Admin",
  onLogout
}: TopBarProps) {
  return (
    <header className="flex flex-col gap-2 border-b border-ink-100 bg-white/90 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-wide font-semibold bg-gradient-to-r from-accent-lime via-accent-turquoise to-accent-teal bg-clip-text text-transparent">HUMAIN Console</p>
          <h1 className="text-lg font-semibold text-ink-900 leading-tight">{title}</h1>
          <p className="text-[11px] text-ink-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <Input type="search" placeholder="Search..." className="w-48 h-8 text-xs" />
          </div>
          <NotificationBell />
          <Avatar name={userName} status="online" onClick={onLogout} size={28} />
        </div>
      </div>
    </header>
  );
}
