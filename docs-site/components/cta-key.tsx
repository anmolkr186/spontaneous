import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Key } from "@/ui/atoms";
import { CtaKey, CtaRegion, CtaRoot, notesLabel } from "@/ui/cta";
import src from "@/ui/cta/cta-key.tsx?raw";
import { useScript } from "../demo";
import type { DocEntry } from "../registry";

const NOTES = [
  [{ at: 12, intents: ["zoom" as const] }],
  [{ at: 12, intents: ["zoom" as const] }, { at: 31, intents: ["zoom" as const] }],
  [{ at: 12, intents: ["zoom" as const] }, { at: 42, intents: ["cut" as const] }, { at: 65, intents: ["callout" as const] }],
];

function Demo() {
  const [n, setN] = useState(0);
  const [asking, setAsking] = useState(false);
  const root = useScript([
    { at: 1400, run: () => setN(1) },
    { at: 2800, run: () => setN(2) },
    { at: 4400, run: () => setAsking(true) },
    { at: 6800, run: () => setAsking(false) },
  ]);
  return (
    <div ref={root} style={{ display: "grid", gap: 20, justifyItems: "center" }}>
      <CtaRoot>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CtaRegion name="title"><CtaKey intent="finish" label="Export 1080p" /></CtaRegion>
          <CtaRegion name="panel">
            <div style={{ display: "flex", gap: 8 }}>
              <CtaKey intent="run" count={NOTES[n]!.length} label={notesLabel(NOTES[n]!)} />
              {asking && <CtaKey intent="decide" risk="destructive" icon={<Trash2 />} label="Delete 3 takes" />}
            </div>
          </CtaRegion>
        </div>
      </CtaRoot>
      <div style={{ display: "flex", gap: 6 }}>
        <Key size="sm" variant="tertiary" onClick={() => setN((n + 1) % NOTES.length)}>Change notes</Key>
        <Key size="sm" variant="tertiary" onClick={() => setAsking(!asking)}>{asking ? "Answer" : "Agent asks"}</Key>
      </div>
    </div>
  );
}

export const entry: DocEntry = {
  id: "cta-key",
  name: "CtaKey",
  layer: "Atoms",
  category: "Primitives",
  order: 3,
  isNew: true,
  description: "A key that says what it will do and takes its rank from the surface it's on. Its label is derived from context, or proposed by the agent and checked; inside a CtaRegion it becomes the one primary only when its intent outranks everything else there.",
  demo: () => <Demo />,
  usage: `import { CtaKey, CtaRegion, CtaRoot, notesLabel } from "@/ui/cta";

<CtaRoot>                                   {/* once per window */}
  <CtaRegion name="notes">
    <CtaKey intent="run" count={open.length} label={notesLabel(open)}
      disabled={!open.length} reason="No open notes" onClick={applyNotes} />
  </CtaRegion>
  <CtaRegion name="titlebar">
    <CtaKey intent="finish" label={exportLabel()} />   {/* waits while notes are open */}
  </CtaRegion>
</CtaRoot>

// From an agent tool call: its label is shown when it passes the checks
<CtaKey intent="decide" risk="risky" label={approvalLabels(tool).approve} proposal={cta?.primary?.label} icon={<Check />} />`,
  source: src,
  sourcePath: "src/ui/cta/cta-key.tsx",
  props: [
    { name: "intent", type: "\"decide\" | \"run\" | \"review\" | \"apply\" | \"finish\" | \"navigate\" | \"dismiss\"", description: "What kind of step it is; ranks it in its region. Dismiss is never primary." },
    { name: "label", type: "string", description: "The label derived from context (derive.ts). Shown unless the agent's passes." },
    { name: "proposal", type: "string", description: "The agent's label. Checked by validate.ts; turned down labels fall back and warn in dev." },
    { name: "risk", type: "\"safe\" | \"risky\" | \"destructive\"", description: "Destructive labels must name what they affect; a destructive primary is red." },
    { name: "count", type: "number", description: "How many things it touches; a number in the agent's label must match." },
    { name: "icon / shortcut / trailing", type: "ReactNode / string / ReactNode", description: "Leading icon, a key cap after the label, or custom trailing content." },
    { name: "disabled / reason", type: "boolean / string", description: "Disabled keys stay focusable and say why on hover." },
    { name: "role", type: "\"primary\" | \"secondary\"", description: "Forces a role and skips the election, e.g. Export while a run is going." },
    { name: "fallback", type: "\"primary\" | \"secondary\" = \"primary\"", description: "The role with no CtaRegion around it." },
  ],
  composedOf: ["Key", "RollText", "Kbd", "Tooltip"],
  whenToUse: [
    "Any key that moves the work forward: run, apply, accept, approve, export.",
    "Keys whose words depend on what will happen: counts, kinds of edit, times, scopes.",
  ],
  whenNot: [
    "Quiet or escape actions (Cancel, Dismiss, Undo): a tertiary Key.",
    "Transport and tools (Play, Split, pen): Key or IconKey. They never compete for the primary.",
  ],
  keyboard: [["↵ Space", "Runs it, same as click. A disabled key does nothing but stays focusable."]],
  a11y: [
    "A native button; disabled keys use aria-disabled so the reason stays reachable.",
    "The label rolling out is hidden from assistive tech; the new label is read once.",
  ],
  motion: [
    "Gaining the primary crossfades the light face in over 240ms; losing it fades back. Weight stays the same, so the width never jumps.",
    "A new label rolls in from a 3px blur and the key glides to its width.",
    "Reduced motion: instant swaps.",
  ],
};
