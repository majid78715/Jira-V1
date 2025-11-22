"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref
) {
  const base =
    "inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  
  const sizes: Record<ButtonSize, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
    lg: "px-5 py-2.5 text-base"
  };

  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-brand-gradient text-white shadow-md hover:shadow-lg hover:scale-105 focus-visible:outline-accent-turquoise",
    secondary:
      "bg-brand-soft-gradient text-brand-800 shadow-sm hover:shadow-md hover:scale-105 focus-visible:outline-accent-turquoise",
    ghost:
      "bg-transparent text-ink-700 hover:bg-brand-gradient-subtle focus-visible:outline-accent-turquoise"
  };

  return <button ref={ref} className={clsx(base, sizes[size], variants[variant], className)} {...props} />;
});
