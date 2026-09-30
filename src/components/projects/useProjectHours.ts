"use client";

import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";

export type Hours = {
  /** Seconds of stopped time per project id and per task id. */
  byProject: Map<string, number>;
  byTask: Map<string, number>;
};

/**
 * All-time hours per project and task, added up in the database
 * (project_hours() in migration 002). Boss and managers get everyone's
 * totals; anyone else only their own. Running timers are left out.
 */
export function useProjectHours() {
  const [hours, setHours] = useState<Hours | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb().rpc("project_hours");
    if (error) {
      toast("Couldn't load project hours.");
      return;
    }
    const byProject = new Map<string, number>();
    const byTask = new Map<string, number>();
    for (const r of (data ?? []) as { project_id: string; task_id: string | null; seconds: number }[]) {
      byProject.set(r.project_id, (byProject.get(r.project_id) ?? 0) + r.seconds);
      if (r.task_id) byTask.set(r.task_id, (byTask.get(r.task_id) ?? 0) + r.seconds);
    }
    setHours({ byProject, byTask });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { hours, reload: load };
}
