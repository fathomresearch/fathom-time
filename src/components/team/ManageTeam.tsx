"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { toast } from "@/components/Toaster";
import { Avatar } from "@/components/team/bits";
import type { TeamPerson } from "@/components/team/useTeamWeek";
import { setActive, setRole } from "@/app/(app)/team/actions";
import { displayName } from "@/lib/people";
import { ROLE_LABELS, type Role } from "@/lib/types";

/**
 * The Director moves people between Manager and Analyst and can deactivate
 * anyone else. A Manager can only deactivate or reactivate Analysts. The
 * Director's own role and access are fixed.
 */
export default function ManageTeam({
  people,
  viewerId,
  viewerRole,
  onChanged,
}: {
  people: TeamPerson[];
  viewerId: string;
  viewerRole: Role;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<TeamPerson | null>(null);

  const sorted = [...people].sort(
    (a, b) => Number(b.active) - Number(a.active) || displayName(a).localeCompare(displayName(b))
  );

  const run = async (id: string, action: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(id);
    const result = await action();
    setBusy(null);
    toast(result.message, result.ok ? "info" : "error");
    onChanged();
  };

  return (
    <>
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          <col className="w-[280px]" />
          <col className="w-[150px]" />
          <col className="w-[140px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-light text-left font-display text-xs font-semibold text-charcoal/70">
            <th className="px-4 py-2.5">Person</th>
            <th className="py-2.5">Email</th>
            <th className="py-2.5">Role</th>
            <th className="px-4 py-2.5 text-right">Access</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const self = p.id === viewerId;
            const canSetRole = viewerRole === "director" && !self && p.role !== "director";
            const canSetAccess =
              !self && p.role !== "director" && (viewerRole === "director" || p.role === "analyst");
            return (
              <tr key={p.id} className={`border-b border-light last:border-0 ${p.active ? "" : "text-charcoal/60"}`}>
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={p.name} email={p.email} />
                    <span className={`truncate font-medium ${p.active ? "text-navy" : ""}`}>
                      {displayName(p)}
                      {self && <span className="ml-1.5 text-xs font-normal text-charcoal/60">(you)</span>}
                    </span>
                  </div>
                </td>
                <td className="truncate py-2.5 pr-3">{p.email}</td>
                <td className="py-2.5">
                  {canSetRole ? (
                    <select
                      value={p.role}
                      disabled={busy === p.id}
                      onChange={(e) => run(p.id, () => setRole(p.id, e.target.value as Role))}
                      aria-label={`Role for ${displayName(p)}`}
                      className="h-8 rounded-md border border-light bg-white px-2 text-sm focus:border-blue focus:outline-none disabled:opacity-60"
                    >
                      <option value="analyst">Analyst</option>
                      <option value="manager">Manager</option>
                    </select>
                  ) : (
                    <span className="px-2">{ROLE_LABELS[p.role]}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!canSetAccess ? (
                    <span className="text-xs text-charcoal/60">{p.active ? "Active" : "Deactivated"}</span>
                  ) : p.active ? (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => setDeactivating(p)}
                      className="h-8 rounded-md border border-light px-3 text-sm text-danger hover:bg-lightest disabled:opacity-60"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === p.id}
                      onClick={() => run(p.id, () => setActive(p.id, true))}
                      className="h-8 rounded-md border border-light px-3 text-sm font-medium text-navy hover:bg-lightest disabled:opacity-60"
                    >
                      Reactivate
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ConfirmDialog
        open={!!deactivating}
        title={`Deactivate ${deactivating ? displayName(deactivating) : ""}?`}
        body="They're signed out, can't sign in, and any running timer stops now. Their time stays in reports. You can reactivate them later."
        confirmLabel="Deactivate"
        onConfirm={() => {
          const p = deactivating;
          setDeactivating(null);
          if (p) run(p.id, () => setActive(p.id, false));
        }}
        onCancel={() => setDeactivating(null)}
      />
    </>
  );
}
