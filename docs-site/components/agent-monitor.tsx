import { useEffect, useRef, useState } from "react";
import { AgentMonitor } from "@/ui/organisms/agent-monitor";
import type { MonitorState, MonitorStep } from "@/ui/organisms/agent-monitor";
import src from "@/ui/organisms/agent-monitor/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

/** The export job: how long each step works in the preview, in ms. */
const JOB: (Omit<MonitorStep, "state"> & { ms: number })[] = [
  { id: "read", label: "Read the project", kind: "read", ms: 1200 },
  { id: "zoom", label: "Add 3 zooms", kind: "zoom", ms: 2100 },
  { id: "cut", label: "Cut the dead air", kind: "cut", ms: 1600 },
  { id: "speed", label: "Speed up the typing", kind: "speed", ms: 1500 },
  { id: "camera", label: "Retime the camera", kind: "camera", ms: 1700 },
  { id: "render", label: "Render at 1080p", kind: "render", ms: 3200 },
  { id: "export", label: "Export to ~/Movies", kind: "export", ms: 1500 },
];

function initial(now: number): MonitorStep[] {
  return JOB.map(({ ms, ...s }, i) => (i < 2 ? { ...s, state: "done", took: ms } : i === 2 ? { ...s, state: "running", since: now } : { ...s, state: "queued" }));
}

