import { CircleDot, Film, PenLine, Share } from "lucide-react";
import { Mark } from "@/ui/atoms";
import { GettingStarted } from "@/ui/molecules/getting-started";
import type { GettingStartedStep } from "@/ui/molecules/getting-started";
import src from "@/ui/molecules/getting-started/index.tsx?raw";
import type { DocEntry } from "../registry";

const STEPS: GettingStartedStep[] = [
  { id: "record", label: "Record a take", done: true, icon: <CircleDot /> },
  { id: "note", label: "Leave a note on a frame", icon: <PenLine /> },
  { id: "apply", label: "Apply notes with the agent", icon: <Mark size={14} title="" /> },
  { id: "shot", label: "Pick a shot", icon: <Film /> },
  { id: "export", label: "Export", icon: <Share /> },
];

function Demo() {
  return (
    <div style={{ width: 360, maxWidth: "100%" }}>
      <GettingStarted steps={STEPS} autoPlay interval={1800} />
    </div>
  );
}

export const entry: DocEntry = {
  id: "getting-started",
  name: "GettingStarted",
  layer: "Molecules",
  category: "Feedback",
  order: 20,
  isNew: true,
  description: "A short first-run checklist for a new project: record, note, apply, pick a shot, export. Ticking a step draws its check, strikes the label and fills the bar with the light face; nothing moves or changes height while you work through it.",
  demo: () => <Demo />,
  usage: `import { GettingStarted } from "@/ui/molecules/getting-started";

// The app ticks steps as the person does them: pass a new \`done\`.
<GettingStarted
  steps={[
    { id: "record", label: "Record a take", done: project.takes.length > 0, icon: <CircleDot /> },
    { id: "note", label: "Leave a note on a frame", done: project.notes.length > 0, icon: <PenLine /> },
    { id: "apply", label: "Apply notes with the agent", done: appliedOnce, icon: <Mark size={14} title="" /> },
    { id: "shot", label: "Pick a shot", done: project.template !== "focus", icon: <Film /> },
    { id: "export", label: "Export", done: exported, icon: <Share /> },
  ]}
  onChange={(steps) => saveChecklist(steps)}
/>`,
  source: src,
  sourcePath: "src/ui/molecules/getting-started/index.tsx",
  props: [
    { name: "steps", type: "GettingStartedStep[]", description: "{ id, label, done?, icon? } in the order they're usually done. A `done` that changes from the app ticks or unticks the step in place." },
    { name: "title", type: "string = \"Getting started\"", description: "Tray title while steps are open." },
    { name: "doneTitle", type: "string = \"All set\"", description: "The title rolls to this once every step is ticked." },
    { name: "autoPlay", type: "boolean = false", description: "Ticks the open steps one by one and stops at the end. Any click or key press stops it for good." },
    { name: "interval", type: "number = 2200", description: "Ms between two automatic ticks." },
    { name: "onChange", type: "(steps) => void", description: "Every step with its state, after each tick or untick." },
    { name: "className", type: "string", description: "Extra class on the tray." },
  ],
  composedOf: ["Tray", "RollNumber", "RollText", "Well material", "Face material"],
  whenToUse: [
    "The first minutes in a new project: five or six steps that lead from a recording to an export.",
    "Steps the person can do in any order, where seeing progress is the reward.",
    "Let the app tick steps as they happen (a take recorded, a note left) and let people tick the rest by hand.",
  ],
  whenNot: [
    "Steps that must happen in order or unlock each other: the agent's own work belongs in a plan with a status per step.",
    "More than about eight steps, or labels that don't fit one line: the list stops being scannable.",
    "Export or render progress you can measure: show the percentage, not a checklist.",
  ],
  keyboard: [
    ["Tab", "Moves between the steps."],
    ["Space ↵", "Ticks or unticks the focused step."],
  ],
  a11y: [
    "Each step is a button with role=\"checkbox\" and aria-checked.",
    "The bar is a progressbar with the count as aria-valuetext (\"2 of 5 done\"); the rolling count in the tray header is hidden so it isn't read twice.",
    "Any click or key press stops autoPlay, so it never fights someone using the list.",
  ],
  motion: [
    "On mount the tray settles up 6px and the rows rise out of a 2px blur, 60ms apart.",
    "Ticking: the ring fills with the light face and pops once, then the tick draws itself over 360ms.",
    "A line strikes the label from the left while it fades to muted.",
    "The bar's fill glides to the new length on the drawer curve and a pass of light runs along it, only when progress grows.",
    "The count rolls its changed digit; the title rolls to \"All set\" when the last step is ticked.",
    "Reduced motion: every change is instant and nothing rises, pops or sweeps.",
  ],
};
