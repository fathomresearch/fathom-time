"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

// Shown inside the app (sidebar stays) when a page crashes.
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-lg border border-light bg-white px-6 py-12 text-center">
      <TriangleAlert size={22} className="mx-auto text-danger" />
      <h1 className="mt-3 font-display text-lg font-semibold text-navy">Something went wrong</h1>
      <p className="mt-1 text-sm text-charcoal">
        This page couldn&apos;t load. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-5 h-9 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy hover:brightness-95"
      >
        Try again
      </button>
    </div>
  );
}