function Demo() {
  const [start] = useState(() => Date.now());
  const [steps, setSteps] = useState(() => initial(start));
  const [state, setState] = useState<MonitorState>("running");
  const [cost, setCost] = useState(0.06);
  const [until, setUntil] = useState<number>();
  const [pausedFor, setPausedFor] = useState(0);
  const [error, setError] = useState<string>();
  const [folded, setFolded] = useState(false);
  const pausedAt = useRef(0);
  const allowed = useRef(false);
  const live = useRef(steps);
  live.current = steps;

  const runningIndex = steps.findIndex((s) => s.state === "running");

  // The agent: finishes the running step after its time, then starts the next
  // one, stopping to ask before it overwrites the export.
  useEffect(() => {
    if (state !== "running" || runningIndex < 0) return;
    const id = window.setTimeout(() => {
      const now = Date.now();
      const cur = live.current;
      const next = cur.map((s, i) => (i === runningIndex ? { ...s, state: "done" as const, took: now - (s.since ?? now) } : s));
      const after = runningIndex + 1;
      setCost((c) => +(c + 0.02 + (runningIndex % 3) * 0.01).toFixed(2));
      if (after >= next.length) { setSteps(next); setUntil(now); setState("finished"); return; }
      if (next[after]!.id === "export" && !allowed.current) { setSteps(next); setState("waiting"); return; }
      next[after] = { ...next[after]!, state: "running", since: now };
      setSteps(next);
    }, JOB[runningIndex]!.ms);
    return () => clearTimeout(id);
  }, [state, runningIndex]);

  const startExport = () => {
    allowed.current = true;
    setSteps((cur) => cur.map((s) => (s.id === "export" ? { ...s, state: "running", since: Date.now() } : s)));
    setState("running");
  };

  const root = useScript([
    { at: 9600, run: startExport },
    { at: 12800, run: () => setFolded(true) },
  ]);

  return (
    <div ref={root}>
      <DemoPanel width={430}>
        <UserSays>Apply the edits and export the Projects walkthrough. I'll be in Figma.</UserSays>
        <AgentSays>
          <AgentMonitor
            agent={{ name: "Claude Code", role: "Export" }}
            state={state}
            steps={steps}
            since={start - 3300}
            until={until}
            pausedFor={pausedFor}
            cost={cost}
            ask={{ title: "Wants to overwrite the export", action: "Overwrite Projects-demo.mp4 in ~/Movies" }}
            outcome="Exported Projects-demo.mp4 · 48 MB"
            error={error}
            folded={folded}
            onFoldedChange={setFolded}
            onAllow={startExport}
            onDecline={() => { setError("Declined. The old Projects-demo.mp4 is untouched."); setUntil(Date.now()); setState("failed"); }}
            onPause={() => { pausedAt.current = Date.now(); setState("paused"); }}
            onResume={() => { setPausedFor((p) => p + Date.now() - pausedAt.current); setState("running"); }}
            onCancel={() => { setError("Cancelled by you"); setUntil(Date.now()); setSteps((cur) => cur.map((s) => (s.state === "running" ? { ...s, state: "failed", took: Date.now() - (s.since ?? Date.now()) } : s))); setState("failed"); }}
            onRetry={() => {
              allowed.current = false;
              setError(undefined);
              setUntil(undefined);
              setSteps((cur) => {
                const i = cur.findIndex((s) => s.state !== "done");
                return cur.map((s, j) => (j === i ? { ...s, state: "running", since: Date.now(), took: undefined } : j > i ? { ...s, state: "queued" } : s));
              });
              setState("running");
            }}
          />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "agent-monitor",
  name: "AgentMonitor",
  layer: "Organisms",
  category: "Agent",
  order: 30,
  isNew: true,
  description: "One agent at work, kept in view as a card: the step it's on with a clock, what it has cost, a time strip of the steps it finished, and the exact action when it needs your OK. It folds into a small bar with the tools it has used and the clock.",
  demo: () => <Demo />,
  usage: `import { AgentMonitor } from "@/ui/organisms/agent-monitor";

<AgentMonitor
  agent={{ name: "Claude Code", role: "Export" }}
  state={run.state}             // "running" | "waiting" | "paused" | "finished" | "failed"
  steps={run.steps}             // [{ id, label, kind, state, since?, took? }], oldest first
  since={run.startedAt}
  until={run.endedAt}
  pausedFor={run.pausedMs}
  cost={run.dollars}
  ask={{ title: "Wants to overwrite the export", action: "Overwrite Projects-demo.mp4 in ~/Movies" }}
  outcome="Exported Projects-demo.mp4 · 48 MB"
  onAllow={agent.allow}
  onDecline={agent.decline}
  onPause={agent.pause}
  onResume={agent.resume}
  onCancel={agent.cancel}
  onRetry={agent.retry}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/agent-monitor/index.tsx",
  props: [
    { name: "state", type: "\"idle\" | \"running\" | \"waiting\" | \"paused\" | \"finished\" | \"failed\"", description: "Where the run is: the pill next to the cost. Needs you rises as a key; only Failed takes a hue." },
    { name: "agent", type: "{ name, role? }", description: "Who is working and as what: \"Claude Code · Export\". Default { name: \"Claude Code\" }." },
    { name: "steps", type: "MonitorStep[]", description: "Every step, oldest first: { id, label, kind?, icon?, state, since?, took? }. Done and failed steps become bars and rows; queued ones count toward \"3 of 7 steps\"." },
    { name: "step.kind", type: "\"read\" | \"look\" | \"zoom\" | \"cut\" | \"speed\" | \"overlay\" | \"camera\" | \"render\" | \"export\"", description: "Picks a plain icon when the step has no icon of its own." },
    { name: "current", type: "{ label, kind?, icon? }", description: "Overrides what the well says while running. Defaults to the running step." },
    { name: "since / until", type: "number", description: "When the run began and ended, in ms. The clock counts between them." },
    { name: "pausedFor", type: "number = 0", description: "Time spent paused, in ms, left out of the clock so it picks up where it stopped." },
    { name: "cost", type: "number", description: "Dollars spent so far. Rolls to each new value." },
    { name: "ask", type: "{ title, action, icon? }", description: "While waiting: a short line for the well, and the exact action it is about to take." },
    { name: "outcome", type: "string", description: "Once finished: one line on what came out, in the well." },
    { name: "error", type: "string", description: "Once failed: what went wrong, in a few words, in the well." },
    { name: "onAllow / onDecline", type: "() => void", description: "Allow and Decline while waiting. Enter on the focused card allows; Esc anywhere in it declines." },
    { name: "onPause / onResume / onCancel", type: "() => void", description: "Pause or Resume and Cancel in the tray's footer. Paused, the clock and the running bar stand still." },
    { name: "onRetry", type: "() => void", description: "Shows Try again after a failure." },
    { name: "folded / defaultFolded / onFoldedChange", type: "boolean / boolean / (folded) => void", description: "Folded, the card is one bar: the agent, the tools it has used, the clock, and the state when it needs you." },
  ],
  composedOf: ["Tray", "TrayCard", "RollText", "RollNumber", "Swap", "Fold", "DrawCheck", "Key", "IconKey", "Kbd", "Mark"],
  whenToUse: [
    "A side panel or corner that keeps one long job in view while the person works elsewhere: rendering, exporting, applying a long batch of notes.",
    "Jobs that must ask before they touch something real (overwriting an export, deleting takes): the card shows the exact action and takes Allow or Decline from the keyboard.",
    "When it matters where the time went: the strip and the rows answer that without opening a log.",
  ],
  whenNot: [
    "Every tool call with its arguments and result: use ToolCall in the thread.",
    "The plan before it runs, or steering it while it runs: use AgentPlan or AgentSteering.",
    "A single \"working on it\" line inside a message: use ThinkingLoader.",
    "A standalone yes or no with details and risk: use ApprovalCard.",
  ],
  keyboard: [
    ["Tab", "Moves to Fold away, the step list when it scrolls, Decline and Allow, then the footer's controls."],
    ["↑ ↓", "On the focused step list: scrolls through the finished steps."],
    ["↵", "Waiting, with the card focused: Allow."],
    ["Esc", "Waiting, with focus anywhere in the card: Decline."],
    ["↵ Space", "On the folded bar: opens the card, with focus on Fold away."],
  ],
  a11y: [
    "The card is a region named by the agent, its state and its current step; the folded bar is a button with the same name and aria-expanded.",
    "The time strip is one image whose label lists each step with its time; the rows are an ordered list and their icons are decoration.",
    "Cost and the clock carry words for screen readers (\"Cost so far\", \"Time\").",
    "Failed steps say so in text, not only with the cross and the red bar.",
  ],
  motion: [
    "A new step rolls into the well from below out of a 3px blur; the state pill's label rolls the same way and the key material fades in under Needs you.",
    "A finished step drops into the top of the list out of a 2px blur and the rows below glide down on spring.travel; past three rows the list scrolls with a soft fade on the edge that has more.",
    "The running bar grows live with a sheen passing over it. Waiting on you, a short bar breathes at the end of the strip.",
    "Pointing at a bar lights its row and the others fade back, and the other way round; a bar whose row has scrolled away scrolls it back.",
    "Folding: the card blurs out while the height glides down to the header, which blurs into the bar; new tools slide into the bar's stack.",
    "Reduced motion: everything switches at once; the sheen and the breathing stand still.",
  ],
  details: {
    limit: "One agent per card. Six states, told apart by words and material; only Failed takes a hue.",
    variants: [
      { name: "Running", when: "The well shows the step's icon and its label with a band of light passing over it; Pause and Cancel in the footer." },
      { name: "Needs you", when: "The pill rises as a key and the exact action unfolds with Decline and Allow." },
      { name: "Paused", when: "The clock and the running bar stand still; Resume in the footer." },
      { name: "Finished", when: "A drawn check and the outcome in the well; the footer says how long it took." },
      { name: "Failed", when: "The pill and the bar turn red, the error sits in the well, Try again in the footer." },
      { name: "Folded", when: "One bar: the agent, its tools, the clock, and the pill only when it needs you, finished or failed." },
    ],
    states: [
      {
        name: "Folded",
        note: "A button the size of the tray's header. Opens on click, Enter or Space.",
        render: () => (
          <div style={{ width: 400, maxWidth: "100%" }}>
            <AgentMonitor
              defaultFolded
              state="waiting"
              agent={{ name: "Claude Code", role: "Export" }}
              since={Date.now() - 14000}
              until={Date.now()}
              steps={JOB.slice(0, 6).map(({ ms, ...s }) => ({ ...s, state: "done", took: ms }))}
              ask={{ title: "Wants to overwrite the export", action: "Overwrite Projects-demo.mp4 in ~/Movies" }}
            />
          </div>
        ),
      },
    ],
  },
};
