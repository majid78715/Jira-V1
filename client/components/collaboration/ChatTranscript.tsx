"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { ChatMessage } from "../../lib/types";

interface ChatTranscriptProps {
  messages: ChatMessage[];
  currentUserId?: string;
}

export function ChatTranscript({ messages, currentUserId }: ChatTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (!messages.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-ink-400">
        <p className="text-sm font-medium">No conversation yet</p>
        <p className="text-xs">Share context or ask a question to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => {
        const isCurrentUser = currentUserId ? message.userId === currentUserId : message.role === "USER";
        const alignment = isCurrentUser ? "items-end text-right" : "items-start text-left";
        const bubbleClasses = isCurrentUser
          ? "bg-brand-gradient text-white font-medium"
          : message.role === "ASSISTANT"
            ? "bg-white border border-ink-100 text-ink-800 font-normal leading-relaxed"
            : "bg-white text-ink-900";
        const timestamp = new Date(message.createdAt).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit"
        });
        return (
          <div key={message.id} className={clsx("flex flex-col", alignment)}>
            <div className="text-xs uppercase tracking-wide text-ink-400">
              {message.role === "ASSISTANT" ? "Assistant" : "You"} · {timestamp}
            </div>
            <div className={clsx("mt-1 max-w-xl rounded-2xl px-4 py-3 text-sm shadow-sm", bubbleClasses)}>
              <ReactMarkdown
                components={{
                  p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                  li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                  strong: ({ node, ...props }) => <span className="font-bold text-ink-900" {...props} />
                }}
              >
                {message.body}
              </ReactMarkdown>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
