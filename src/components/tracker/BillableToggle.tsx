"use client";

import { DollarSign } from "lucide-react";

export default function BillableToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={value ? "Billable" : "Not billable"}
      title={value ? "Billable" : "Not billable"}
      onClick={() => onChange(!value)}
      className={`rounded-md p-1.5 hover:bg-lightest ${value ? "text-[#00A98D]" : "text-medium"}`}
    >
      <DollarSign size={18} strokeWidth={value ? 2.5 : 2} />
    </button>
  );
}
