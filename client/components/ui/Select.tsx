"use client";

import { forwardRef, SelectHTMLAttributes } from "react";
import clsx from "clsx";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={clsx(
        "w-full rounded-lg border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-accent-turquoise focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});
