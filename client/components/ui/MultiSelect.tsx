"use client";

import { useState, useRef, useEffect } from "react";
import clsx from "clsx";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({ options, value, onChange, placeholder = "Select...", className }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const selectedLabels = options
    .filter((opt) => value.includes(opt.value))
    .map((opt) => opt.label)
    .join(", ");

  return (
    <div className={clsx("relative", className)} ref={containerRef}>
      <div
        className="w-full rounded-lg border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-sm focus:border-accent-turquoise focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all cursor-pointer min-h-[38px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        {value.length > 0 ? selectedLabels : <span className="text-ink-400">{placeholder}</span>}
      </div>
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full rounded-md bg-white shadow-lg border border-ink-100 max-h-60 overflow-auto">
          {options.map((option) => (
            <div
              key={option.value}
              className="flex items-center px-3 py-2 hover:bg-ink-50 cursor-pointer"
              onClick={() => handleToggle(option.value)}
            >
              <input
                type="checkbox"
                checked={value.includes(option.value)}
                readOnly
                className="mr-2 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-ink-900">{option.label}</span>
            </div>
          ))}
          {options.length === 0 && <div className="px-3 py-2 text-sm text-ink-400">No options available</div>}
        </div>
      )}
    </div>
  );
}
