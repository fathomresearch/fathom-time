"use client";

import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import type { Alias, MatchPerson } from "@/lib/importMatch";
import type { ImportSource } from "@/lib/importParse";
import type { Role } from "@/lib/types";

export type ImportPerson = MatchPerson & { role: Role; active: boolean };
export type Mapping = { source: ImportSource; kind: "client" | "project" | "task"; source_key: string; target_id: string | null };

/** Everyone (including former members), remembered name/email matches, and remembered project matches. */
export function useImportData() {
  const [people, setPeople] = useState<ImportPerson[]>([]);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const db = sb();
    const [p, a, m] = await Promise.all([
      db.from("profiles").select("id,name,email,role,active,has_login,merged_into").order("name"),
      db.from("person_aliases").select("user_id,source,kind,alias"),
      db.from("import_mappings").select("source,kind,source_key,target_id"),
    ]);
    if (p.error || a.error || m.error) {
      toast("Couldn't load import settings. Has migration 007 been run?");
      return;
    }
    setPeople(p.data as ImportPerson[]);
    setAliases(a.data as Alias[]);
    setMappings(m.data as Mapping[]);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  /** Remember which Fathom Time person a file's name / email belongs to. */
  const saveAliases = async (rows: Alias[]) => {
    if (!rows.length) return true;
    const { error } = await sb()
      .from("person_aliases")
      .upsert(rows, { onConflict: "source,kind,alias" });
    if (error) toast("Couldn't save the people matches.");
    return !error;
  };

  /** Remember which client / project / task a file's name belongs to. */
  const saveMappings = async (rows: Mapping[]) => {
    if (!rows.length) return true;
    const { error } = await sb()
      .from("import_mappings")
      .upsert(rows, { onConflict: "source,kind,source_key" });
    if (error) toast("Couldn't save the project matches.");
    return !error;
  };

  return { loaded, people, aliases, mappings, reload: load, saveAliases, saveMappings };
}
