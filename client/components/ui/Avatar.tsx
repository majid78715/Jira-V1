"use client";

import { CSSProperties } from "react";
import clsx from "clsx";

interface AvatarProps {
  name: string;
  status?: "online" | "offline";
  onClick?: () => void;
  size?: number;
  className?: string;
}

export function Avatar({ name, status = "offline", onClick, size = 40, className }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isInteractive = typeof onClick === "function";
  const dimensionStyle: CSSProperties = {
    width: size,
    height: size,
    fontSize: `${Math.max(12, Math.round(size / 2.25))}px`
  };
  const statusSize = Math.max(8, Math.round(size / 3.75));

  const baseClasses =
    "relative flex items-center justify-center rounded-full bg-brand-gradient font-semibold text-white select-none";
  const interactiveClasses = isInteractive
    ? "cursor-pointer outline-none ring-0 transition focus-visible:ring-2 focus-visible:ring-accent-turquoise focus-visible:ring-offset-2 focus-visible:ring-offset-white"
    : "";

  const content = (
    <>
      {initials}
      <span
        className={clsx(
          "absolute rounded-full border-2 border-white",
          status === "online" ? "bg-green-500" : "bg-white"
        )}
        style={{
          width: statusSize,
          height: statusSize,
          right: Math.max(0, size * 0.05),
          bottom: Math.max(0, size * 0.05)
        }}
        aria-hidden
      />
    </>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={clsx(baseClasses, interactiveClasses, className)}
        style={dimensionStyle}
        aria-label={`${name} menu`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={clsx(baseClasses, className)} style={dimensionStyle}>
      {content}
    </div>
  );
}
