"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import {
  PROJECT_COLORS,
  STANDARD_STAGES,
  type Client,
  type PersonName,
  type Project,
  type Tag,
  type Task,
} from "@/lib/data";

export type NewProjectInput = {
  name: string;
  type: "client" | "internal";
  clientId: string | null;
  newClientName: string | null;
  addStages: boolean;
};

export type ProjectPatch = Partial<
  Pick<Project, "name" | "color" | "client_id" | "type" | "billable_default" | "archived">
>;

/** Projects, clients, tasks, tags, favorites and names, plus ways to add to them. */
export function useCatalog(viewerId: string) {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<PersonName[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const db = sb();
    const [c, p, t, g, f, pe] = await Promise.all([
      db.from("clients").select("id,name,archived").order("name"),
      db.from("projects").select("id,name,client_id,color,type,billable_default,archived,created_by").order("name"),
      db.from("tasks").select("id,project_id,name,archived,sort_order").order("sort_order").order("name"),
      db.from("tags").select("id,name").order("name"),
      db.from("favorites").select("project_id").eq("user_id", viewerId),
      db.from("profiles").select("id,name,email"),
    ]);
    const err = c.error || p.error || t.error || g.error || f.error || pe.error;
    if (err) toast("Couldn't load projects and tags. Reload the page.");
    setClients(c.data ?? []);
    setProjects((p.data as Project[]) ?? []);
    setTasks(t.data ?? []);
    setTags(g.data ?? []);
    setFavorites(new Set((f.data ?? []).map((x) => x.project_id)));
    setPeople(pe.data ?? []);
    setLoaded(true);
  }, [viewerId]);

  useEffect(() => {
    // Initial load; reload() only sets state after the network returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const maps = useMemo(() => {
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const tagById = new Map(tags.map((t) => [t.id, t]));
    const personById = new Map(people.map((p) => [p.id, p]));
    const tasksByProject = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.archived) continue;
      const list = tasksByProject.get(t.project_id) ?? [];
      list.push(t);
      tasksByProject.set(t.project_id, list);
    }
    return { projectById, clientById, taskById, tagById, personById, tasksByProject };
  }, [projects, clients, tasks, tags, people]);

  const toggleFavorite = useCallback(
    async (projectId: string) => {
      const isFav = favorites.has(projectId);
      setFavorites((cur) => {
        const next = new Set(cur);
        if (isFav) next.delete(projectId);
        else next.add(projectId);
        return next;
      });
      const db = sb();
      const { error } = isFav
        ? await db.from("favorites").delete().eq("user_id", viewerId).eq("project_id", projectId)
        : await db.from("favorites").insert({ user_id: viewerId, project_id: projectId });
      if (error) {
        toast("Couldn't update favorites.");
        reload();
      }
    },
    [favorites, viewerId, reload]
  );

  const createTask = useCallback(
    async (projectId: string, name: string, sortOrder = 100): Promise<Task | null> => {
      const clean = name.trim();
      if (!clean) return null;
      const existing = tasks.find(
        (t) => t.project_id === projectId && t.name.toLowerCase() === clean.toLowerCase()
      );
      if (existing) return existing;
      const { data, error } = await sb()
        .from("tasks")
        .insert({ project_id: projectId, name: clean, sort_order: sortOrder })
        .select("id,project_id,name,archived,sort_order")
        .single();
      if (error || !data) {
        toast("Couldn't create that task.");
        return null;
      }
      setTasks((cur) => [...cur, data]);
      return data;
    },
    [tasks]
  );

  const createTag = useCallback(
    async (name: string): Promise<Tag | null> => {
      const clean = name.trim();
      if (!clean) return null;
      const existing = tags.find((t) => t.name.toLowerCase() === clean.toLowerCase());
      if (existing) return existing;
      const { data, error } = await sb().from("tags").insert({ name: clean }).select("id,name").single();
      if (error || !data) {
        toast("Couldn't create that tag.");
        return null;
      }
      setTags((cur) => [...cur, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    },
    [tags]
  );

  const renameTag = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const clean = name.trim();
      if (!clean) return false;
      if (tags.some((t) => t.id !== id && t.name.toLowerCase() === clean.toLowerCase())) {
        toast(`A tag called "${clean}" already exists.`);
        return false;
      }
      const before = tags;
      setTags((cur) =>
        cur.map((t) => (t.id === id ? { ...t, name: clean } : t)).sort((a, b) => a.name.localeCompare(b.name))
      );
      const { error } = await sb().from("tags").update({ name: clean }).eq("id", id);
      if (error) {
        setTags(before);
        toast("Couldn't rename that tag.");
        return false;
      }
      return true;
    },
    [tags]
  );

  const deleteTag = useCallback(
    async (id: string): Promise<boolean> => {
      const before = tags;
      setTags((cur) => cur.filter((t) => t.id !== id));
      const { error } = await sb().from("tags").delete().eq("id", id);
      if (error) {
        setTags(before);
        toast("Couldn't delete that tag.");
        return false;
      }
      return true;
    },
    [tags]
  );

  /** A new client, or the existing one with the same name. */
  const createClient = useCallback(
    async (name: string): Promise<Client | null> => {
      const clean = name.trim();
      if (!clean) return null;
      const existing = clients.find((c) => c.name.toLowerCase() === clean.toLowerCase());
      if (existing) return existing;
      const { data, error } = await sb().from("clients").insert({ name: clean }).select("id,name,archived").single();
      if (error || !data) {
        toast("Couldn't create that client.");
        return null;
      }
      setClients((cur) => [...cur, data].sort((a, b) => a.name.localeCompare(b.name)));
      return data;
    },
    [clients]
  );

  const updateClient = useCallback(
    async (id: string, patch: { name?: string; archived?: boolean }): Promise<boolean> => {
      if (patch.name !== undefined) {
        const clean = patch.name.trim();
        if (!clean) return false;
        if (clients.some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase())) {
          toast(`A client called "${clean}" already exists.`);
          return false;
        }
        patch = { ...patch, name: clean };
      }
      setClients((cur) =>
        cur.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
      const { error } = await sb().from("clients").update(patch).eq("id", id);
      if (error) {
        toast("Couldn't save that change to the client.");
        reload();
        return false;
      }
      return true;
    },
    [clients, reload]
  );

  /** Its projects stay, with no client (the database sets client_id to null). */
  const deleteClient = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await sb().from("clients").delete().eq("id", id);
    if (error) {
      toast("Couldn't delete that client.");
      return false;
    }
    setClients((cur) => cur.filter((c) => c.id !== id));
    setProjects((cur) => cur.map((p) => (p.client_id === id ? { ...p, client_id: null } : p)));
    return true;
  }, []);

  const createProject = useCallback(
    async (input: NewProjectInput): Promise<Project | null> => {
      const db = sb();
      let clientId = input.type === "client" ? input.clientId : null;

      if (input.type === "client" && input.newClientName?.trim()) {
        const client = await createClient(input.newClientName);
        if (!client) return null;
        clientId = client.id;
      }

      const used = new Set(projects.filter((p) => !p.archived).map((p) => p.color));
      const color =
        PROJECT_COLORS.find((c) => !used.has(c)) ??
        PROJECT_COLORS[projects.length % PROJECT_COLORS.length];

      const { data: project, error } = await db
        .from("projects")
        .insert({
          name: input.name.trim(),
          client_id: clientId,
          type: input.type,
          billable_default: input.type === "client",
          color,
        })
        .select("id,name,client_id,color,type,billable_default,archived,created_by")
        .single();
      if (error || !project) {
        toast("Couldn't create that project.");
        return null;
      }
      setProjects((cur) => [...cur, project as Project].sort((a, b) => a.name.localeCompare(b.name)));

      if (input.type === "client" && input.addStages) {
        const { data: stageRows, error: stageErr } = await db
          .from("tasks")
          .insert(STANDARD_STAGES.map((name, i) => ({ project_id: project.id, name, sort_order: i + 1 })))
          .select("id,project_id,name,archived,sort_order");
        if (stageErr) toast("Project created, but the stages couldn't be added.");
        else setTasks((cur) => [...cur, ...(stageRows ?? [])]);
      }
      return project as Project;
    },
    [createClient, projects]
  );

  const updateProject = useCallback(
    async (id: string, patch: ProjectPatch): Promise<boolean> => {
      if (patch.name !== undefined) {
        patch = { ...patch, name: patch.name.trim() };
        if (!patch.name) return false;
      }
      setProjects((cur) =>
        cur.map((p) => (p.id === id ? { ...p, ...patch } : p)).sort((a, b) => a.name.localeCompare(b.name))
      );
      const { error } = await sb().from("projects").update(patch).eq("id", id);
      if (error) {
        toast("Couldn't save that change to the project.");
        reload();
        return false;
      }
      return true;
    },
    [reload]
  );

  const deleteProject = useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await sb().from("projects").delete().eq("id", id);
      if (error) {
        // 23503: time entries still point at it.
        toast(error.code === "23503" ? "This project has time. Archive it instead." : "Couldn't delete that project.");
        return false;
      }
      setProjects((cur) => cur.filter((p) => p.id !== id));
      setTasks((cur) => cur.filter((t) => t.project_id !== id));
      return true;
    },
    []
  );

  const updateTask = useCallback(
    async (id: string, patch: { name?: string; archived?: boolean }): Promise<boolean> => {
      if (patch.name !== undefined) {
        const clean = patch.name.trim();
        const task = tasks.find((t) => t.id === id);
        if (!clean || !task) return false;
        const clash = tasks.some(
          (t) => t.id !== id && t.project_id === task.project_id && t.name.toLowerCase() === clean.toLowerCase()
        );
        if (clash) {
          toast(`This project already has a task called "${clean}".`);
          return false;
        }
        patch = { ...patch, name: clean };
      }
      setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      const { error } = await sb().from("tasks").update(patch).eq("id", id);
      if (error) {
        toast("Couldn't save that change to the task.");
        reload();
        return false;
      }
      return true;
    },
    [tasks, reload]
  );

  const deleteTask = useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await sb().from("tasks").delete().eq("id", id);
      if (error) {
        toast(error.code === "23503" ? "This task has time. Archive it instead." : "Couldn't delete that task.");
        return false;
      }
      setTasks((cur) => cur.filter((t) => t.id !== id));
      return true;
    },
    []
  );

  return {
    loaded,
    clients,
    projects,
    tasks,
    tags,
    favorites,
    people,
    ...maps,
    reload,
    toggleFavorite,
    createTask,
    createTag,
    renameTag,
    deleteTag,
    createClient,
    updateClient,
    deleteClient,
    createProject,
    updateProject,
    deleteProject,
    updateTask,
    deleteTask,
  };
}

export type Catalog = ReturnType<typeof useCatalog>;
