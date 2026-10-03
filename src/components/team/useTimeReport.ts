"use client";

import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import type { ReportRow } from "@/components/budget/useProjectBudget";
import { addDays, startOfDay } from "@/lib/time";
import type { Thresholds } from "@/lib/budget";

/**
 * Hours by project, task and person, all time or From / To (day keys in
 * `tz`), plus each project's total budget and all-time hours (budget use is
 * always all-time, whatever range is shown). Directors and managers only.
 */
export function useTimeReport(fromKey: string | null, toKey: string | null, tz: string) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [budgetByProject, setBudgetByProject] = useState<Map<string, number>>(new Map());
  const [allTimeByProject, setAllTimeByProject] = useState<Map<string, number>>(new Map());
  const [thresholdsByProject, setThresholdsByProject] = useState<Map<string, Thresholds>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const db = sb();
    const ranged = !!(fromKey || toKey);
    const [r, b, t, all] = await Promise.all([
      db.rpc("time_report", {
        from_ts: fromKey ? startOfDay(fromKey, tz).toISOString() : null,
        to_ts: toKey ? startOfDay(addDays(toKey, 1), tz).toISOString() : null,
      }),
      db.from("task_budgets").select("hours,tasks!inner(project_id)"),
      db.from("project_budgets").select("project_id,warn_pct,over_pct"),
      ranged ? db.rpc("time_report") : null,
    ]);
    if (r.error || b.error || t.error || all?.error) {
      toast("Couldn't load project totals.");
      return;
    }
    const budgets = new Map<string, number>();
    for (const x of b.data as unknown as { hours: number; tasks: { project_id: string } }[]) {
      budgets.set(x.tasks.project_id, (budgets.get(x.tasks.project_id) ?? 0) + Number(x.hours));
    }
    const allRows = ((ranged ? all?.data : r.data) as ReportRow[]) ?? [];
    const allTime = new Map<string, number>();
    for (const x of allRows) {
      if (x.project_id) allTime.set(x.project_id, (allTime.get(x.project_id) ?? 0) + x.seconds);
    }
    setRows((r.data as ReportRow[]) ?? []);
    setAllTimeByProject(allTime);
    setThresholdsByProject(
      new Map(
        (t.data as { project_id: string; warn_pct: number; over_pct: number }[]).map((x) => [
          x.project_id,
          { warn: Number(x.warn_pct), over: Number(x.over_pct) },
        ])
      )
    );
    setBudgetByProject(budgets);
    setLoaded(true);
  }, [fromKey, toKey, tz]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { rows, budgetByProject, allTimeByProject, thresholdsByProject, loaded, reload: load };
}
