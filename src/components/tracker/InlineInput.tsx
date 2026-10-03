"use client";

import { useState } from "react";

/**
 * A text field that looks like plain text until you click it.
 * Saves on Enter or when you click away; Esc puts the old value back.
 * While focused it ignores outside updates, so a background refresh
 * never overwrites what you're typing.
 */
export default function InlineInput({
  value,
  onCommit,
  placeholder,
  className = "",
  ariaLabel,
  selectOnFocus = true,
  focusClass = "focus:border-blue",
}: {
  value: string;
  onCommit: (next: string) => void | boolean | Promise<void | boolean>;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
  selectOnFocus?: boolean;
  /** Border color while editing (the budget page uses navy). */
  focusClass?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;

  const commit = async () => {
    if (draft === null) return;
    const next = draft;
    setDraft(null);
    if (next !== value) await onCommit(next);
  };

  return (
    <input
      aria-label={ariaLabel}
      value={shown}
      placeholder={placeholder}
      onFocus={(e) => {
        setDraft(value);
        if (selectOnFocus) e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          const el = e.currentTarget;
          requestAnimationFrame(() => el.blur());
        }
      }}
      className={`rounded-md border border-transparent bg-transparent px-2 py-1.5 hover:border-light ${focusClass} focus:bg-white focus:outline-none ${className}`}
    />
  );
}
