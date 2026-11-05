import { useState } from "react";
import { Timecode } from "@/ui/atoms";
import { ThinkingState } from "@/ui/organisms/thinking-state";
import type { ThinkingStep } from "@/ui/organisms/thinking-state";
import src from "@/ui/organisms/thinking-state/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

/* Frame swatches: graphite app chrome with the product's blue panels, as the recording shows them. */
const FRAME = {
  toolbar: "linear-gradient(180deg, #2a2d34 0 22%, #1b1d22 22% 100%)",
  dialog: "radial-gradient(60% 50% at 50% 55%, #39404d 0 60%, transparent 61%), linear-gradient(180deg, #23262d, #16181c)",
  share: "linear-gradient(90deg, #1b1d22 0 62%, #2c3a57 62% 100%)",
  idle: "linear-gradient(180deg, #202228, #15161a)",
};

const STEPS: ThinkingStep[] = [
  { id: "read", label: "Reading the project", detail: "1:32 recording, 3 notes, 4 zooms" },
  {
    id: "click", label: "Finding the click on Create",
    moments: [
      { id: "m1", at: 12.4, label: "Create button", thumb: FRAME.toolbar },
      { id: "m2", at: 13.1, label: "Click on Create", thumb: FRAME.toolbar },
      { id: "m3", at: 14.2, label: "New project dialog", thumb: FRAME.dialog },
    ],
  },
  {
    id: "air", label: "Looking for dead air",
    moments: [
      { id: "m4", at: 21.5, label: "Loading spinner", thumb: FRAME.idle },
      { id: "m5", at: 58.4, label: "Cursor idle", thumb: FRAME.idle },
      { id: "m6", at: 62.9, label: "Share dialog opens", thumb: FRAME.share },
      { id: "m7", at: 66, label: "Invite field", thumb: FRAME.share },
      { id: "m8", at: 71.2, label: "Cursor idle", thumb: FRAME.idle },
    ],
  },
  { id: "plan", label: "Planning the edit", detail: "One zoom, two cuts" },
];

function Demo() {
  const [open, setOpen] = useState(true);
  const [playhead, setPlayhead] = useState(0);
  // The steps run on the component's own timer; the script only folds them away once it's done.
  const root = useScript([{ at: 8200, run: () => setOpen(false) }]);
  return (
    <div ref={root}>
      <DemoPanel>
        <UserSays>Tighten the start: zoom on Create and drop the dead air.</UserSays>
        <AgentSays status={playhead ? <>Playhead <Timecode value={playhead} muted /></> : undefined}>
          <ThinkingState steps={STEPS} stepMs={1500} doneLabel="Ready: 1 zoom, 2 cuts" open={open} onOpenChange={setOpen} onSeek={setPlayhead} />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "thinking-state",
  name: "ThinkingState",
  layer: "Organisms",
  category: "Chat",
  order: 20,
  isNew: true,
  description: "The agent's working panel while it reads a recording and plans an edit: a live clock, the steps it takes on a rail, and the moments of the recording it looked at. It settles on \"Worked for 9.4s\" and a check, and folds away.",
  demo: () => <Demo />,
  usage: `import { ThinkingState } from "@/ui/organisms/thinking-state";

// Driven by the agent's stream
<ThinkingState
  steps={[
    { id: "read", label: "Reading the project", detail: "1:32 recording, 3 notes" },
    { id: "click", label: "Finding the click on Create", moments: [
      { id: "f1", at: 12.4, label: "Create button", thumb: \`url(\${frameAt(12.4)})\` },
      { id: "f2", at: 14.2, label: "New project dialog", thumb: \`url(\${frameAt(14.2)})\` },
    ] },
    { id: "plan", label: "Planning the edit" },
  ]}
  activeIndex={stream.step}
  done={stream.finished}
  doneLabel="Ready: 1 zoom, 2 cuts"
  onSeek={(t) => player.seek(t)}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/thinking-state/index.tsx",
  props: [
    { name: "steps", type: "ThinkingStep[]", description: "{ id, label, detail?, moments? }, revealed in order. Moments are { id, at, label, thumb? }: what the agent looked at, as chips with a timecode and a frame swatch." },
    { name: "stepMs", type: "number = 1300", description: "Pause between two steps when it runs on its own timer, in ms." },
    { name: "activeIndex", type: "number", description: "Controlled: the step working now. Earlier steps are done, later ones aren't shown yet. Stops the timer." },
    { name: "done", type: "boolean", description: "Controlled: all steps done. The clock stops and the final row draws its check. Back to false starts over." },
    { name: "doneLabel", type: "string = \"Ready\"", description: "Label of the final row. Say what came of it: \"Ready: 1 zoom, 2 cuts\"." },
    { name: "label", type: "string = \"Working\"", description: "Header while working." },
    { name: "onDone", type: "(ms: number) => void", description: "Called once when the work is done, with how long it took." },
    { name: "onSeek", type: "(at: number) => void", description: "Called when a moment chip is pressed, with its position in seconds." },
    { name: "maxMoments", type: "number = 3", description: "Chips per step before \"+N more\"." },
    { name: "open / defaultOpen / onOpenChange", type: "boolean / boolean = true / (open) => void", description: "Whether the steps are unfolded, controlled or not." },
  ],
  composedOf: ["Tray and TrayCard", "RollText", "Duration", "Shimmer", "Cell", "DrawCheck", "Fold", "Tooltip"],
  whenToUse: [
    "Runs of several seconds where the agent reads the recording, finds moments and plans: a visible trail keeps people waiting calmly.",
    "When it matters which moments the agent looked at; the chips let people check them on the timeline.",
    "Stream-driven work: map each agent phase to a step with activeIndex and finish with done.",
  ],
  whenNot: [
    "Waits under a couple of seconds, or a single phase: use ThinkingLoader.",
    "The edits themselves (zooms, cuts, speed): use ToolCall and ToolCallGroup, which show arguments and results.",
    "Progress you can measure, like an export: show the percentage.",
  ],
  keyboard: [
    ["↵ Space", "On the header: folds the steps away or back. On a chip: seeks the recording there. On \"+N more\": shows the rest."],
    ["Tab", "Moves through the header and the chips; each chip shows its tooltip on focus."],
  ],
  a11y: [
    "The header is a button with aria-expanded and aria-controls; folded steps are inert.",
    "The rail is a polite live list: each new step is announced once as it arrives.",
    "Chips are named \"Go to 0:12, Create button\"; \"+N more\" is named \"Show 2 more moments\" and hands focus to the first one it reveals.",
  ],
  motion: [
    "The header shimmers \"Working\" next to a ticking clock, then rolls to \"Worked for\" as the clock settles.",
    "Each new step: the previous node draws the rail down to it (300ms), then the step rises out of a 2px blur 180ms later.",
    "The step in progress pulses its cell in the live color and shimmers its label.",
    "Moment chips pop in one after another, 80ms apart, on the pop curve.",
    "At the end a check pops in at the foot of the rail and draws its tick.",
    "The steps fold away and back on grid rows; the chevron turns.",
    "Reduced motion: steps, chips and the check appear without movement, the pulse and shimmer stand still.",
  ],
};
