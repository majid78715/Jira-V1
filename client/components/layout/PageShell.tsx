"use client";

import { PropsWithChildren, useCallback, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { AiChatDrawer } from "./AiChatDrawer";
import { Button } from "../ui/Button";
import { User } from "../../lib/types";
import { apiRequest, ApiError } from "../../lib/apiClient";
import { TeamChatWidget } from "../chat/TeamChatWidget";

interface PageShellProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
  userName?: string;
  currentUserId?: string;
  currentUser?: User | null;
}

export function PageShell({ title, subtitle, userName, currentUserId, currentUser, children }: PageShellProps) {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isTeamChatOpen, setTeamChatOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const effectiveUserName = userName || (currentUser?.profile ? `${currentUser.profile.firstName} ${currentUser.profile.lastName}` : undefined);

  useEffect(() => {
    if (pathname === "/chat") {
      setTeamChatOpen(false);
    }
  }, [pathname]);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    try {
      await apiRequest<null>("/auth/logout", { method: "POST" });
    } catch (error) {
      // Swallow logout errors and still redirect to login.
      const apiError = error as ApiError;
      // eslint-disable-next-line no-console
      console.error("Logout failed:", apiError?.message ?? error);
    } finally {
      setIsLoggingOut(false);
      router.push("/login");
    }
  }, [isLoggingOut, router]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar currentUser={currentUser} onChatClick={() => setTeamChatOpen((prev) => !prev)} />
      <div className="flex flex-1 flex-col">
        <TopBar
          title={title}
          subtitle={subtitle}
          userName={effectiveUserName}
          onLogout={handleLogout}
        />
        <main className="flex-1 bg-slate-50 px-4 py-4">{children}</main>
      </div>
      {!isDrawerOpen && (
        <Button
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full p-0 shadow-xl text-2xl"
          onClick={() => setDrawerOpen(true)}
        >
          ✨
        </Button>
      )}
      <AiChatDrawer
        open={isDrawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentUserId={currentUserId ?? currentUser?.id}
      />
      <TeamChatWidget
        isOpen={isTeamChatOpen}
        onClose={() => setTeamChatOpen(false)}
        onExpand={() => {
          setTeamChatOpen(false);
          router.push("/chat");
        }}
      />
    </div>
  );
}
