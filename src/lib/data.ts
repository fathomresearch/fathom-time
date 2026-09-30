// Shapes of the rows the app reads, and shared constants.

export type Client = { id: string; name: string; archived: boolean };

export type Project = {
  id: string;
  name: string;
  client_id: string | null;
  color: string;
  type: "client" | "internal";
  billable_default: boolean;
  archived: boolean;
  created_by: string | null;
};

export type Task = {
  id: string;
  project_id: string;
  name: string;
  archived: boolean;
  sort_order: number;
};

export type Tag = { id: string; name: string };

export type PersonName = { id: string; name: string; email: string };

export type Entry = {
  id: string;
  user_id: string;
  description: string;
  project_id: string | null;
  task_id: string | null;
  billable: boolean;
  start_at: string;
  end_at: string | null;
  updated_by: string | null;
  updated_at: string;
  tag_ids: string[];
};

export const ENTRY_SELECT =
  "id,user_id,description,project_id,task_id,billable,start_at,end_at,updated_by,updated_at,time_entry_tags(tag_id)";

type EntryRow = Omit<Entry, "tag_ids"> & { time_entry_tags: { tag_id: string }[] | null };

export function toEntry(row: EntryRow): Entry {
  const { time_entry_tags, ...rest } = row;
  return { ...rest, tag_ids: (time_entry_tags ?? []).map((t) => t.tag_id) };
}

export const STANDARD_STAGES = [
  "Survey Programming",
  "Fieldwork / Data",
  "Analysis",
  "Deck",
  "Reporting",
  "PM / Client Comms",
];

// 10 project colors. Tuned to sit next to the Fathom palette.
export const PROJECT_COLORS = [
  "#00D6B3", "#2274F8", "#3A3556", "#E0A526", "#D93F45",
  "#7B61FF", "#1B998B", "#F2784B", "#5C7C99", "#B5446E",
];

/** What an entry needs from the bar: description, project, task, tags, billable. */
export type Draft = {
  description: string;
  project_id: string | null;
  task_id: string | null;
  tag_ids: string[];
  billable: boolean;
};

export const EMPTY_DRAFT: Draft = {
  description: "",
  project_id: null,
  task_id: null,
  tag_ids: [],
  billable: false,
};
