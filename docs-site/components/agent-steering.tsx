import { useEffect, useRef, useState } from "react";
import { AgentSteering } from "@/ui/organisms/agent-steering";
import type { SteerNote, SteerStatus, SteerStep } from "@/ui/organisms/agent-steering";
import src from "@/ui/organisms/agent-steering/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { Beat } from "../demo";
import type { DocEntry } from "../registry";

const PLAN: SteerStep[] = [
  { id: "read", title: "Read the notes and the clicks", status: "done", duration: 2100 },
  { id: "zoom", title: "Zoom on the Create button", status: "active" },
  { id: "cut", title: "Cut the dead air after the form" },
  { id: "typing", title: "Speed up the typing" },
  { id: "share", title: "Call out the Share menu" },
];

/** How long the agent spends on each step in the preview. */
const STEP_MS = 2600;
let noteId = 0;

/** Types text into the field a few characters at a time, starting at `at`. */
function typing(text: string, at: number, set: (t: string) => void): Beat[] {
  const beats: Beat[] = [];
  for (let i = 1; i <= text.length; i += 2) beats.push({ at: at + i * 14, run: () => set(text.slice(0, i + 1)) });
  return beats;
}

function Demo() {
  const [steps, setSteps] = useState(PLAN);
  const [queue, setQueue] = useState<SteerNote[]>([]);
  const [status, setStatus] = useState<SteerStatus>("running");
  const [draft, setDraft] = useState("");
  const [startedAt] = useState(() => Date.now() - 2400);
  const live = useRef({ queue, steps });
  live.current = { queue, steps };
  const activeId = steps.find((s) => s.status === "active")?.id;

  // The agent: every few seconds it finishes the active step, starts the next,
  // and takes in whatever was queued for it.
  useEffect(() => {
    if (status !== "running" || !activeId) return;
    const id = window.setTimeout(() => {
      const { queue: picked, steps: cur } = live.current;
      const i = cur.findIndex((s) => s.id === activeId);
      const next = cur.map((s, j) => (j === i ? { ...s, status: "done" as const, duration: STEP_MS + (j * 370) % 900 } : s));
      if (i + 1 < next.length) next[i + 1] = { ...next[i + 1]!, status: "active", notes: [...(next[i + 1]!.notes ?? []), ...picked] };
      else setStatus("done");
      setQueue(i + 1 < next.length ? [] : picked);
      setSteps(next);
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [status, activeId]);

  const queueNote = (text: string) => setQueue((q) => [...q, { id: `note-${noteId++}`, text }]);
  const interrupt = (text: string, queuedId?: string) => {
    if (queuedId) setQueue((q) => q.filter((n) => n.id !== queuedId));
    setSteps((cur) => cur.map((s) => (s.status === "active" ? { ...s, notes: [...(s.notes ?? []), { id: queuedId ?? `note-${noteId++}`, text }] } : s)));
  };

  const first = "Leave a beat after the form submits";
  const second = "Make the typing 2×, not 3×";
  const third = "Keep the cursor visible while it types";
  const root = useScript([
    ...typing(first, 500, setDraft),
    { at: 1700, run: () => { queueNote(first); setDraft(""); } },
    ...typing(second, 3200, setDraft),
    { at: 4300, run: () => { queueNote(second); setDraft(""); } },
    ...typing(third, 5900, setDraft),
    { at: 7000, run: () => { interrupt(third); setDraft(""); } },
  ]);

  return (
    <div ref={root}>
      <DemoPanel width={430}>
        <UserSays>Apply my notes on the Projects walkthrough.</UserSays>
        <AgentSays>
          <AgentSteering
            title="Applying 4 notes to the Projects walkthrough"
            agent="Claude Code"
            steps={steps}
            queue={queue}
            status={status}
            startedAt={startedAt}
            draft={draft}
            onDraftChange={setDraft}
            onQueue={queueNote}
            onInterrupt={interrupt}
            onRemove={(id) => setQueue((q) => q.filter((n) => n.id !== id))}
            onPause={() => setStatus("paused")}
            onResume={() => setStatus("running")}
          />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "agent-steering",
  name: "AgentSteering",
  layer: "Organisms",
  category: "Agent",
  order: 20,
  isNew: true,
  description: "Steer the agent while it works: queue a note for the next step, or apply one right away. When the agent takes a queued note in, the note glides from the queue into the step it changed, so the run still shows which note changed what.",
  demo: () => <Demo />,
  usage: `import { AgentSteering } from "@/ui/organisms/agent-steering";

<AgentSteering
  title="Applying 4 notes to the Projects walkthrough"
  agent="Claude Code"
  steps={steps}          // [{ id, title, status: "done" | "active" | "pending", duration?, notes? }]
  queue={queue}          // [{ id, text }]
  status={run.status}    // "running" | "paused" | "done"
  startedAt={run.startedAt}
  onQueue={(text) => agent.queueNote(text)}
  onInterrupt={(text, queuedId) => agent.applyNow(text, queuedId)}
  onRemove={(id) => agent.unqueue(id)}
  onPause={agent.pause}
  onResume={agent.resume}
/>

// When the agent takes a note in, move it (same id) from the queue into the step:
setQueue((q) => q.filter((n) => n.id !== note.id));
setSteps((s) => s.map((step) => step.id === next.id ? { ...step, notes: [...(step.notes ?? []), note] } : step));`,
  source: src,
  sourcePath: "src/ui/organisms/agent-steering/index.tsx",
  props: [
    { name: "title", type: "string", description: "What the agent is working on: the card's heading." },
    { name: "agent", type: "string = \"Claude Code\"", description: "Who is working, in the tray header next to the clock." },
    { name: "steps", type: "SteerStep[]", description: "The plan: { id, title, status?, duration?, notes? }. status is done, active or pending." },
    { name: "queue", type: "SteerNote[]", description: "Notes waiting for the next step: { id, text }. Move one into a step's notes with the same id and it glides over." },
    { name: "status", type: "\"running\" | \"paused\" | \"done\"", description: "The run. The clock ticks while running and stands still while paused; done folds the field away." },
    { name: "startedAt", type: "number", description: "When the run started, in ms. The header clock counts from here, leaving out time spent paused." },
    { name: "onQueue", type: "(text) => void", description: "Enter in the field: add the note to the queue." },
    { name: "onInterrupt", type: "(text, queuedId?) => void", description: "⌘Enter in the field, or Now on a queued note: apply it to the active step right away. Shows the shortcut and the Now buttons." },
    { name: "onRemove", type: "(id) => void", description: "✕ on a queued note." },
    { name: "onPause / onResume", type: "() => void", description: "Shows Pause while running and Resume while paused, in the tray's footer." },
    { name: "draft / onDraftChange", type: "string / (text) => void", description: "Controlled field text, e.g. to prefill a suggestion." },
    { name: "placeholder", type: "string = \"Steer the agent…\"", description: "Text in the empty field." },
  ],
  composedOf: ["Tray", "StatusGlyph", "Shimmer", "Cell (ink)", "Fold", "Swap", "RollNumber", "Duration", "Key", "IconKey", "Kbd", "Mark"],
  whenToUse: [
    "The agent is applying a batch of notes and the person notices something it should do differently, without stopping it.",
    "Long runs (a batch of notes, a re-edit of a whole video) where a correction at the next step is cheaper than starting over.",
    "Keeping a record of which note changed which step, so the run is easy to follow afterwards.",
  ],
  whenNot: [
    "Reviewing the plan before the run starts: use AgentPlan.",
    "One yes or no before the agent acts: use ApprovalCard.",
    "Watching one agent's progress, clock and cost from a distance: use AgentMonitor.",
    "Notes pinned to a frame before any run: use NoteThread.",
  ],
  keyboard: [
    ["↵", "Queues the note for the next step."],
    ["⌘ ↵", "Applies the note to the active step right away (Ctrl ↵ on Windows and Linux)."],
    ["⇧ ↵", "New line in the note."],
    ["Esc", "Clears the field."],
    ["Tab", "Moves to the queued notes' Now and ✕ buttons, the field, the send button and Pause."],
  ],
  a11y: [
    "The plan is an ordered list labelled \"Plan\"; the active step has aria-current=\"step\" and every step says its status as text.",
    "Queuing, applying right away, removing, and every note the agent picks up are read out in a polite live region.",
    "The field is labelled \"Steer the agent\" and described by the shortcut hint under it.",
    "Icon buttons have names: Remove “…”, Queue for the next step. The folded field is inert once the run is done.",
  ],
  motion: [
    "A note the agent takes in glides from the queue into its step on spring.travel (560ms, no bounce), then lights with a soft wash that fades back over 1.2s.",
    "A note applied right away rises into the active step out of a 2px blur, and lights the same way.",
    "The card's height follows its content, and the rows below a growing step glide down, so the queue opening and closing never jumps.",
    "The active step's rays turn and a band of light sweeps its title; a step finishing pops its check in (one 5% overshoot) as it draws itself.",
    "The tray's status and the Pause or Resume key blur from one to the next.",
    "Reduced motion: notes and rows move into place at once, nothing lights, the rays and the sweep stand still.",
  ],
};
