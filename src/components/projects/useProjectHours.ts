"use client";

import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import { fetchAll } from "@/lib/fetchAll";

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
    const rows = await fetchAll((from, to) =>
      sb()
        .from("time_entries")
        .select("id,project_id,task_id,start_at,end_at")
        .not("end_at", "is", null)
        .not("project_id", "is", null)
        .order("id")
        .range(from, to)
    );
    if (!rows) {
      toast("Couldn't load project hours.");
      return;
    }
    const byProject = new Map<string, number>();
    const byTask = new Map<string, number>();
    for (const e of rows) {
      const secs = (new Date(e.end_at!).getTime() - new Date(e.start_at).getTime()) / 1000;
      byProject.set(e.project_id!, (byProject.get(e.project_id!) ?? 0) + secs);
      if (e.task_id) byTask.set(e.task_id, (byTask.get(e.task_id) ?? 0) + secs);
    }
    setHours({ byProject, byTask });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { hours, reload: load };
}
