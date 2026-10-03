"use client";

import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import { DEFAULT_THRESHOLDS, emptyLevels, type Level, type LevelHours, type Thresholds } from "@/lib/budget";

export type ReportRow = { project_id: string | null; task_id: string | null; user_id: string; seconds: number };
export type BudgetRow = { task_id: string } & LevelHours;

/**
 * One project's budget (hours per task and level), each person's level on
 * it, all-time logged hours per task and person, and who last changed the
 * budget. Directors and managers only (the database enforces it).
 */
export function useProjectBudget(projectId: string) {
  const [budgets, setBudgets] = useState<Map<string, LevelHours>>(new Map());
  const [levels, setLevels] = useState<Map<string, Level>>(new Map());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [meta, setMeta] = useState<{ updated_at: string; updated_by: string | null } | null>(null);
  const [thresholds, setThresholdsState] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const db = sb();
    const [b, l, m, r] = await Promise.all([
      db.from("task_budgets").select("task_id,level,hours,tasks!inner(project_id)").eq("tasks.project_id", projectId),
      db.from("project_levels").select("user_id,level").eq("project_id", projectId),
      db
        .from("project_budgets")
        .select("updated_at,updated_by,warn_pct,over_pct")
        .eq("project_id", projectId)
        .maybeSingle(),
      db.rpc("time_report", { only_project: projectId }),
    ]);
    if (b.error || l.error || m.error || r.error) {
      toast("Couldn't load this project's budget.");
      return;
    }
    const map = new Map<string, LevelHours>();
    for (const x of b.data as { task_id: string; level: Level; hours: number }[]) {
      const h = map.get(x.task_id) ?? emptyLevels();
      h[x.level] = Number(x.hours);
      map.set(x.task_id, h);
    }
    setBudgets(map);
    setLevels(new Map((l.data as { user_id: string; level: Level }[]).map((x) => [x.user_id, x.level])));
    setMeta(m.data ? { updated_at: m.data.updated_at, updated_by: m.data.updated_by } : null);
    setThresholdsState(
      m.data ? { warn: Number(m.data.warn_pct), over: Number(m.data.over_pct) } : DEFAULT_THRESHOLDS
    );
    setRows((r.data as ReportRow[]) ?? []);
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  /** One cell; 0 clears it. */
  const setCell = async (taskId: string, level: Level, hours: number) => {
    setBudgets((cur) => {
      const next = new Map(cur);
      next.set(taskId, { ...(cur.get(taskId) ?? emptyLevels()), [level]: hours });
      return next;
    });
    const { error } = await sb().rpc("set_task_budget", { p_task: taskId, p_level: level, p_hours: hours });
    if (error) toast("Couldn't save that budget change.");
    load();
  };

  /** Replace the whole budget (used by import). */
  const replaceAll = async (budgetRows: BudgetRow[]) => {
    const { error } = await sb().rpc("replace_project_budget", { p_project: projectId, p_rows: budgetRows });
    if (error) {
      toast("Couldn't save the budget.");
      return false;
    }
    await load();
    return true;
  };

  /** Yellow and red lines for this project, in % of budget. */
  const setThresholds = async (t: Thresholds) => {
    setThresholdsState(t);
    const { error } = await sb()
      .from("project_budgets")
      .upsert({ project_id: projectId, warn_pct: t.warn, over_pct: t.over }, { onConflict: "project_id" });
    if (error) {
      toast("Couldn't save the thresholds.");
      load();
    }
  };

  return { loaded, budgets, levels, rows, meta, thresholds, reload: load, setCell, replaceAll, setThresholds };
}

/** Replace a project's budget without the page hook (import from elsewhere). */
export async function saveProjectBudget(projectId: string, budgetRows: BudgetRow[]) {
  const { error } = await sb().rpc("replace_project_budget", { p_project: projectId, p_rows: budgetRows });
  if (error) toast("Couldn't save the budget.");
  return !error;
}
