import { create } from "zustand";
import type { AgentMessage as ThreadMessageLike } from "@/ui/organisms/agent/runtime";
import { formatTime, uid } from "./model";
import type { Note, Zoom } from "./model";
import { useEditor } from "./store";
import { isTauri } from "@/platform/tauri";
import { SHOTS, shotById } from "./shots";
import type { Shot } from "./shots";

/** Read a camera request from plain language. The real agent does this with tools; this is the scripted stand-in. */
function parseShotRequest(text: string): { shot?: Shot; speed?: number; amount?: number } | null {
  const t = text.toLowerCase();
  const shot = SHOTS.find((s) => t.includes(s.name.toLowerCase()));
  const speed = /slower|calmer|gentler/.test(t) ? 0.7 : /faster|snappier|quicker/.test(t) ? 1.35 : undefined;
  const amount = /still|static|no movement/.test(t) ? 0 : /subtle|less|smaller/.test(t) ? 0.6 : /dramatic|more|bigger|wider/.test(t) ? 1.4 : undefined;
  return shot || speed || amount !== undefined ? { shot, speed, amount } : null;
}

/**
 * Phase 1 stand-in for the Claude Code sidecar.
 *
 * The real flow (phase 4): Rust spawns `claude -p --input-format stream-json …`,
 * batches stdout every 16 ms onto a Channel, and this store converts stream-json
 * events into thread messages. Tool calls arrive as MCP calls handled in
 * Rust, which applies them as undoable commands. Here we script that run so the
 * UI can be built against the same message shapes.
 */

type Part = Exclude<ThreadMessageLike["content"], string>[number];
type Msg = ThreadMessageLike & { id: string };

/** What a finished edit needs to be reverted. Kept on the tool result so Undo works from the thread. */
export type UndoRecord =
  | { kind: "remove"; id: string }
  | { kind: "restore-zoom"; zoom: Zoom }
  | { kind: "shot"; template: string }
  | { kind: "motion"; speed: number; amount: number };

/** A run waiting for the agent: applying notes, or a message you sent while it was busy. */
export interface QueuedRun {
  id: string;
  label: string;
  noteIds?: string[];
  text?: string;
}

/** A note as the thread shows it: its pin number and text, so the thread never reads the project. */
export type NoteRef = { id: string; index: number; at: number; text: string };

