"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import { fetchAll } from "@/lib/fetchAll";
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
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const db = sb();
    const ranged = !!(fromKey || toKey);
    // Paged: the database returns at most 1000 rows per request.
    const report = (from: string | null, to: string | null) =>
      fetchAll<ReportRow>((a, b) =>
        db
          .rpc("time_report", { from_ts: from, to_ts: to })
          .order("project_id")
          .order("task_id")
          .order("user_id")
          .range(a, b)
      );
    const [rows, budgetRows, t, all] = await Promise.all([
      report(
        fromKey ? startOfDay(fromKey, tz).toISOString() : null,
        toKey ? startOfDay(addDays(toKey, 1), tz).toISOString() : null
      ),
      fetchAll((a, b) =>
        db.from("task_budgets").select("hours,tasks!inner(project_id)").order("task_id").order("level").range(a, b)
      ),
      db.from("project_budgets").select("project_id,warn_pct,over_pct"),
      ranged ? report(null, null) : null,
    ]);
    if (seq !== loadSeq.current) return; // a newer load is on its way
    if (!rows || !budgetRows || t.error || (ranged && !all)) {
      toast("Couldn't load project totals.");
      return;
    }
    const budgets = new Map<string, number>();
    // tasks!inner(...) is one task per budget row (the typing says array).
    for (const x of budgetRows as unknown as { hours: number; tasks: { project_id: string } }[]) {
      budgets.set(x.tasks.project_id, (budgets.get(x.tasks.project_id) ?? 0) + Number(x.hours));
    }
    const allRows = (ranged ? all : rows) ?? [];
    const allTime = new Map<string, number>();
    for (const x of allRows) {
      if (x.project_id) allTime.set(x.project_id, (allTime.get(x.project_id) ?? 0) + x.seconds);
    }
    setRows(rows);
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
