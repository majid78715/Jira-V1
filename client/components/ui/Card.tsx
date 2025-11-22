"use client";

import { PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";

interface CardProps extends PropsWithChildren {
  title?: ReactNode;
  helperText?: ReactNode;
  className?: string;
}

export function Card({ title, helperText, className, children }: CardProps) {
  return (
    <section className={clsx("rounded-2xl bg-white p-6 shadow-card", className)}>
      {(title || helperText) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="text-base font-semibold text-ink-900">{title}</h3>}
          {helperText && <span className="text-xs text-ink-400">{helperText}</span>}
        </header>
      )}
      {children}
    </section>
  );
}
