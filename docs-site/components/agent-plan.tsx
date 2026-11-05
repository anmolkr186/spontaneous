import { useEffect, useRef, useState } from "react";
import { AgentPlan } from "@/ui/organisms/agent-plan";
import type { PlanStatus, PlanStep } from "@/ui/organisms/agent-plan";
import src from "@/ui/organisms/agent-plan/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

const PLAN: PlanStep[] = [
  { id: "cut", title: "Cut the dead air after the form", tool: "Cut", from: 42, to: 51 },
  { id: "typing", title: "Speed up the typing to 2×", tool: "Speed", from: 20, to: 31 },
  { id: "zoom", title: "Zoom on the Create button", tool: "Zoom", from: 12 },
  { id: "callout", title: "Add a callout on the Share menu", tool: "Callout", from: 65 },
  { id: "camera", title: "Retime the camera to the new cuts", tool: "Camera" },
];

const TOOK: Record<string, number> = { zoom: 1400, typing: 1900, cut: 1100, blur: 1300, callout: 1600, camera: 2100 };
const fresh = (steps: PlanStep[]) => steps.map(({ status: _s, duration: _d, startedAt: _a, error: _e, ...s }) => s);

/** Plays the plan the way the agent would: one step after another, each taking its time. */
function useRunner(setSteps: (fn: (s: PlanStep[]) => PlanStep[]) => void, setStatus: (s: PlanStatus) => void) {
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);
  const patch = (i: number, p: Partial<PlanStep>) => setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (list: PlanStep[], from = 0, failAt?: number) => {
    clear();
    setStatus("running");
    let t = 120;
    for (let i = from; i < list.length; i++) {
      const took = TOOK[list[i]!.id] ?? 1500;
      timers.current.push(window.setTimeout(() => patch(i, { status: "running", startedAt: Date.now(), error: undefined }), t));
      t += took;
      if (i === failAt) {
        timers.current.push(window.setTimeout(() => patch(i, { status: "failed", duration: took, error: "The Share menu is closed at 1:05, so there's nothing to point at." }), t));
        return;
      }
      timers.current.push(window.setTimeout(() => patch(i, { status: "done", duration: took }), t));
    }
    timers.current.push(window.setTimeout(() => setStatus("done"), t + 80));
  };
}

