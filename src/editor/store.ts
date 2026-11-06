import { create } from "zustand";
import { mockProject, uid } from "./model";
import { defaultSpan, shotById } from "./shots";
import { isTauri } from "@/platform/tauri";

/** The desktop app always starts a new, empty project; the browser build shows the sample for development. */
const initialProject = isTauri ? { ...mockProject, name: "New project", folder: "Recordings", clips: [], zooms: [], overlays: [], notes: [] } : mockProject;
import type { BackgroundId, Note, Overlay, Project, Seconds, TemplateId, Zoom } from "./model";

export type InspectorTab = "template" | "style" | "cursor" | "motion" | "audio";
export type SideTab = "agent" | "notes" | "changes";
export type DockTool = "pointer" | "pen" | "region";
/** Lite: stage, notes and the agent. Studio: adds the inspector and the full timeline. */
export type EditorMode = "lite" | "studio";

interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];

  time: Seconds;
  playing: boolean;
  selection: string | null;
  inspector: InspectorTab;
  side: SideTab;
  tool: DockTool;
  /** Timeline zoom: 1 fits the whole project into the timeline's width, 12 is twelve times closer. */
  zoomLevel: number;
  /** Ink drawn on the frame that has not been attached to a note yet. */
  draft: Pick<Note, "ink" | "region" | "screen"> | null;
  setDraft: (draft: EditorState["draft"]) => void;

  seek: (t: Seconds) => void;
  setPlaying: (playing: boolean) => void;
  select: (id: string | null) => void;
  setInspector: (tab: InspectorTab) => void;
  setSide: (tab: SideTab) => void;
  setTool: (tool: DockTool) => void;
  setZoomLevel: (pps: number) => void;

  /** Every project mutation goes through `edit`, which records undo history. */
  edit: (label: string, fn: (p: Project) => Project) => void;
  undo: () => void;
  redo: () => void;

  /** Choose a shot. The backdrop is yours and stays as it is. */
  setTemplate: (id: TemplateId) => void;
  /** Picking a shot in the library: applies it, and on a clip shows the shot on its own first. */
  chooseShot: (id: TemplateId) => void;
  setMotion: (motion: Partial<Project["motion"]>) => void;
  setSpan: (span: Partial<Project["span"]>) => void;
  setBackground: (id: BackgroundId) => void;
  addZoom: (z: Omit<Zoom, "id">) => string;
  addOverlay: (o: Omit<Overlay, "id">) => string;
  removeItem: (id: string) => void;
  addNote: (n: Omit<Note, "id" | "createdAt" | "status">) => string;
  setNoteStatus: (id: string, status: Note["status"], resolvedBy?: string[]) => void;
  /** Replace the project with a finished recording (not undoable: it's a new document). */
  loadProject: (project: Project) => void;
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;
  /** Which sidebars are open: left is the inspector (Studio), right is the agent and notes. */
  panels: { left: boolean; right: boolean };
  togglePanel: (side: "left" | "right") => void;
  /** Show the shot on its own instead of the clip. Always on when there's no clip. */
  preview: boolean;
  setPreview: (preview: boolean) => void;
}

const HISTORY_LIMIT = 100;

function readPanels(): EditorState["panels"] {
  try { return { left: true, right: true, ...JSON.parse(localStorage.getItem("spontaneous.panels") ?? "{}") }; } catch { return { left: true, right: true }; }
}

function readMode(): EditorMode {
  try { return localStorage.getItem("spontaneous.mode") === "studio" ? "studio" : "lite"; } catch { return "lite"; }
}

export const useEditor = create<EditorState>((set, get) => ({
  project: initialProject,
  past: [],
  future: [],
  time: 12.4,
  playing: false,
  selection: null,
  inspector: "template",
  side: "agent",
  tool: "pointer",
  zoomLevel: 1,
  draft: null,
  setDraft: (draft) => set({ draft }),

  seek: (t) => set({ time: Math.min(Math.max(0, t), get().project.duration) }),
  setPlaying: (playing) => set({ playing }),
  select: (selection) => set({ selection }),
  setInspector: (inspector) => set({ inspector }),
  setSide: (side) => set({ side }),
  setTool: (tool) => set({ tool }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel: Math.min(12, Math.max(1, zoomLevel)) }),

  edit: (_label, fn) => {
    const { project, past } = get();
    const next = fn(project);
    if (next === project) return;
    set({ project: { ...next, revision: project.revision + 1 }, past: [...past, project].slice(-HISTORY_LIMIT), future: [] });
  },
  undo: () => {
    const { past, project, future } = get();
    const prev = past.at(-1);
    if (!prev) return;
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future] });
  },
  redo: () => {
    const { past, project, future } = get();
    const [next, ...rest] = future;
    if (!next) return;
    set({ project: next, past: [...past, project], future: rest });
  },

  // On a clip the span is yours to keep; without one it follows the shot.
  setTemplate: (template) => get().edit("Set shot", (p) => ({ ...p, template, span: p.recording ? p.span : { start: 0, length: defaultSpan(shotById(template)) } })),
  chooseShot: (id) => {
    get().setTemplate(id);
    if (get().project.recording) set({ preview: true });
  },
  setMotion: (motion) => get().edit("Shot motion", (p) => ({ ...p, motion: { ...p.motion, ...motion } })),
  setSpan: (span) => get().edit("Shot span", (p) => ({ ...p, span: { ...p.span, ...span } })),
  setBackground: (background) => get().edit("Set background", (p) => ({ ...p, background })),
  addZoom: (z) => {
    const id = uid("z");
    get().edit("Add zoom", (p) => ({ ...p, zooms: [...p.zooms, { ...z, id }].sort((a, b) => a.start - b.start) }));
    return id;
  },
  addOverlay: (o) => {
    const id = uid("o");
    get().edit("Add overlay", (p) => ({ ...p, overlays: [...p.overlays, { ...o, id }].sort((a, b) => a.start - b.start) }));
    return id;
  },
  removeItem: (id) => {
    get().edit("Remove", (p) => ({
      ...p,
      zooms: p.zooms.filter((z) => z.id !== id),
      overlays: p.overlays.filter((o) => o.id !== id),
      notes: p.notes.filter((n) => n.id !== id),
    }));
    if (get().selection === id) set({ selection: null });
  },
  addNote: (n) => {
    const id = uid("n");
    get().edit("Add note", (p) => ({ ...p, notes: [...p.notes, { ...n, id, status: "open", createdAt: "just now" }] }));
    return id;
  },
  loadProject: (project) => set({ project, past: [], future: [], time: 0, playing: false, selection: null, draft: null, preview: false }),
  preview: false,
  setPreview: (preview) => set({ preview }),
  panels: readPanels(),
  togglePanel: (side) => {
    const panels = { ...get().panels, [side]: !get().panels[side] };
    try { localStorage.setItem("spontaneous.panels", JSON.stringify(panels)); } catch { /* storage unavailable */ }
    set({ panels });
  },
  mode: readMode(),
  setMode: (mode) => {
    try { localStorage.setItem("spontaneous.mode", mode); } catch { /* storage unavailable */ }
    set({ mode });
  },
  setNoteStatus: (id, status, resolvedBy) =>
    get().edit("Note status", (p) => ({
      ...p,
      notes: p.notes.map((n) => (n.id === id ? { ...n, status, resolvedBy: resolvedBy ?? n.resolvedBy } : n)),
    })),
}));

/** The zoom that is active at time t, if any. */
export function activeZoom(project: Project, t: Seconds): Zoom | undefined {
  return project.zooms.find((z) => t >= z.start && t <= z.end);
}
