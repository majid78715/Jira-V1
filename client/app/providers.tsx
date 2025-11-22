"use client";

import { CallProvider } from "../features/chat/call/CallContext";
import { CallOverlay } from "../components/chat/CallOverlay";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CallProvider>
      {children}
      <CallOverlay />
    </CallProvider>
  );
}
