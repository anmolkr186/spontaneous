import { useRef, useState } from "react";
import { AgentCheckpoints } from "@/ui/organisms/agent-checkpoints";
import type { Checkpoint } from "@/ui/organisms/agent-checkpoints";
import src from "@/ui/organisms/agent-checkpoints/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

const START: Checkpoint[] = [
  { id: "c1", title: "Read the notes", at: 4, edits: 0 },
  { id: "c2", title: "Applied note 1", at: 21, edits: 2 },
  { id: "c3", title: "Cut dead air", at: 38, edits: 1 },
  { id: "c4", title: "Zoom on Create", at: 52, edits: 2 },
  { id: "c5", title: "Speed up typing", at: 70, edits: 1, status: "running" },
];

let next = 0;

function Demo() {
  const [checkpoints, setCheckpoints] = useState(START);
  const [head, setHead] = useState("c5");
  const clock = useRef(70);
  const live = useRef(checkpoints);
  live.current = checkpoints;

  const patch = (id: string, p: Partial<Checkpoint>) => setCheckpoints((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  /** The agent saves a checkpoint, works toward the next one, and it lands a moment later. */
  const save = (title: string, parent: string, edits: number) => {
    const id = `n${next++}`;
    clock.current += 14;
    setCheckpoints((cs) => [...cs, { id, title, parent, at: clock.current, edits, status: "running" }]);
    setHead(id);
    window.setTimeout(() => patch(id, { status: "done" }), 1500);
    return id;
  };
  const rewind = (to: Checkpoint) => {
    // Whatever the agent was still working toward stops where it is.
    setCheckpoints((cs) => cs.map((c) => (c.status === "running" ? { ...c, status: "stopped" } : c)));
    const all = live.current;
    const takes = all.filter((c, i) => (c.parent ?? all[i - 1]?.id) === to.id).length;
    save(`${to.title}, take ${takes + 1}`, to.id, 1);
  };

  const root = useScript([
    { at: 1400, run: () => patch("c5", { status: "done" }) },
    { at: 2400, run: () => save("Callout on the Share menu", "c5", 1) },
    { at: 4600, run: () => rewind(START[3]!) },
    { at: 6900, run: () => setCheckpoints((cs) => { const last = cs.at(-1)!; return [...cs, { id: "n-typing", title: "Speed up typing to 1.5×", parent: last.id, at: last.at! + 16, edits: 1, status: "running" }]; }) },
    { at: 6900, run: () => setHead("n-typing") },
    { at: 8300, run: () => patch("n-typing", { status: "done" }) },
  ]);

  return (
    <div ref={root}>
      <DemoPanel width={430}>
        <UserSays>The zoom on Create is too strong now. Go back to before the callout and try a gentler one.</UserSays>
        <AgentSays>
          <AgentCheckpoints task="Tighten the Projects walkthrough" checkpoints={checkpoints} head={head} onRewind={rewind} />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "agent-checkpoints",
  name: "AgentCheckpoints",
  layer: "Organisms",
  category: "Agent",
  order: 50,
  isNew: true,
  description: "The agent's edits as a line of checkpoints, like version history for a cut. Rewind to any of them and a new attempt branches out of it, while the attempt you left fades back but stays.",
  demo: () => <Demo />,
  usage: `import { AgentCheckpoints } from "@/ui/organisms/agent-checkpoints";

<AgentCheckpoints
  task="Tighten the Projects walkthrough"
  checkpoints={[
    { id: "c1", title: "Read the notes", at: 4, edits: 0 },
    { id: "c2", title: "Applied note 1", at: 21, edits: 2 },
    { id: "c3", title: "Cut dead air", at: 38, edits: 1 },
    { id: "c4", title: "Zoom on Create", at: 52, edits: 2 },
    { id: "c5", title: "Speed up typing", at: 70, edits: 1 },
    // Rewound to c4: a new attempt on its own lane.
    { id: "c6", title: "Zoom on Create, take 2", parent: "c4", at: 84, edits: 1, status: "running" },
  ]}
  head="c6"
  onRewind={(cp) => agent.rewindTo(cp.id)}   // add a checkpoint with parent cp.id and move head to it
/>`,
  source: src,
  sourcePath: "src/ui/organisms/agent-checkpoints/index.tsx",
  props: [
    { name: "checkpoints", type: "Checkpoint[]", description: "In the order they were taken: { id, title, parent?, status?, at?, edits? }. Pass them again whenever one is added or changes." },
    { name: "checkpoint.parent", type: "string", description: "The checkpoint it follows; defaults to the one before it. A checkpoint whose parent already has a later one starts a new attempt on its own lane." },
    { name: "checkpoint.status", type: "\"running\" | \"done\" | \"failed\" | \"stopped\"", description: "Running shimmers; failed gets a tag; stopped means you rewound away while the agent worked toward it. Default done." },
    { name: "checkpoint.at", type: "number", description: "When in the run it was saved, in seconds. Shown in the time face." },
    { name: "checkpoint.edits", type: "number", description: "How many edits it holds. The footer adds them up along the way to head." },
    { name: "head", type: "string", description: "The checkpoint the agent stands on. The way to it is light; everything off it fades back. Default the last one." },
    { name: "onRewind", type: "(checkpoint) => void", description: "Rewind was pressed: add a checkpoint with this one as its parent and move head to it." },
    { name: "task", type: "string", description: "What the run is for, next to the title." },
    { name: "title", type: "string = \"Checkpoints\"", description: "Heading of the tray." },
    { name: "formatTime", type: "(seconds) => string", description: "Formats at. Default \"0:42\"." },
  ],
  composedOf: ["Tray", "Cell", "Tag", "Shimmer", "RollNumber", "Key"],
  whenToUse: [
    "Long agent runs over a project, where a wrong turn shouldn't cost the whole run: rewind to the last good checkpoint and let it try again.",
    "Showing that nothing is lost: the attempt you rewound from stays visible, faded, and you can rewind back into it.",
    "Any agent that saves the project step by step as it applies notes.",
  ],
  whenNot: [
    "Steps that haven't happened yet: use AgentPlan.",
    "Single edits to undo one at a time: use AgentLedger.",
    "Comparing a few approaches to the same edit side by side: use ParallelAttempts.",
  ],
  keyboard: [
    ["↑ ↓", "Moves between the checkpoints."],
    ["Home End", "Jumps to the first or the last checkpoint."],
    ["↵ Space", "Rewinds to the focused checkpoint."],
  ],
  a11y: [
    "The checkpoints are an ordered list with one tab stop; the arrow keys, Home and End move between them.",
    "Every row says its title, its attempt, its status, whether it's current or left behind, and its edits. The current one has aria-current=\"step\".",
    "Rewind is a pointer shortcut and is hidden from assistive tech; Enter or Space on the row does the same.",
    "The edit count in the footer is a polite live region, so it's read out when it changes.",
    "Status is never color alone: failed and stopped carry a tag, and left behind is in the row's name.",
  ],
  motion: [
    "A new checkpoint rises in out of a 2px blur, its cell pops (one 5% overshoot) with one short glint, and the line to it draws itself down; the card's height glides to make room.",
    "Rewind bends a new lane out of the checkpoint you picked and draws it down to the new attempt; the attempt you left turns gray and its line fades back over 480ms.",
    "While the agent works toward a checkpoint, its title shimmers.",
    "On hover or focus, Rewind fades in where the edits and time were, so rows never change size.",
    "Reduced motion: rows and lines simply appear, nothing pops, glints or draws.",
  ],
  details: {
    limit: "One run per card. Rows keep a fixed height; past fourteen the list scrolls and keeps head in view.",
    variants: [
      { name: "One attempt", when: "A straight line: every checkpoint on the way to head." },
      { name: "Branched", when: "After a rewind: a lane bends out of the checkpoint you rewound to, and the old attempt fades back." },
    ],
    states: [
      {
        name: "Failed and stopped",
        note: "A failed checkpoint gets a rec tag and a rec cell; a stopped one says so and goes gray.",
        render: () => (
          <div style={{ width: 400, maxWidth: "100%" }}>
            <AgentCheckpoints
              task="Tighten the Projects walkthrough"
              head="c4"
              checkpoints={[
                { id: "c1", title: "Read the notes", at: 4, edits: 0 },
                { id: "c2", title: "Cut dead air", at: 38, edits: 1 },
                { id: "c3", title: "Callout on the Share menu", at: 61, edits: 0, status: "failed" },
                { id: "c4", title: "Cut dead air, take 2", parent: "c2", at: 75, edits: 1 },
              ]}
            />
          </div>
        ),
      },
    ],
  },
};
