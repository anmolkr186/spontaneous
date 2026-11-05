import { useState } from "react";
import { ContextWindow } from "@/ui/organisms/context-window";
import type { ContextPart } from "@/ui/organisms/context-window";
import src from "@/ui/organisms/context-window/index.tsx?raw";
import { DemoPanel, useScript } from "../demo";
import type { DocEntry } from "../registry";

const frame = (id: string, at: number) => ({ id, label: "Frame", at, tokens: 1600 });

/** The agent half way through the Projects demo: six frames looked at and a long conversation. */
const START: ContextPart[] = [
  { id: "system", label: "System prompt", tokens: 3100, locked: true },
  { id: "tools", label: "Tools", tokens: 6400, locked: true },
  { id: "outline", label: "Project outline", tokens: 4800 },
  { id: "transcript", label: "Transcript", tokens: 18600 },
  { id: "notes", label: "Notes", tokens: 1400, tone: "ink" },
  { id: "frames", label: "Frames looked at", items: [frame("f1", 12), frame("f2", 37), frame("f3", 49), frame("f4", 58), frame("f5", 66), frame("f6", 75)] },
  { id: "conversation", label: "Conversation", tokens: 107300, compact: true },
];

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function Demo() {
  const [parts, setParts] = useState(START);
  const [pointAt, setPointAt] = useState<string | null>(null);
  const update = (id: string, change: (p: ContextPart) => ContextPart) => setParts((all) => all.map((p) => (p.id === id ? change(p) : p)));
  const click = (selector: string) => root.current?.querySelector<HTMLButtonElement>(selector)?.click();
  const root = useScript([
    { at: 1400, run: () => { update("frames", (p) => ({ ...p, items: [...p.items!, frame("f7", 105)] })); update("conversation", (p) => ({ ...p, tokens: p.tokens! + 8400 })); } },
    { at: 3400, run: () => setPointAt("transcript") },
    { at: 4800, run: () => setPointAt("frames") },
    { at: 6200, run: () => setPointAt(null) },
    { at: 7000, run: () => click("[data-compact='conversation'] button") },
    { at: 11400, run: () => click("[data-part-toggle='frames']") },
    { at: 12800, run: () => click("[data-remove='frames/f1']") },
  ]);
  return (
    <div ref={root}>
      <DemoPanel>
        <ContextWindow
          parts={parts}
          limit={200000}
          model="Opus"
          pointAt={pointAt}
          action={{ label: "New chat", onClick: () => setParts(START) }}
          onRemoveItem={(part, item) => update(part, (p) => ({ ...p, items: p.items?.filter((i) => i.id !== item) }))}
          onCompact={async (part) => { await wait(2200); update(part, (p) => ({ ...p, tokens: 23600 })); }}
        />
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "context-window",
  name: "ContextWindow",
  layer: "Organisms",
  category: "Agent",
  order: 100,
  isNew: true,
  description: "What fills the agent's context right now, as a field of cells: the system prompt, tools, the project outline, the transcript, your notes, the frames it looked at and the conversation. Point at a part to light it, drop frames, and compact the conversation while its cells shimmer and clear.",
  demo: () => <Demo />,
  usage: `import { ContextWindow } from "@/ui/organisms/context-window";

<ContextWindow
  limit={200000}
  model="Opus"
  parts={[
    { id: "system", label: "System prompt", tokens: 3100, locked: true },
    { id: "tools", label: "Tools", tokens: 6400, locked: true },
    { id: "outline", label: "Project outline", tokens: 4800 },
    { id: "transcript", label: "Transcript", tokens: 18600 },
    { id: "notes", label: "Notes", tokens: 1400, tone: "ink" },
    { id: "frames", label: "Frames looked at", items: frames.map((f) => ({ id: f.id, label: "Frame", at: f.t, tokens: f.tokens })) },
    { id: "conversation", label: "Conversation", tokens: session.tokens, compact: true },
  ]}
  onRemoveItem={(part, id) => agent.forget(part, id)}
  onCompact={() => agent.compact()}
  action={{ label: "New chat", onClick: agent.reset }}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/context-window/index.tsx",
  props: [
    { name: "parts", type: "ContextPart[]", description: "{ id, label, tokens?, items?, locked?, compact?, tone? }. They fill the field in this order." },
    { name: "tokens", type: "number", description: "Per part. Defaults to the sum of its items." },
    { name: "items", type: "{ id, label, tokens, at? }[]", description: "Per part. Things that can be dropped one by one; at puts a time after the label (\"Frame 0:12\")." },
    { name: "locked / compact", type: "boolean", description: "Per part. Locked shows a lock; compact offers Compact." },
    { name: "tone", type: "\"ink\" | 100–600", description: "Per part. A graphite level for its cells; ink only for what you made (notes). Defaults to the ramp, dim to bright." },
    { name: "limit", type: "number", description: "Size of the context window in tokens." },
    { name: "title", type: "string = \"Context\"", description: "Heading in the tray." },
    { name: "model", type: "string", description: "Small tag in the tray head." },
    { name: "onRemoveItem", type: "(partId, itemId) => void", description: "With it the card shows exactly what you pass; without it the removal lives in the card." },
    { name: "onCompact", type: "(partId) => void | Promise", description: "The cells shimmer until the promise settles. Without it the part shrinks to about a fifth on its own." },
    { name: "action", type: "{ label, onClick }", description: "A key on the tray foot, e.g. New chat." },
    { name: "warnAt", type: "number = 0.8", description: "Share from which the percentage turns foreground with an \"Almost full\" tag; from 0.95 it says Full." },
    { name: "cells / columns", type: "number = 216 / 36", description: "Cells in the field and cells per row." },
    { name: "pointAt", type: "string | null", description: "Lights a part as if it were pointed at. For walkthroughs." },
  ],
  composedOf: ["Tray", "Cell", "RollNumber", "RollText", "Fold", "Key", "IconKey", "Tag", "Swap", "DrawCheck", "RaySpinner"],
  whenToUse: [
    "Beside the agent thread or in a session panel, so people see what the agent has in mind and why answers get slow or forgetful.",
    "Cleaning up before the window fills: drop frames it no longer needs, compact the conversation.",
    "Explaining a request: how much went to the prompt, tools, the project outline and the transcript.",
  ],
  whenNot: [
    "A plain \"72% used\": a single bar says that with less.",
    "More than about seven parts: group the small ones, the graphite levels stop being told apart.",
    "What the agent changed in the project: use AgentLedger.",
  ],
  keyboard: [
    ["Tab", "Moves through the parts that open, Compact, the items' remove keys and the tray action."],
    ["↵ Space", "Opens or closes a part with items, presses Compact or removes an item; focus moves to the next item."],
  ],
  a11y: [
    "A group named by its title. The rolling numbers are aria-hidden; screen readers get \"161,200 of 200,000 tokens used, 81%\" in one sentence.",
    "The field of cells is decorative: every number it shows is in the list below it.",
    "Parts with items are buttons with aria-expanded; folded lists are inert; remove keys are named after their item (\"Remove Frame 0:12\").",
    "Compacting, what it saved and removals are announced politely.",
  ],
  motion: [
    "Any change sweeps through the field cell by cell, 2.5ms apart, from the first cell that changed hands.",
    "Pointing at a part (its row or its cells) fades the other cells and rows; the big number rolls to that part and its label rolls in.",
    "Removing a frame folds its row away on the smooth spring, and the cells behind it empty left to right.",
    "Compact: the part's cells breathe in a wave across the columns while it works; then most clear, the numbers roll down, and the key turns into a drawn check with \"Compacted\" that fades after a moment. It comes back only once the part has grown again.",
    "Near the limit the percentage turns foreground and an \"Almost full\" tag rises in; the tray foot rolls to how much is left.",
    "Reduced motion: cells change at once, the wave stands still at half light, and numbers switch without rolling.",
  ],
};
