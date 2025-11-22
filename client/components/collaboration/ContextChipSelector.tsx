"use client";

import clsx from "clsx";

interface ContextChipSelectorProps {
  options: ReadonlyArray<{ id: string; label: string }>;
  active: string[];
  onToggle: (chipId: string) => void;
}

export function ContextChipSelector({ options, active, onToggle }: ContextChipSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((chip) => {
        const isActive = active.includes(chip.id);
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onToggle(chip.id)}
            className={clsx(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-all",
              isActive
                ? "border-accent-turquoise bg-brand-gradient-subtle text-brand-700 shadow-sm"
                : "border-ink-200 text-ink-500 hover:border-ink-300 hover:bg-ink-50"
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
