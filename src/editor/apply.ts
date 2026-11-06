/**
 * Applying what the agent proposed. The agent has no tools, so it never edits
 * the project itself: it proposes plan steps, the person runs the plan, and
 * the app applies each step here through the store's undoable commands.
 * Every applied step comes back with what it changed and how to revert it.
 */
import type { LedgerEntry } from "@/ui/organisms/agent-ledger";
import type { OverlayKind, Zoom } from "./model";
import { SHOTS, shotById } from "./shots";
import { useEditor } from "./store";

/** What a finished edit needs to be reverted. */
export type UndoRecord =
  | { kind: "remove"; id: string }
  | { kind: "restore-zoom"; zoom: Zoom }
  | { kind: "shot"; template: string }
  | { kind: "motion"; speed: number; amount: number }
  | { kind: "text"; target: string; text: string };

/** Words in the project the agent may rewrite: an overlay's label, a note, the title. */
function readText(target: string): string | undefined {
  const p = useEditor.getState().project;
  const [kind, id] = target.split(":");
  if (kind === "overlay") return p.overlays.find((o) => o.id === id)?.label;
  if (kind === "note") return p.notes.find((n) => n.id === id)?.text;
  if (kind === "title") return p.name;
  return undefined;
}

function writeText(target: string, text: string) {
  const [kind, id] = target.split(":");
  useEditor.getState().edit("Edit text", (p) =>
    kind === "overlay" ? { ...p, overlays: p.overlays.map((o) => (o.id === id ? { ...o, label: text } : o)) }
    : kind === "note" ? { ...p, notes: p.notes.map((n) => (n.id === id ? { ...n, text } : n)) }
    : kind === "title" ? { ...p, name: text }
    : p);
}

export function runUndo(u: UndoRecord) {
  const editor = useEditor.getState();
  if (u.kind === "text") writeText(u.target, u.text);
  else if (u.kind === "remove") editor.removeItem(u.id);
  else if (u.kind === "restore-zoom") editor.addZoom({ start: u.zoom.start, end: u.zoom.end, scale: u.zoom.scale, target: u.zoom.target, author: u.zoom.author });
  else if (u.kind === "shot") editor.setTemplate(u.template);
  else editor.setMotion({ speed: u.speed, amount: u.amount });
}

/** A step as the agent proposes it: a tool name and its arguments. */
export interface ProposedStep {
  id: string;
  title: string;
  tool: string;
  args?: Record<string, unknown>;
}

export type StepRisk = "safe" | "risky" | "unsupported";

/** The edits the app can apply, with their risk for the Autonomy dial. */
export const STEP_TOOLS: Record<string, { label: string; detail: string; risk: Exclude<StepRisk, "unsupported">; name: string }> = {
  add_zoom: { label: "Add zooms", detail: "Push in on what you pointed at", risk: "safe", name: "Zoom" },
  add_overlay: { label: "Add callouts and overlays", detail: "Callouts, highlights, blurs, arrows, text", risk: "safe", name: "Callout" },
  set_motion: { label: "Retune the camera", detail: "Speed and amount of the shot's movement", risk: "safe", name: "Camera" },
  set_shot: { label: "Change the shot", detail: "Swap the shot the recording sits in", risk: "risky", name: "Shot" },
  remove_zoom: { label: "Remove zooms", detail: "Take out auto or agent zooms", risk: "risky", name: "Zoom" },
};

/** Tools the agent might name that the app can't apply yet, with the reason in plain words. */
const NOT_YET: Record<string, string> = {
  cut: "Cutting isn't available yet",
  set_speed: "Changing speed isn't available yet",
  trim: "Trimming isn't available yet",
};

export const stepRisk = (tool: string): StepRisk => STEP_TOOLS[tool]?.risk ?? "unsupported";
export const stepName = (tool: string) => STEP_TOOLS[tool]?.name ?? tool.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Where a step acts, for the plan's time column and the ledger. */
export function stepRange(args: Record<string, unknown> | undefined): { from?: number; to?: number } {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return { from: n(args?.start) ?? n(args?.at), to: n(args?.end) };
}

export type StepOutcome =
  | { ok: true; summary: string; entry: Omit<LedgerEntry, "id" | "at">; undo: UndoRecord[] }
  | { ok: false; error: string };

