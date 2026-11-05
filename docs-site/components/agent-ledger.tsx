import { useState } from "react";
import { Captions, FileVideo, Gauge, Scissors, Send, ZoomIn } from "lucide-react";
import { AgentLedger } from "@/ui/organisms/agent-ledger";
import type { LedgerEntry } from "@/ui/organisms/agent-ledger";
import src from "@/ui/organisms/agent-ledger/index.tsx?raw";
import { DemoPanel, useScript } from "../demo";
import type { DocEntry } from "../registry";

const MIN = 60000;

/** A session on the Projects demo: zoom, speed, cut, a caption on the zoom, then an export and its upload. */
function session(now: number): LedgerEntry[] {
  return [
    { id: "zoom", action: "Zoom", target: "Create button", position: 12, change: ["1.4×", "1.8×"], icon: <ZoomIn />, at: now - 11 * MIN },
    { id: "speed", action: "Speed", target: "Onboarding", position: [31, 58], change: ["1×", "1.5×"], icon: <Gauge />, at: now - 9 * MIN },
    { id: "cut", action: "Cut", target: "Loading spinner", position: [42, 51], detail: "Removed nine seconds", icon: <Scissors />, at: now - 7 * MIN },
    { id: "caption", action: "Caption", target: "Create button", position: 12, change: ["None", "One click to start"], dependsOn: ["zoom"], icon: <Captions />, at: now - 5 * MIN },
    { id: "export", action: "Export", target: "Projects-demo.mp4", detail: "1080p, written to ~/Movies", reversible: false, dependsOn: ["caption", "cut"], icon: <FileVideo />, at: now - 3 * MIN },
    { id: "slack", action: "Upload", target: "#launch on Slack", detail: "Posted the export", reversible: false, dependsOn: ["export"], icon: <Send />, at: now - 2 * MIN },
  ];
}

function Demo() {
  const [entries, setEntries] = useState(() => session(Date.now()));
  const [pointAt, setPointAt] = useState<string | null>(null);
  const root = useScript([
    { at: 1400, run: () => setEntries((e) => [...e, { id: "zoom-share", action: "Zoom", target: "Share dialog", position: 65, change: ["None", "1.6×"], icon: <ZoomIn />, at: Date.now() }]) },
    { at: 3600, run: () => setPointAt("zoom") },
    { at: 6000, run: () => { setPointAt(null); root.current?.querySelector<HTMLButtonElement>("[data-entry='zoom'] [data-key='undo']")?.click(); } },
  ]);
  return (
    <div ref={root}>
      <DemoPanel>
        <AgentLedger entries={entries} pointAt={pointAt} />
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "agent-ledger",
  name: "AgentLedger",
  layer: "Organisms",
  category: "Agent",
  order: 90,
  isNew: true,
  description: "Everything the agent changed in the project, newest first, each change with its before and after and an Undo. Pointing at Undo shows what goes with it: changes built on it say \"Also undone\", and things that can't be taken back, like an export on disk or an upload, say \"Can't undo\".",
  demo: () => <Demo />,
  usage: `import { AgentLedger } from "@/ui/organisms/agent-ledger";

// From the project's command log (history.jsonl), agent-authored commands only.
<AgentLedger
  entries={[
    { id: "z3", action: "Zoom", target: "Create button", position: 12, change: ["1.4×", "1.8×"], icon: <ZoomIn />, at },
    { id: "o1", action: "Caption", target: "Create button", position: 12, change: ["None", "One click to start"], dependsOn: ["z3"], icon: <Captions />, at },
    { id: "x1", action: "Export", target: "Projects-demo.mp4", detail: "1080p, written to ~/Movies", reversible: false, dependsOn: ["o1"], icon: <FileVideo />, at },
  ]}
  undone={undone}
  onUndo={(ids) => project.revert(ids)}
  onRedo={(ids) => project.reapply(ids)}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/agent-ledger/index.tsx",
  props: [
    { name: "entries", type: "LedgerEntry[]", description: "{ id, action, target?, position?, icon?, at, change?, detail?, reversible?, dependsOn? }. Any order; newest shows first." },
    { name: "action", type: "string", description: "Per entry. One word for the kind of change: \"Zoom\", \"Speed\", \"Cut\", \"Caption\", \"Export\"." },
    { name: "position", type: "number | [start, end]", description: "Per entry. Seconds on the recording, shown in the time face after the target." },
    { name: "change", type: "[before, after]", description: "Per entry. Shown as before (struck) → after; the arrow is read as \"to\". Or pass detail for one line." },
    { name: "reversible", type: "boolean = true", description: "Per entry. False for things that can't be taken back: no Undo, and \"Can't undo\" once something it builds on is undone." },
    { name: "dependsOn", type: "string[]", description: "Per entry. The changes it builds on; undoing one of those undoes this too, if it can be." },
    { name: "agent", type: "string = \"Claude Code\"", description: "Who made the changes, next to the title." },
    { name: "now", type: "number", description: "The clock for \"4m ago\", epoch ms. Defaults to now, kept fresh." },
    { name: "undone / defaultUndone", type: "string[]", description: "Ids of undone changes, controlled or not." },
    { name: "onUndo / onRedo", type: "(ids: string[]) => void", description: "The change with its reversible dependents (and, for Redo, what it needs). Revert or reapply them." },
    { name: "pointAt", type: "string | null", description: "Lights a change and what builds on it, as if its Undo were pointed at. For walkthroughs." },
    { name: "title", type: "string = \"Changes\"", description: "Heading in the tray." },
  ],
  composedOf: ["Tray", "TrayCard", "Mark", "Key", "Tag", "Swap", "RollNumber"],
  whenToUse: [
    "Next to the agent thread: what the agent changed in this project, each change with Undo.",
    "Anywhere undo must be honest about consequences: a caption built on a zoom goes with it, an export already on disk does not.",
    "Reviewing a run after the fact, with before and after for every change.",
  ],
  whenNot: [
    "Asking before a change happens: use ApprovalCard.",
    "The steps of the reply that is running now: the thread's step rail already has per-step Undo.",
    "How much the agent may change on its own: use AutonomyDial.",
  ],
  keyboard: [
    ["Tab", "Moves through the Undo and Redo keys; focusing Undo lights what goes with it."],
    ["↵ Space", "Undoes or redoes the focused change; focus stays on the row as Undo turns into Redo."],
  ],
  a11y: [
    "An ordered list labelled with the title, newest first.",
    "Undo is labelled with the change and how many changes build on it (\"Undo Zoom Create button, and 1 change built on it\"); Redo with the change.",
    "Before → after is plain text; the arrow is hidden and read as \"to\".",
    "Undo and Redo are announced politely, with anything that can't be undone.",
  ],
  motion: [
    "New changes open their row at the top as the height springs open, then fade in.",
    "Pointing at a row swaps its time for Undo in the same slot with a 2px blur; nothing else moves.",
    "Pointing at Undo washes the change and what builds on it; their slots swap to \"Also undone\" or a rec \"Can't undo\".",
    "Undo draws a line across each row, down the chain a beat (60ms) apart; the rows go quiet and their icons gray. Redo pulls the line back toward the right, quicker.",
    "Rows never change height: the time, Undo, Redo and the flags share one slot. The counts in the tray head roll.",
    "Reduced motion: rows appear at once and the line is drawn without moving.",
  ],
};
