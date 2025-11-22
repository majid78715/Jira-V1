"use client";

import { forwardRef, InputHTMLAttributes } from "react";
import clsx from "clsx";

type DatePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { className, ...props },
  ref
) {
  return (
    <input
      type="date"
      ref={ref}
      className={clsx(
        "w-full rounded-lg border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-accent-turquoise focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all",
        className
      )}
      {...props}
    />
  );
});
