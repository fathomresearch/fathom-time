"use client";

import { useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { isValidTimezone } from "@/lib/time";

const US_ZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain, no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

export default function ProfileForm({
  id,
  name,
  email,
  timezone,
  onSaved,
}: {
  id: string;
  name: string;
  email: string;
  timezone: string;
  onSaved: () => void;
}) {
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const allZones = Intl.supportedValuesOf("timeZone");

  const action = async (formData: FormData) => {
    const nextName = String(formData.get("name") ?? "").trim();
    const nextZone = String(formData.get("timezone") ?? "");
    if (!nextName) return setState({ ok: false, message: "Enter your name." });
    if (nextName.length > 80) return setState({ ok: false, message: "Keep your name under 80 characters." });
    if (!isValidTimezone(nextZone)) return setState({ ok: false, message: "Pick a time zone from the list." });
    setPending(true);
    const { error } = await sb().from("profiles").update({ name: nextName, timezone: nextZone }).eq("id", id);
    setPending(false);
    if (error) return setState({ ok: false, message: "Couldn't save. Try again." });
    setState({ ok: true, message: "Saved." });
    onSaved();
  };
  const usValues = new Set(US_ZONES.map((z) => z.value));
  const otherZones = allZones.filter((z) => !usValues.has(z));

  return (
    <form action={action} className="grid max-w-md gap-4">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-navy">Name</span>
        <input
          name="name"
          defaultValue={name}
          required
          maxLength={80}
          className="h-10 rounded-md border border-light px-3 text-sm focus:border-blue focus:outline-none"
        />
      </label>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-navy">Email</span>
        <p className="text-sm text-charcoal">{email}</p>
      </div>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-navy">Time zone</span>
        <select
          name="timezone"
          defaultValue={timezone}
          className="h-10 rounded-md border border-light bg-white px-2 text-sm focus:border-blue focus:outline-none"
        >
          <optgroup label="United States">
            {US_ZONES.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Everywhere else">
            {otherZones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </optgroup>
        </select>
        <span className="text-xs text-charcoal/80">
          Every date, day total and report you see uses this zone, including
          other people&apos;s entries.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-teal px-5 font-display text-sm font-semibold text-navy hover:brightness-95 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state && (
          <span
            role="status"
            className={`text-sm ${state.ok ? "text-charcoal" : "text-danger"}`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
