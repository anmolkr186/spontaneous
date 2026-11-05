import { useState } from "react";
import { ThinkingLoader } from "@/ui/molecules/thinking-loader";
import src from "@/ui/molecules/thinking-loader/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

function Demo() {
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState(0);
  const root = useScript([
    { at: 1800, run: () => setPhase(1) },
    { at: 3800, run: () => setPhase(2) },
    { at: 5800, run: () => setPhase(3) },
    { at: 7800, run: () => setDone(true) },
  ]);
  return (
    <div ref={root}>
      <DemoPanel>
        <UserSays>Zoom on the Create button and slow the click down a little.</UserSays>
        <AgentSays>
          <span><ThinkingLoader phase={phase} done={done} /></span>
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "thinking-loader",
  name: "ThinkingLoader",
  layer: "Molecules",
  category: "Chat",
  order: 10,
  isNew: true,
  description: "One line that says what the agent is doing while you wait for its first words. The label rolls through phases, the pill glides to each new width, and it settles on a check with how long the work took.",
  demo: () => <Demo />,
  usage: `import { ThinkingLoader } from "@/ui/molecules/thinking-loader";

// Driven by the agent's stream: 0 on send, 1 on the first tool call, …
<ThinkingLoader
  phases={["Reading the project", "Looking at the frame", "Planning the edit", "Applying edits"]}
  phase={stage}
  done={firstToken}
/>

// Inside a message, small and without the pill
<ThinkingLoader variant="plain" size="sm" phases={["Rendering"]} doneLabel="Rendered" done={ready} />`,
  source: src,
  sourcePath: "src/ui/molecules/thinking-loader/index.tsx",
  props: [
    { name: "phases", type: "string[]", description: "What the agent is doing, in order. Two to four words each; they stay on one line." },
    { name: "interval", type: "number = 2200", description: "Ms per phase when `phase` isn't controlled." },
    { name: "phase", type: "number", description: "Controlled index into phases. Stops the timer." },
    { name: "loop", type: "boolean = false", description: "Start over after the last phase instead of holding it." },
    { name: "done", type: "boolean = false", description: "Rays turn into a check and the label into doneLabel. Back to false starts over." },
    { name: "doneLabel", type: "string | (ms) => string", description: "Default: \"Worked for 6.2s\"." },
    { name: "size", type: "\"sm\" | \"md\"", description: "24 or 28px tall." },
    { name: "variant", type: "\"pill\" | \"plain\"", description: "A key on its own, or just the glyph and label inside a message." },
  ],
  composedOf: ["StatusGlyph", "RollText", "Key material"],
  whenToUse: [
    "The wait between sending and the agent's first words: one line saying what it is doing.",
    "Agent steps with real labels: reading the project, looking at a frame, applying edits, rendering.",
    "Map phases to real events with `phase`; the timer is only a fallback.",
  ],
  whenNot: [
    "When people should see every step and what it looked at: use ThinkingState.",
    "Waits under half a second: the loader would only flash.",
    "Render or export progress you can measure: show the percentage instead.",
  ],
  a11y: [
    "role=\"status\" with aria-live=\"polite\": each new phase and the done label are read once.",
    "The glyph and the label rolling out are hidden from assistive tech.",
  ],
  motion: [
    "Eight rays fade one after another, so the spinner turns without rotating.",
    "A band of light sweeps the label while it works.",
    "A new phase rolls the old label up into a 3px blur while the new one rises out of one; the pill glides to the new width over 460ms.",
    "Done: the rays shrink away while the check grows in and draws itself; the sweep stops.",
    "Reduced motion: labels switch instantly, the rays and the sweep stand still.",
  ],
};
