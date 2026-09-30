"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A button that opens a floating panel. Closes on outside click or Esc.
 * `align` picks which edge of the button the panel lines up with.
 */
export default function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = "left",
  width = 360,
  label,
  triggerClassName = "",
  wrapperClassName = "",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: "left" | "right";
  width?: number;
  label: string;
  triggerClassName?: string;
  wrapperClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [flipUp, setFlipUp] = useState(false);
  const [side, setSide] = useState<"left" | "right">(align);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const rect = ref.current?.getBoundingClientRect();
    setFlipUp(!!rect && window.innerHeight - rect.bottom < 300 && rect.top > 420);
    // Keep the panel on screen: flip to the other edge if it would overflow.
    if (rect) {
      if (align === "left" && rect.left + width > window.innerWidth - 12) setSide("right");
      else if (align === "right" && rect.right - width < 12) setSide("left");
      else setSide(align);
    }
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange, align, width]);

  return (
    <div ref={ref} className={`relative ${wrapperClassName}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          style={{ width }}
          className={`absolute z-30 rounded-lg border border-light bg-white shadow-xl ${
            side === "right" ? "right-0" : "left-0"
          } ${flipUp ? "bottom-full mb-1.5" : "top-full mt-1.5"}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
