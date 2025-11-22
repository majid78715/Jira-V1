"use client";

import { ReactNode } from "react";
import clsx from "clsx";

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl rounded-2xl bg-white shadow-card my-8 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4 flex-shrink-0">
          {title && <h3 className="text-lg font-semibold text-ink-900">{title}</h3>}
          {onClose && (
            <button
              onClick={onClose}
              className={clsx("rounded-full p-1 text-ink-400 transition hover:bg-ink-50 hover:text-ink-600")}
              aria-label="Close modal"
            >
              ✕
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-6 py-4 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