const OVERLAYS: OverlayKind[] = ["callout", "highlight", "blur", "arrow", "text", "keys"];
const num = (v: unknown, fallback?: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Applies one step. Never throws: a step that can't be applied says why. */
export function applyStep(step: ProposedStep): StepOutcome {
  const editor = useEditor.getState();
  const a = step.args ?? {};
  const duration = editor.project.duration;
  const span = (): [number, number] | null => {
    const start = num(a.start), end = num(a.end);
    if (start === undefined || end === undefined || end <= start) return null;
    return [Math.max(0, start), Math.min(duration, end)];
  };
  switch (step.tool) {
    case "add_zoom": {
      const s = span();
      if (!s) return { ok: false, error: "The zoom has no start and end" };
      const t = a.target as { x?: unknown; y?: unknown } | undefined;
      const target = { x: Math.min(1, Math.max(0, num(t?.x, 0.5)!)), y: Math.min(1, Math.max(0, num(t?.y, 0.5)!)) };
      const scale = Math.min(4, Math.max(1.05, num(a.scale, 1.6)!));
      const id = editor.addZoom({ start: s[0], end: s[1], scale, target, author: "agent" });
      return { ok: true, summary: `zoom ${id} at ${scale}× from ${s[0]}s to ${s[1]}s`, entry: { action: "Zoom", target: step.title, position: s, detail: `${scale}×` }, undo: [{ kind: "remove", id }] };
    }
    case "add_overlay": {
      const s = span();
      if (!s) return { ok: false, error: "The overlay has no start and end" };
      const kind = OVERLAYS.includes(a.kind as OverlayKind) ? (a.kind as OverlayKind) : "callout";
      const label = typeof a.label === "string" && a.label.trim() ? a.label.trim() : step.title;
      const id = editor.addOverlay({ kind, start: s[0], end: s[1], label, author: "agent" });
      return { ok: true, summary: `${kind} ${id} "${label}" from ${s[0]}s to ${s[1]}s`, entry: { action: kind.charAt(0).toUpperCase() + kind.slice(1), target: label, position: s }, undo: [{ kind: "remove", id }] };
    }
    case "set_shot": {
      const wanted = String(a.shot ?? a.id ?? "");
      const shot = SHOTS.find((x) => x.id === wanted) ?? SHOTS.find((x) => x.name.toLowerCase() === wanted.toLowerCase());
      if (!shot) return { ok: false, error: `There's no shot called "${wanted}"` };
      const prev = editor.project.template;
      editor.setTemplate(shot.id);
      return { ok: true, summary: `shot is now ${shot.id}`, entry: { action: "Shot", target: "Whole video", change: [shotById(prev).name, shot.name] }, undo: [{ kind: "shot", template: prev }] };
    }
    case "set_motion": {
      const prev = editor.project.motion;
      const speed = Math.min(3, Math.max(0.25, num(a.speed, prev.speed)!));
      const amount = Math.min(2, Math.max(0, num(a.amount, prev.amount)!));
      editor.setMotion({ speed, amount });
      return { ok: true, summary: `camera speed ${speed}, amount ${amount}`, entry: { action: "Camera", target: "Shot motion", change: [`${prev.speed}× · ${Math.round(prev.amount * 100)}%`, `${speed}× · ${Math.round(amount * 100)}%`] }, undo: [{ kind: "motion", speed: prev.speed, amount: prev.amount }] };
    }
    case "remove_zoom": {
      const s = span();
      if (!s) return { ok: false, error: "No time range to remove zooms from" };
      // Zooms you made yourself are never removed by the agent.
      const gone = editor.project.zooms.filter((z) => z.author !== "user" && z.start < s[1] && z.end > s[0]);
      if (!gone.length) return { ok: false, error: "No auto or agent zoom there" };
      for (const z of gone) editor.removeItem(z.id);
      return { ok: true, summary: `removed ${gone.length} zoom${gone.length > 1 ? "s" : ""}`, entry: { action: "Zoom", target: step.title, position: s, detail: `Removed ${gone.length}` }, undo: gone.map((zoom) => ({ kind: "restore-zoom" as const, zoom })) };
    }
    case "set_text": {
      const target = String(a.target ?? "");
      const prev = readText(target);
      if (prev === undefined) return { ok: false, error: "That text isn't in the project" };
      const text = String(a.text ?? "");
      writeText(target, text);
      const what = target.startsWith("overlay") ? "Overlay" : target.startsWith("note") ? "Note" : "Title";
      return { ok: true, summary: `${target} now reads "${text}"`, entry: { action: "Text", target: what, change: [prev, text] }, undo: [{ kind: "text", target, text: prev }] };
    }
    default:
      return { ok: false, error: NOT_YET[step.tool] ?? `"${step.tool}" isn't something the app can apply` };
  }
}
