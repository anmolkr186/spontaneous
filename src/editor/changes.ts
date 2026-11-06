/**
 * What the agent changed, for the Changes tab: a ledger of every applied edit
 * (each with Undo) and checkpoints you can rewind to. Lives beside the agent
 * store; the agent records into it, the Changes tab reads it.
 */
import { create } from "zustand";
import type { LedgerEntry } from "@/ui/organisms/agent-ledger";
import type { Checkpoint } from "@/ui/organisms/agent-checkpoints";
import { uid } from "./model";
import type { Project } from "./model";
import { applyStep, runUndo } from "./apply";
import type { ProposedStep, UndoRecord } from "./apply";
import { useEditor } from "./store";

export interface LedgerItem extends LedgerEntry {
  /** How to take it back, in order. */
  undo: UndoRecord[];
  /** The step that made it, to apply it again on Redo. */
  step: ProposedStep;
}

interface Saved extends Checkpoint { snapshot: Project }

interface ChangesState {
  ledger: LedgerItem[];
  undone: string[];
  checkpoints: Saved[];
  head: string | null;
  record: (step: ProposedStep, entry: Omit<LedgerEntry, "id" | "at">, undo: UndoRecord[]) => string;
  undo: (ids: string[]) => void;
  redo: (ids: string[]) => void;
  /** Save a version after a run that changed the project. `before` is the project as the run found it. */
  checkpoint: (title: string, edits: number, before: Project) => void;
  /** Go back to a version. The project is restored and the next run branches from there. */
  rewind: (id: string) => void;
}

/** When this session's agent work began; checkpoints show their time from here. */
const began = Date.now();

export const useChanges = create<ChangesState>((set, get) => ({
  ledger: [],
  undone: [],
  checkpoints: [],
  head: null,

  record: (step, entry, undo) => {
    const id = uid("c");
    set((s) => ({ ledger: [...s.ledger, { ...entry, id, at: Date.now(), undo, step }] }));
    return id;
  },

  undo: (ids) => {
    // Newest first, so later edits come off before the ones they sit on.
    const items = get().ledger.filter((l) => ids.includes(l.id) && !get().undone.includes(l.id)).sort((a, b) => b.at - a.at);
    for (const item of items) for (const u of [...item.undo].reverse()) runUndo(u);
    set((s) => ({ undone: [...s.undone, ...items.map((i) => i.id)] }));
  },

  redo: (ids) => {
    const items = get().ledger.filter((l) => ids.includes(l.id) && get().undone.includes(l.id)).sort((a, b) => a.at - b.at);
    const replaced = new Map<string, UndoRecord[]>();
    for (const item of items) {
      const outcome = applyStep(item.step);
      if (outcome.ok) replaced.set(item.id, outcome.undo);
    }
    set((s) => ({
      undone: s.undone.filter((id) => !replaced.has(id)),
      ledger: s.ledger.map((l) => (replaced.has(l.id) ? { ...l, undo: replaced.get(l.id)! } : l)),
    }));
  },

  checkpoint: (title, edits, before) => {
    const project = useEditor.getState().project;
    const at = Math.round((Date.now() - began) / 1000);
    set((s) => {
      // The first version is the project before the agent touched it, so there's always a way back.
      const root: Saved[] = s.checkpoints.length ? [] : [{ id: uid("k"), title: "Before the agent", at: 0, edits: 0, status: "done", snapshot: before }];
      const parent = s.head ?? root[0]?.id ?? s.checkpoints.at(-1)?.id;
      const next: Saved = { id: uid("k"), title, parent, at, edits, status: "done", snapshot: project };
      return { checkpoints: [...s.checkpoints, ...root, next], head: next.id };
    });
  },

  rewind: (id) => {
    const target = get().checkpoints.find((c) => c.id === id);
    if (!target) return;
    useEditor.getState().loadProject(target.snapshot);
    // Edits made after this version are gone from the project; the ledger says so.
    const at = began + (target.at ?? 0) * 1000;
    set((s) => ({ head: id, undone: [...new Set([...s.undone, ...s.ledger.filter((l) => l.at > at).map((l) => l.id)])] }));
  },
}));
