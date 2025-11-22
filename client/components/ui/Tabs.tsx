"use client";

import { ReactNode, useEffect, useState } from "react";
import clsx from "clsx";

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTabId?: string;
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
}

export function Tabs({ tabs, defaultTabId, activeTabId, onTabChange }: TabsProps) {
  const [internalActive, setInternalActive] = useState(defaultTabId ?? tabs[0]?.id);
  const computedActive = activeTabId ?? internalActive ?? tabs[0]?.id;
  const current = tabs.find((tab) => tab.id === computedActive) ?? tabs[0];

  useEffect(() => {
    if (!activeTabId && defaultTabId) {
      setInternalActive(defaultTabId);
    }
  }, [activeTabId, defaultTabId]);

  useEffect(() => {
    if (!activeTabId && internalActive && !tabs.some((tab) => tab.id === internalActive)) {
      setInternalActive(defaultTabId ?? tabs[0]?.id);
    }
  }, [activeTabId, defaultTabId, internalActive, tabs]);

  const handleChange = (tabId: string) => {
    if (!activeTabId) {
      setInternalActive(tabId);
    }
    onTabChange?.(tabId);
  };

  return (
    <div>
      <div className="flex gap-2 border-b border-ink-100">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleChange(tab.id)}
            className={clsx(
              "rounded-t-lg px-4 py-2 text-sm font-medium transition relative",
              computedActive === tab.id
                ? "bg-white text-brand-700 shadow-card font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-gradient"
                : "bg-transparent text-ink-400 hover:text-ink-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="rounded-b-2xl border border-t-0 border-ink-100 bg-white p-4">{current?.content}</div>
    </div>
  );
}