interface AgentState {
  messages: Msg[];
  running: boolean;
  /** Runs waiting their turn, oldest first. They start when the agent is free and not waiting on you. */
  queue: QueuedRun[];
  send: (text: string) => void;
  /** Apply open notes (all of them when no ids). Queued if the agent is busy; notes already queued or applying are skipped. */
  applyNotes: (noteIds?: string[]) => void;
  answer: (toolCallId: string, answer: string) => void;
  /** Stop the current run and clear the queue. Notes that hadn't finished go back to open. */
  cancel: () => void;
  /** Take one run off the queue; its notes go back to open. */
  dequeue: (id: string) => void;
  /** Take one note out of whatever queued run holds it; the run goes if it's left empty. */
  unqueueNote: (noteId: string) => void;
  /** Revert one edit the agent made. */
  undo: (toolCallId: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let runToken = 0;

/** Pin numbers match the Notes list: notes in time order, dismissed ones left out. */
function noteRefs(ids: string[]): NoteRef[] {
  const ordered = useEditor.getState().project.notes.filter((n) => n.status !== "dismissed").sort((a, b) => a.at - b.at);
  return ids.flatMap((id) => {
    const i = ordered.findIndex((n) => n.id === id);
    const n = ordered[i];
    return n ? [{ id, index: i + 1, at: n.at, text: n.text }] : [];
  });
}

const seed: Msg[] = [
  {
    id: "m1",
    role: "user",
    content: [{ type: "text", text: "Blur the email in the invite field." }],
    metadata: { custom: { notes: [{ id: "n2", index: 2, at: 49, text: "Blur the email in the invite field." }] } },
  },
  {
    id: "m2",
    role: "assistant",
    content: [
      { type: "reasoning", text: "The invite field shows an email between 0:48 and 0:56. A blur over the field's region covers it without cutting the shot." },
      { type: "tool-call", toolCallId: "t1", toolName: "get_input_events", args: { from: 47, to: 57, kinds: ["focus", "typing"] }, result: { focus: "Invite field", typing: [48.2, 51.9] } },
      { type: "tool-call", toolCallId: "t2", toolName: "add_overlay", args: { kind: "blur", start: 48, end: 56, label: "Email" }, result: { id: "o2", undo: { kind: "remove", id: "o2" } } },
      { type: "text", text: "Blurred the email in the invite field from 0:48 to 0:56. The blur follows the zoom, so it stays put when the camera moves." },
    ],
    status: { type: "complete", reason: "stop" },
  },
];

export const useAgent = create<AgentState>((set, get) => {
  const patchLast = (fn: (m: Msg) => Msg) =>
    set((s) => ({ messages: s.messages.map((m, i) => (i === s.messages.length - 1 ? fn(m) : m)) }));
  const pushPart = (part: Part) =>
    patchLast((m) => ({ ...m, content: [...(m.content as Part[]), part] }));
  const setPart = (toolCallId: string, patch: Partial<Extract<Part, { type: "tool-call" }>>) =>
    set((s) => ({
      messages: s.messages.map((m) => ({
        ...m,
        content: typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "tool-call" && p.toolCallId === toolCallId ? { ...p, ...patch } : p)),
      })),
    }));
  const findPart = (toolCallId: string) => {
    for (const m of get().messages) {
      if (typeof m.content === "string") continue;
      const part = m.content.find((p) => p.type === "tool-call" && p.toolCallId === toolCallId);
      if (part) return part as Extract<Part, { type: "tool-call" }>;
    }
    return undefined;
  };
  /** True while an ask card is waiting for you; the queue holds until you answer. */
  const awaiting = () => get().messages.at(-1)?.status?.type === "requires-action";

  /** Streams text into a new part, a few characters per frame, like partial messages from the CLI. */
  async function streamText(type: "text" | "reasoning", text: string, token: number) {
    pushPart({ type, text: "" } as Part);
    for (let i = 0; i <= text.length; i += 4) {
      if (token !== runToken) return;
      const slice = text.slice(0, i);
      patchLast((m) => {
        const parts = [...(m.content as Part[])];
        parts[parts.length - 1] = { type, text: slice } as Part;
        return { ...m, content: parts };
      });
      await sleep(16);
    }
    patchLast((m) => {
      const parts = [...(m.content as Part[])];
      parts[parts.length - 1] = { type, text } as Part;
      return { ...m, content: parts };
    });
  }

  async function tool(name: string, args: Record<string, unknown>, run: () => unknown, token: number) {
    const toolCallId = uid("t");
    pushPart({ type: "tool-call", toolCallId, toolName: name, args } as Part);
    await sleep(420);
    if (token !== runToken) return;
    setPart(toolCallId, { result: run() ?? { ok: true } });
    await sleep(140);
  }

  function start(userText: string, notes?: NoteRef[]) {
    const token = ++runToken;
    set((s) => ({
      running: true,
      messages: [
        ...s.messages,
        { id: uid("m"), role: "user", content: [{ type: "text", text: userText }], metadata: notes?.length ? { custom: { notes } } : undefined },
        { id: uid("m"), role: "assistant", content: [], status: { type: "running" } },
      ],
    }));
    return token;
  }

  function finish(token: number) {
    if (token !== runToken) return;
    patchLast((m) => ({ ...m, status: { type: "complete", reason: "stop" } }));
    set({ running: false });
    pump();
  }

  /** Start the next queued run if the agent is free. */
  function pump() {
    const { running, queue } = get();
    if (running || awaiting() || !queue.length) return;
    const [next, ...rest] = queue;
    set({ queue: rest });
    if (next!.noteIds) runNotes(next!.noteIds);
    else if (next!.text) runSend(next!.text);
  }

  /** Script a plausible run for one note. Returns one sentence on what changed. */
  async function applyNote(note: Note, token: number): Promise<string> {
    useEditor.getState().setNoteStatus(note.id, "applying");
    const at = note.at;
    const made: string[] = [];
    const did: string[] = [];
    await streamText("reasoning", `Note at ${formatTime(at)}: "${note.text}" ${note.region ? "It points at a marked area of the frame, so the zoom should center there." : "There's no marked area, so I'll work from timing."} I'll check the input events around it first.`, token);
    await tool("get_input_events", { from: Math.max(0, at - 3), to: at + 5 }, () => ({ clicks: [at + 0.6], focus: "Create project" }), token);
    if (note.intents.includes("zoom") || note.region) {
      const r = note.region ?? { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
      const args = { start: Math.max(0, at - 1.2), end: at + 4.2, scale: 1.8, target: { x: +(r.x + r.w / 2).toFixed(2), y: +(r.y + r.h / 2).toFixed(2) } };
      // An agent zoom supersedes any auto zoom it overlaps, the same way a user edit would.
      const overlapped = useEditor.getState().project.zooms.filter((z) => z.author === "auto" && z.start < args.end && z.end > args.start);
      for (const z of overlapped) {
        await tool("remove_zoom", { start: z.start, end: z.end }, () => { useEditor.getState().removeItem(z.id); return { ok: true, undo: { kind: "restore-zoom", zoom: z } }; }, token);
      }
      await tool("add_zoom", args, () => { const id = useEditor.getState().addZoom({ ...args, author: "agent" }); made.push(id); return { id, undo: { kind: "remove", id } }; }, token);
      did.push(`zoomed to 1.8× from ${formatTime(args.start)} to ${formatTime(args.end)}${overlapped.length ? ", replacing the auto zoom there" : ""}`);
    }
    if (note.intents.includes("speed")) {
      const slower = /slow/i.test(note.text);
      const args = { start: Math.max(0, at - 1), end: at + (slower ? 4 : 12), speed: slower ? 0.75 : 1.4 };
      await tool("set_speed", args, () => ({ ok: true }), token);
      did.push(`${slower ? "slowed" : "sped up"} ${formatTime(args.start)}–${formatTime(args.end)} to ${args.speed}×`);
    }
    if (note.intents.includes("cut")) {
      const args = { start: at + 2, end: at + 5.5 };
      await tool("cut", args, () => ({ removed: 3.5 }), token);
      did.push(`cut 3.5s of idle time at ${formatTime(args.start)}`);
    }
    if (note.intents.includes("callout") || note.intents.includes("zoom")) {
      const args = { kind: "callout", start: at + 0.4, end: at + 3.6, label: "Create a project" };
      await tool("add_overlay", args, () => { const id = useEditor.getState().addOverlay({ kind: "callout", start: args.start, end: args.end, label: args.label, author: "agent" }); made.push(id); return { id, undo: { kind: "remove", id } }; }, token);
      did.push("added a short callout");
    }
    if (token !== runToken) return "";
    useEditor.getState().setNoteStatus(note.id, "applied", made);
    const sentence = did.length > 1 ? `${did.slice(0, -1).join(", ")} and ${did.at(-1)}` : did[0] ?? "found nothing to change";
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
  }

  function runNotes(noteIds: string[]) {
    // Notes dismissed or applied while they waited drop out here.
    const notes = useEditor.getState().project.notes.filter((n) => noteIds.includes(n.id) && n.status === "queued");
    if (!notes.length) { pump(); return; }
    const refs = noteRefs(notes.map((n) => n.id));
    const batch = notes.length > 1;
    const token = start(batch ? `Apply ${notes.length} notes` : notes[0]!.text, refs);
    void (async () => {
      // A batch gets a checklist that ticks off as each note lands.
      const planId = uid("plan");
      const statuses: Record<string, string> = Object.fromEntries(refs.map((r) => [r.id, "queued"]));
      const plan = () => setPart(planId, { args: { notes: refs, statuses: { ...statuses } } as never });
      if (batch) pushPart({ type: "tool-call", toolCallId: planId, toolName: "apply_notes", args: { notes: refs, statuses } } as Part);
      const lines: string[] = [];
      for (const note of notes) {
        if (token !== runToken) return;
        statuses[note.id] = "applying"; if (batch) plan();
        const line = await applyNote(note, token);
        if (token !== runToken) return;
        statuses[note.id] = "applied"; if (batch) plan();
        const ref = refs.find((r) => r.id === note.id)!;
        lines.push(batch ? `Note ${ref.index}: ${line}` : line);
      }
      if (batch) setPart(planId, { result: { ok: true } });
      await streamText("text", `${lines.join("\n")}\nEvery edit is on the timeline with an agent dot. Undo any of them here.`, token);
      finish(token);
    })();
  }

  function runSend(text: string) {
    const token = start(text);
    void (async () => {
      if (/launch|cut|trailer/i.test(text)) {
        await streamText("reasoning", "A launch cut needs a direction before I touch the timeline. I'll ask instead of guessing.", token);
        pushPart({ type: "tool-call", toolCallId: uid("ask"), toolName: "ask_user", args: { question: "What pace should the launch cut have?", options: ["Punchy, 20s", "Walkthrough, 45s", "Feature trio, 3×10s"] } } as Part);
        patchLast((m) => ({ ...m, status: { type: "requires-action", reason: "tool-calls" } }));
        set({ running: false });
        return;
      }
      const shotEdit = parseShotRequest(text);
      if (shotEdit) {
        const { project, setMotion, setTemplate } = useEditor.getState();
        await streamText("reasoning", `This is about the camera. The current shot is ${shotById(project.template).name}; I'll ${shotEdit.shot ? "switch the shot" : "retune its motion"} rather than touch the edit.`, token);
        if (shotEdit.shot) {
          const shot = shotEdit.shot;
          const prev = useEditor.getState().project.template;
          await tool("set_shot", { shot: shot.name }, () => { setTemplate(shot.id); return { ok: true, undo: { kind: "shot", template: prev } }; }, token);
        }
        if (shotEdit.speed || shotEdit.amount !== undefined) {
          const cur = useEditor.getState().project.motion;
          const next = { speed: +(cur.speed * (shotEdit.speed ?? 1)).toFixed(2), amount: shotEdit.amount ?? cur.amount };
          await tool("set_motion", next, () => { setMotion(next); return { ok: true, undo: { kind: "motion", speed: cur.speed, amount: cur.amount } }; }, token);
        }
        const now = useEditor.getState().project;
        await streamText("text", `${shotById(now.template).name} at ${now.motion.speed}× speed and ${Math.round(now.motion.amount * 100)}% movement. Scrub from the start to see the move, or say "slower" or "more" to keep tuning.`, token);
        finish(token);
        return;
      }
      await streamText("reasoning", "I'll read the project and the open notes to see what this refers to.", token);
      await tool("get_project", { fields: ["zooms", "overlays", "notes"] }, () => ({ zooms: useEditor.getState().project.zooms.length }), token);
      await streamText("text", "I looked at the timeline. Leave a note on the frame where you want the change and I'll apply it there, or ask for a launch cut and I'll propose one.", token);
      finish(token);
    })();
  }

  const enqueue = (run: QueuedRun) => {
    set((s) => ({ queue: [...s.queue, run] }));
    pump();
  };

  return {
    messages: isTauri ? [] : seed,
    running: false,
    queue: [],

    send: (text) => enqueue({ id: uid("q"), label: text, text }),

    applyNotes: (noteIds) => {
      const editor = useEditor.getState();
      const notes = editor.project.notes.filter((n) => n.status === "open" && (!noteIds || noteIds.includes(n.id)));
      if (!notes.length) return;
      // Mark them first, so a second click before the run starts finds nothing to add.
      for (const n of notes) editor.setNoteStatus(n.id, "queued");
      const ids = notes.map((n) => n.id);
      const refs = noteRefs(ids);
      enqueue({ id: uid("q"), label: refs.length === 1 ? `Note ${refs[0]!.index}` : `${refs.length} notes`, noteIds: ids });
    },

    answer: (toolCallId, answer) => {
      setPart(toolCallId, { result: { answer } });
      const token = ++runToken;
      set((s) => ({ running: true, messages: s.messages.map((m, i) => (i === s.messages.length - 1 ? { ...m, status: { type: "running" } } : m)) }));
      void (async () => {
        await streamText("text", `Going with "${answer}". I'll draft the cut from the three clips and put title cards between them. You'll see it on the timeline as agent edits you can undo together.`, token);
        finish(token);
      })();
    },

    cancel: () => {
      runToken++;
      const { messages } = get();
      if (messages.at(-1)?.role === "assistant") patchLast((m) => ({ ...m, status: { type: "incomplete", reason: "cancelled" } }));
      const editor = useEditor.getState();
      for (const n of editor.project.notes) if (n.status === "queued" || n.status === "applying") editor.setNoteStatus(n.id, "open");
      set({ running: false, queue: [] });
    },

    dequeue: (id) => {
      const run = get().queue.find((q) => q.id === id);
      if (!run) return;
      const editor = useEditor.getState();
      for (const n of editor.project.notes) if (run.noteIds?.includes(n.id) && n.status === "queued") editor.setNoteStatus(n.id, "open");
      set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }));
    },

