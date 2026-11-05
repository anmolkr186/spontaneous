import { useState } from "react";
import { AudioLines, FileVideo, Gauge, Mic, Scissors, Trash2, ZoomIn } from "lucide-react";
import { AutonomyDial } from "@/ui/organisms/autonomy-dial";
import type { AgentAction, AutonomyLevel } from "@/ui/organisms/autonomy-dial";
import src from "@/ui/organisms/autonomy-dial/index.tsx?raw";
import { DemoPanel, useScript } from "../demo";
import type { DocEntry } from "../registry";

const ACTIONS: AgentAction[] = [
  { id: "zoom", label: "Add zooms", detail: "Pushes in on clicks and typing", risk: "safe", icon: <ZoomIn /> },
  { id: "trim", label: "Trim silences", detail: "Shortens pauses between sentences", risk: "safe", icon: <AudioLines /> },
  { id: "speed", label: "Change speed", detail: "Speeds up loading and typing", risk: "safe", icon: <Gauge /> },
  { id: "cut", label: "Cut footage", detail: "Removes stretches of the recording", risk: "risky", icon: <Scissors /> },
  { id: "audio", label: "Replace audio", detail: "Swaps in a cleaned or new narration", risk: "risky", icon: <Mic /> },
  { id: "overwrite", label: "Overwrite an export", detail: "Writes over a file you exported", risk: "destructive", icon: <FileVideo /> },
  { id: "delete", label: "Delete takes", detail: "Removes takes from the project", risk: "destructive", icon: <Trash2 /> },
];

function Demo() {
  const [level, setLevel] = useState<AutonomyLevel>(1);
  const [pinned, setPinned] = useState<string[]>(["delete"]);
  const root = useScript([
    { at: 1800, run: () => setLevel(2) },
    { at: 4400, run: () => setPinned((p) => [...p, "overwrite"]) },
    { at: 6800, run: () => setLevel(0) },
    { at: 9200, run: () => setLevel(1) },
  ]);
  return (
    <div ref={root}>
      <DemoPanel>
        <AutonomyDial actions={ACTIONS} level={level} onLevelChange={setLevel} pinned={pinned} onPinnedChange={setPinned} />
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "autonomy-dial",
  name: "AutonomyDial",
  layer: "Organisms",
  category: "Agent",
  order: 80,
  isNew: true,
  description: "How much the agent may do without asking: a three-stop dial over the agent's real actions, split into \"Runs on its own\" and \"Asks you first\". Changing the stop glides each action that changes side into its new group, and a lock keeps any action asking whatever the stop.",
  demo: () => <Demo />,
  usage: `import { AutonomyDial } from "@/ui/organisms/autonomy-dial";

const actions = [
  { id: "zoom", label: "Add zooms", detail: "Pushes in on clicks and typing", risk: "safe", icon: <ZoomIn /> },
  { id: "cut", label: "Cut footage", detail: "Removes stretches of the recording", risk: "risky", icon: <Scissors /> },
  { id: "delete", label: "Delete takes", detail: "Removes takes from the project", risk: "destructive", icon: <Trash2 /> },
];

// Saved with the project's agent settings
<AutonomyDial
  actions={actions}
  level={settings.autonomy}
  onLevelChange={(level) => save({ autonomy: level })}
  pinned={settings.alwaysAsk}
  onPinnedChange={(ids) => save({ alwaysAsk: ids })}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/autonomy-dial/index.tsx",
  props: [
    { name: "actions", type: "{ id, label, detail?, risk, icon? }[]", description: "The agent's actions in list order. risk is \"safe\" | \"risky\" | \"destructive\"." },
    { name: "level", type: "0 | 1 | 2", description: "Controlled stop: 0 Always ask, 1 If risky (safe actions run), 2 Full auto." },
    { name: "defaultLevel", type: "0 | 1 | 2 = 1", description: "Starting stop when uncontrolled." },
    { name: "onLevelChange", type: "(level) => void", description: "Another stop was picked." },
    { name: "pinned", type: "string[]", description: "Controlled ids of locked actions: they always ask, whatever the stop." },
    { name: "defaultPinned", type: "string[] = []", description: "Starting locks when uncontrolled." },
    { name: "onPinnedChange", type: "(pinned: string[]) => void", description: "A lock was set or removed." },
    { name: "title", type: "string = \"Claude Code\"", description: "Heading, usually the agent's name." },
    { name: "subtitle", type: "string", description: "Line under the heading. Default: \"What it may do without asking you\"." },
  ],
  composedOf: ["Tray", "Switcher look (local radiogroup)", "Cell", "Tag", "IconKey", "RollNumber", "Swap"],
  whenToUse: [
    "The agent settings of a project: how much it may edit without asking.",
    "First run with the agent, where people decide how much to trust it before it touches their recording.",
    "Anywhere a permission level is abstract: the two groups show what the level means for this project's actions.",
  ],
  whenNot: [
    "One decision before one edit: use ApprovalCard.",
    "One right the agent asks for in the moment (read the mic track, write to a folder): use PermissionRequest.",
    "A handful of unrelated on/off settings with no levels: a list of Switches is clearer.",
  ],
  keyboard: [
    ["← →", "Picks the previous or next stop (↑ ↓, Home and End too)."],
    ["Tab", "Moves from the dial to the locks of the actions."],
    ["Space", "Sets or removes the focused lock; focus follows the action into its new group."],
  ],
  a11y: [
    "The stops are a radio group labelled \"Autonomy\" with a roving tab stop, described by the sentence on what the stop means.",
    "Both groups are sections labelled by their headings; each lock is a toggle with aria-pressed and a label naming its action (\"Always ask before cut footage\").",
    "Every change is announced politely: the stop and how many actions run on their own or ask first.",
  ],
  motion: [
    "The raised key glides to the chosen stop on the morph spring; the stop's three-cell gauge lights up.",
    "The sentence under the dial swaps with a blur: the old one blurs out as the new one rises in.",
    "Actions that change side travel to their new group on spring.travel (no bounce), a beat (60ms) after each other in list order; the rest make room.",
    "The card's height springs to fit on the same curve, and the group counts roll.",
    "Locks show on the row you point at or tab into and swap between open and closed with a blur.",
    "Reduced motion: actions, height and the key switch at once; nothing travels.",
  ],
};
