/**
 * Labels the app writes itself from what an action will do. Grammar: a verb,
 * then the object, then a count, time or target; sentence case; four words at
 * most. These are the fallback whenever the agent's own label is missing or
 * turned down, so they must always be right.
 */
import type { EditKind } from "./types.ts";

/** "0:42", "1:05". Positions on the timeline. */
export function at(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One edit kind as a verb phrase for a single note. */
const SINGLE: Record<EditKind, string> = {
  zoom: "Apply zoom", blur: "Apply blur", callout: "Add callout", speed: "Retime", cut: "Cut",
  style: "Apply style", shot: "Change shot", audio: "Fix audio", text: "Edit text", overlay: "Add overlay",
};
/** The same kind, counted. */
const MANY: Record<EditKind, [string, string]> = {
  zoom: ["zoom", "zooms"], blur: ["blur", "blurs"], callout: ["callout", "callouts"], speed: ["speed change", "speed changes"],
  cut: ["cut", "cuts"], style: ["style change", "style changes"], shot: ["shot", "shots"], audio: ["audio fix", "audio fixes"],
  text: ["text edit", "text edits"], overlay: ["overlay", "overlays"],
};

export interface NoteLike { at: number; intents: EditKind[] }

/**
 * The Apply key for open notes.
 *   one note, one kind   "Apply zoom at 0:12", "Cut at 0:42", "Add callout at 1:05"
 *   one kind, many       "Apply 3 zooms"
 *   anything else        "Apply 3 notes", "Apply note at 0:12"
 */
export function notesLabel(notes: NoteLike[]) {
  if (!notes.length) return "Apply notes";
  if (notes.length === 1) {
    const n = notes[0]!;
    return n.intents.length === 1 ? `${SINGLE[n.intents[0]!]} at ${at(n.at)}` : `Apply note at ${at(n.at)}`;
  }
  const kinds = new Set(notes.flatMap((n) => n.intents));
  if (kinds.size === 1 && notes.every((n) => n.intents.length === 1)) {
    const [one, many] = MANY[[...kinds][0]!];
    return `Apply ${notes.length} ${many ?? one}`;
  }
  return `Apply ${plural(notes.length, "note")}`;
}

/** A single note card's own key, next to its time: "Apply zoom", "Cut", "Add callout"; "Apply" for mixed notes. */
export function noteActionLabel(intents: EditKind[]) {
  return intents.length === 1 ? SINGLE[intents[0]!] : "Apply";
}

/** The plan's main key: "Run 5 edits" → "Run again"; a failed step → "Retry from step 3". */
export function planLabel(status: "draft" | "running" | "done" | "failed", steps: number, failedAt?: number) {
  if (status === "failed" && failedAt !== undefined) return `Retry from step ${failedAt + 1}`;
  if (status === "done") return "Run again";
  return steps ? `Run ${plural(steps, "edit")}` : "Run plan";
}

/** Verbs and objects for the write tools that need a yes. */
const TOOL_ACTION: Record<string, [verb: string, object: string]> = {
  add_zoom: ["Add", "zoom"],
  add_overlay: ["Add", "callout"],
  set_motion: ["Retune", "camera"],
  remove_zoom: ["Remove", "zoom"],
  replace_audio: ["Replace", "audio"],
  export_overwrite: ["Overwrite", "export"],
  delete_takes: ["Delete", "takes"],
  delete_clip: ["Delete", "clip"],
  cut: ["Cut", "section"],
  trim: ["Trim", "recording"],
  upload: ["Upload", "export"],
  send_to_slack: ["Post", "to Slack"],
  set_template: ["Change", "shot"],
};

/**
 * Approve and deny for a tool that needs a yes: "Replace audio" / "Keep current",
 * "Delete 3 takes" / "Keep takes". Unknown tools fall back to "Approve".
 */
export function approvalLabels(tool: string, count?: number) {
  const name = tool.replace(/^mcp__\w+__/, "");
  const action = TOOL_ACTION[name];
  if (!action) return { approve: "Approve", deny: "Deny" };
  const [verb, object] = action;
  const counted = count && count > 1 && !object.startsWith("to ") ? `${count} ${object}` : object;
  return { approve: `${verb} ${counted}`, deny: object.endsWith("s") && count !== 1 ? `Keep ${object}` : "Keep current" };
}

export type PermissionScope = "once" | "timed" | "always";

/** "Allow once", "Allow for an hour", "Allow for 30 min", "Always allow". */
export function permissionLabel(scope: PermissionScope, minutes = 60) {
  if (scope === "once") return "Allow once";
  if (scope === "always") return "Always allow";
  return minutes === 60 ? "Allow for an hour" : minutes % 60 === 0 ? `Allow for ${minutes / 60} hours` : `Allow for ${minutes} min`;
}

/** Text changes: "Accept 4 changes", "Accept change". */
export function diffLabel(pending: number) {
  return pending === 1 ? "Accept change" : `Accept ${pending} changes`;
}

/** An answer that can become edits: "Apply as 3 edits". */
export function answerLabel(edits: number) {
  return edits === 1 ? "Apply as an edit" : `Apply as ${edits} edits`;
}

/** A suggested shot: "Use Lid Rise". */
export function shotLabel(name: string) {
  return `Use ${name}`;
}

/** Export: "Export 1080p", "Export 4K". */
export function exportLabel(preset = "1080p") {
  return `Export ${preset}`;
}
