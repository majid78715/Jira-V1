"use client";

import clsx from "clsx";

type BadgeTone = "success" | "neutral" | "warning";

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  className?: string;
}

const toneStyles: Record<BadgeTone, string> = {
  success: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
  neutral: "bg-ink-50 text-ink-600 ring-1 ring-ink-100",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
};

export function Badge({ label, tone = "neutral", className }: BadgeProps) {
  return (
    <span
      className={clsx("inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold", toneStyles[tone], className)}
    >
      {label}
    </span>
  );
}
