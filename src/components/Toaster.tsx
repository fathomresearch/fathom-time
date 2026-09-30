"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

type Toast = { id: number; message: string; tone: "error" | "info" };
let listeners: ((t: Toast) => void)[] = [];
let nextId = 1;

/** Show a short message at the bottom of the screen. */
export function toast(message: string, tone: "error" | "info" = "error") {
  const t = { id: nextId++, message, tone };
  listeners.forEach((l) => l(t));
}

export default function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (t: Toast) => {
      setItems((cur) => [...cur.slice(-2), t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 5000);
    };
    listeners.push(add);
    return () => {
      listeners = listeners.filter((l) => l !== add);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex items-center gap-3 rounded-md px-4 py-2.5 text-sm shadow-lg ${
            t.tone === "error" ? "bg-danger text-white" : "bg-navy text-white"
          }`}
        >
          {t.message}
          <button
            onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
            aria-label="Dismiss"
            className="opacity-70 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