    unqueueNote: (noteId) => {
      const editor = useEditor.getState();
      if (editor.project.notes.find((n) => n.id === noteId)?.status !== "queued") return;
      editor.setNoteStatus(noteId, "open");
      set((s) => ({
        queue: s.queue.flatMap((q) => {
          if (!q.noteIds?.includes(noteId)) return [q];
          const noteIds = q.noteIds.filter((id) => id !== noteId);
          if (!noteIds.length) return [];
          const refs = noteRefs(noteIds);
          return [{ ...q, noteIds, label: refs.length === 1 ? `Note ${refs[0]!.index}` : `${refs.length} notes` }];
        }),
      }));
    },

    undo: (toolCallId) => {
      const part = findPart(toolCallId);
      const result = part?.result as { undo?: UndoRecord; undone?: boolean } | undefined;
      if (!result?.undo || result.undone) return;
      const editor = useEditor.getState();
      const u = result.undo;
      if (u.kind === "remove") editor.removeItem(u.id);
      else if (u.kind === "restore-zoom") editor.addZoom({ start: u.zoom.start, end: u.zoom.end, scale: u.zoom.scale, target: u.zoom.target, author: u.zoom.author });
      else if (u.kind === "shot") editor.setTemplate(u.template);
      else editor.setMotion({ speed: u.speed, amount: u.amount });
      setPart(toolCallId, { result: { ...result, undone: true } });
    },
  };
});
