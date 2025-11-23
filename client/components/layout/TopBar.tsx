"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSettings = () => {
    setIsMenuOpen(false);
    router.push("/settings");
  };

  const handleLogout = () => {
    setIsMenuOpen(false);
    onLogout?.();
  };

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
          <div className="relative" ref={menuRef}>
            <Avatar name={userName} status="online" onClick={() => setIsMenuOpen(!isMenuOpen)} size={28} />
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                <button
                  onClick={handleSettings}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
