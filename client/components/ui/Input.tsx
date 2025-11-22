"use client";

import { forwardRef, InputHTMLAttributes } from "react";
import clsx from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-md border border-ink-100 bg-white px-2.5 py-1.5 text-xs text-ink-900 shadow-sm placeholder:text-ink-300 focus:border-accent-turquoise focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all",
        className
      )}
      {...props}
    />
  );
});