function Demo() {
  const [steps, setSteps] = useState(PLAN);
  const [status, setStatus] = useState<PlanStatus>("draft");
  const run = useRunner(setSteps, setStatus);
  const latest = useRef(steps);
  latest.current = steps;

  const root = useScript([
    // Review: the zoom moves to the front, where it happens in the video, and a step is added.
    { at: 1800, run: () => setSteps((s) => { const z = s.find((x) => x.id === "zoom")!; return [z, ...s.filter((x) => x.id !== "zoom")]; }) },
    { at: 2900, run: () => setSteps((s) => { const t = s.find((x) => x.id === "typing")!; const rest = s.filter((x) => x.id !== "typing"); return [rest[0]!, t, ...rest.slice(1)]; }) },
    { at: 4100, run: () => setSteps((s) => [...s.slice(0, 3), { id: "blur", title: "Blur the email in the invite field", tool: "Blur", from: 48, to: 56 }, ...s.slice(3)]) },
    // Run: the callout fails the first time, then the plan retries from there.
    { at: 5600, run: () => run(latest.current, 0, latest.current.findIndex((s) => s.id === "callout")) },
    { at: 15200, run: () => run(latest.current, latest.current.findIndex((s) => s.id === "callout")) },
  ]);

  return (
    <div ref={root}>
      <DemoPanel width={430}>
        <UserSays>Tighten the Projects walkthrough. It drags in the middle.</UserSays>
        <AgentSays>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>Here is what I'd change. Edit anything before I run it.</p>
          <AgentPlan
            title="Tighten the Projects walkthrough"
            steps={steps}
            onChange={setSteps}
            status={status}
            estimate="~10s"
            onRun={(list) => { const next = fresh(list); setSteps(next); run(next); }}
            onCancel={() => setSteps(PLAN)}
            onRetry={(id) => run(latest.current, latest.current.findIndex((s) => s.id === id))}
          />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "agent-plan",
  name: "AgentPlan",
  layer: "Organisms",
  category: "Agent",
  order: 10,
  isNew: true,
  description: "The agent's edit plan, to review before it runs: rename, reorder, remove or add steps, then run it. The same card then shows each step working, how long it took, and where it failed, with a retry from that step.",
  demo: () => <Demo />,
  usage: `import { AgentPlan } from "@/ui/organisms/agent-plan";

<AgentPlan
  title="Tighten the Projects walkthrough"
  estimate="~40s"
  steps={steps}
  onChange={setSteps}
  status={status}
  onRun={(ordered) => { agent.run(ordered); setStatus("running"); }}
  onCancel={dismiss}
  onRetry={(stepId) => agent.retryFrom(stepId)}
/>

// A step: the edit in plain words, its kind as a human name, and where it acts.
{ id: "cut", title: "Cut the dead air after the form", tool: "Cut", from: 42, to: 51 }

// While running, update each step as it goes:
{ ...step, status: "running", startedAt: Date.now() }
{ ...step, status: "done", duration: 1400 }
{ ...step, status: "failed", duration: 900, error: "The Share menu is closed at 1:05." }`,
  source: src,
  sourcePath: "src/ui/organisms/agent-plan/index.tsx",
  props: [
    { name: "title", type: "string", description: "The goal of the plan. The card's heading and the list's accessible name." },
    { name: "steps", type: "PlanStep[]", description: "Controlled steps: { id, title, tool?, from?, to?, status?, duration?, startedAt?, error? }. Pair with onChange." },
    { name: "defaultSteps", type: "PlanStep[] = []", description: "Initial steps when uncontrolled; edits stay inside the component." },
    { name: "onChange", type: "(steps) => void", description: "Every edit in review (rename, reorder, remove, add), with the whole list in its new order." },
    { name: "status", type: "\"draft\" | \"running\" | \"done\"", description: "Review and edit, running, or finished. Default draft. Editing only works in draft." },
    { name: "onRun", type: "(steps) => void", description: "Run plan was pressed, or Run again once done. Gets the steps in their final order; set status to running here." },
    { name: "onCancel", type: "() => void", description: "Shows Cancel next to Run plan." },
    { name: "onRetry", type: "(stepId) => void", description: "Shows Retry from here under a failed step." },
    { name: "estimate", type: "string", description: "Rough run time for the tray header in review, already formatted: \"~40s\"." },
    { name: "startedAt", type: "number", description: "When the run started, in ms. Defaults to the moment status turns running." },
    { name: "step.tool", type: "string", description: "The kind of edit by its human name (Cut, Zoom, Speed, Callout, Camera), shown as a quiet tag." },
    { name: "step.from / step.to", type: "number", description: "Where the step acts on the recording, in seconds. A moment, or a range when both are set." },
    { name: "step.status", type: "\"pending\" | \"running\" | \"done\" | \"failed\"", description: "Where the step is during a run." },
    { name: "step.duration / step.startedAt", type: "number", description: "How long it took (ms), or when it started, so its clock ticks while it runs." },
    { name: "step.error", type: "string", description: "Why it failed, in a few words. Shown under the step with Retry from here." },
  ],
  composedOf: ["Tray", "Tag", "Timecode", "RollNumber", "RaySpinner", "Shimmer", "Fold", "Swap", "Duration", "Key", "IconKey"],
  whenToUse: [
    "The agent is about to make several edits in a row and the person should agree to them first: cuts, zooms, speed changes, callouts.",
    "Edits that take a while to apply or redo, where a wrong order or an extra step costs real time.",
    "Showing that same plan while it runs: which step is working, how long each took, where it stopped.",
  ],
  whenNot: [
    "One edit that needs a yes or no: use ApprovalCard.",
    "Steering a run that has already started, by adding notes for the next step: use AgentSteering.",
    "What the agent is thinking, with no editable steps: use ThinkingState.",
    "A list of edits already made, each with Undo: use AgentLedger.",
  ],
  keyboard: [
    ["Tab", "Moves between the steps, their remove buttons, the Add step field and the tray's actions."],
    ["↑ ↓", "Moves focus to the previous or next step."],
    ["⌥ ↑ ⌥ ↓", "Moves the focused step up or down."],
    ["↵", "Renames the focused step; Enter again saves. In Add step: adds the step at the end and keeps the field ready."],
    ["Esc", "Cancels a rename."],
    ["Delete", "Removes the focused step; focus moves to the next one."],
  ],
  a11y: [
    "The steps are an ordered list named by the plan's title. In review each step is focusable and described by its shortcuts.",
    "Moves, renames, removals and additions are read out in a polite live region (\"Moved “Zoom on the Create button” to position 1 of 5\").",
    "While running, each step carries its status as text, the working one has aria-current=\"step\", and each step starting, finishing or failing is read out.",
    "The drag grip is for the pointer only; Alt with the arrow keys does the same from the keyboard.",
    "Remove buttons are labelled with the step's name. The folded Add step field is inert while the plan runs.",
  ],
  motion: [
    "Dragging is live: the step follows the pointer as a lifted key, the others slide aside, and everything settles on spring.travel (560ms, no bounce). Keyboard moves and order changes from props glide the same way.",
    "The numbers roll to their new values when steps change place.",
    "A removed step blurs out quickly, then the gap closes on spring.travel; an added step rises 6px out of a 2px blur.",
    "Running: the number blurs out as rays take its place; done, a light cell pops in (one 5% overshoot) under a check that draws itself in 360ms. Failed gets a cross on a rec tint.",
    "The rail on the left fills down to the next number on the fold curve as each step finishes.",
    "Add step folds away, the card's height glides, and the tray's actions blur into \"Running · 2 of 5\" with a live clock, then \"Done in 9.6s\" with a drawn check.",
    "Reduced motion: everything switches in place with no movement, the rays stand still and nothing draws.",
  ],
  details: {
    limit: "One plan per card. Up to about ten steps; past that, split the job.",
    variants: [
      { name: "Draft", when: "Review: rename, drag, remove and add. The tray holds Cancel and Run plan." },
      { name: "Running", when: "Editing folds away; one step works at a time and the tray shows the count and the clock." },
      { name: "Done", when: "Every step checked; the tray says how long it took and offers Run again." },
    ],
    states: [
      {
        name: "Stopped on a failure",
        note: "The failed step says why and offers Retry from here. The tray stops the clock.",
        render: () => (
          <div style={{ width: 400, maxWidth: "100%" }}>
            <AgentPlan
              title="Tighten the Projects walkthrough"
              status="running"
              onRetry={() => {}}
              defaultSteps={[
                { id: "a", title: "Zoom on the Create button", tool: "Zoom", from: 12, status: "done", duration: 1400 },
                { id: "b", title: "Speed up the typing to 2×", tool: "Speed", from: 20, to: 31, status: "done", duration: 1900 },
                { id: "c", title: "Add a callout on the Share menu", tool: "Callout", from: 65, status: "failed", duration: 900, error: "The Share menu is closed at 1:05, so there's nothing to point at." },
                { id: "d", title: "Retime the camera to the new cuts", tool: "Camera" },
              ]}
            />
          </div>
        ),
      },
    ],
  },
};
