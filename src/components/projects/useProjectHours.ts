"use client";

import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";

const PAGE = 1000; // Supabase returns at most 1000 rows per request.

export type Hours = {
  /** Seconds of stopped time per project id and per task id. */
  byProject: Map<string, number>;
  byTask: Map<string, number>;
};

/**
 * All-time hours per project and task. Row-level security decides whose
 * time counts: the boss gets everyone's, an employee only their own.
 * Running timers are left out.
 */
export function useProjectHours() {
  const [hours, setHours] = useState<Hours | null>(null);

  const load = useCallback(async () => {
    const byProject = new Map<string, number>();
    const byTask = new Map<string, number>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb()
        .from("time_entries")
        .select("id,project_id,task_id,start_at,end_at")
        .not("end_at", "is", null)
        .not("project_id", "is", null)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) {
        toast("Couldn't load project hours.");
        return;
      }
      for (const e of data ?? []) {
        const secs = (new Date(e.end_at!).getTime() - new Date(e.start_at).getTime()) / 1000;
        byProject.set(e.project_id!, (byProject.get(e.project_id!) ?? 0) + secs);
        if (e.task_id) byTask.set(e.task_id, (byTask.get(e.task_id) ?? 0) + secs);
      }
      if ((data ?? []).length < PAGE) break;
    }
    setHours({ byProject, byTask });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { hours, reload: load };
}
