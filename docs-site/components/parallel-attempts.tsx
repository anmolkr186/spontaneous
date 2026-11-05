import { useEffect, useState } from "react";
import { ParallelAttempts } from "@/ui/organisms/parallel-attempts";
import type { Attempt } from "@/ui/organisms/parallel-attempts";
import src from "@/ui/organisms/parallel-attempts/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

interface Plan { id: string; name: string; model: string; offset: number; ms: number; phases: string[]; score?: number; note: string; failAt?: number }

/** Three ways to pace the intro, each starting a beat after the last. */
const RACE: Plan[] = [
  { id: "cut", name: "Tight cut", model: "Claude Opus", offset: 0, ms: 6800, phases: ["Finding the pauses", "Trimming five pauses", "Checking the click still lands"], score: 86, note: "Cuts 6.4s · keeps the click" },
  { id: "ramp", name: "Speed ramp 2×", model: "Claude Sonnet", offset: 280, ms: 5200, phases: ["Finding the slow stretch", "Ramping the typing", "Smoothing the ramp"], score: 71, note: "Saves 3.5s · the typing reads rushed" },
  { id: "zoom", name: "Zoom + callout", model: "Claude Haiku", offset: 560, ms: 5600, phases: ["Placing the zoom on Create", "Writing the callout"], note: "The callout covers the Create button", failAt: 0.62 },
];

/** Where each attempt is at `t` ms into the race. */
function at(t: number, start: number): Attempt[] {
  return RACE.filter((p) => t >= p.offset).map((p) => {
    const ran = t - p.offset;
    const progress = Math.min(ran / p.ms, 1);
    const base = { id: p.id, name: p.name, model: p.model, startedAt: start + p.offset };
    if (p.failAt !== undefined && progress >= p.failAt) return { ...base, status: "failed", progress: p.failAt, note: p.note, took: p.ms * p.failAt };
    if (progress >= 1) return { ...base, status: "done", score: p.score, note: p.note, took: p.ms };
    return { ...base, status: "running", progress, step: p.phases[Math.min(Math.floor(progress * p.phases.length), p.phases.length - 1)] };
  });
}

function Demo() {
  const [start] = useState(() => Date.now());
  const [t, setT] = useState(0);
  const [picked, setPicked] = useState<string>();
  const finished = t > Math.max(...RACE.map((p) => p.offset + p.ms));

  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => setT(Date.now() - start), 120);
    return () => clearInterval(id);
  }, [finished, start]);

  const root = useScript([
    { at: 9200, run: () => setPicked("ramp") },
    { at: 11400, run: () => setPicked("cut") },
  ]);

  return (
    <div ref={root}>
      <DemoPanel width={430}>
        <UserSays>The intro feels slow. Try a few ways to pace it and keep the best.</UserSays>
        <AgentSays>
          <ParallelAttempts task="Pace the intro" attempts={at(t, start)} picked={picked} onPick={(a) => setPicked(a.id)} />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "parallel-attempts",
  name: "ParallelAttempts",
  layer: "Organisms",
  category: "Agent",
  order: 40,
  isNew: true,
  description: "The agent tries the same edit several ways at once and the best one wins. Each attempt races as a row with its approach, model and a live bar, then gets an outcome and a score; the best is marked and picked, and you can switch to another.",
  demo: () => <Demo />,
  usage: `import { ParallelAttempts } from "@/ui/organisms/parallel-attempts";

<ParallelAttempts
  task="Pace the intro"
  attempts={[
    { id: "cut", name: "Tight cut", model: "Claude Opus", status: "done", score: 86, note: "Cuts 6.4s · keeps the click", took: 6800 },
    { id: "ramp", name: "Speed ramp 2×", model: "Claude Sonnet", status: "running", progress: 0.6, step: "Ramping the typing", startedAt },
    { id: "zoom", name: "Zoom + callout", model: "Claude Haiku", status: "failed", progress: 0.62, note: "The callout covers the Create button" },
  ]}
  onPick={(attempt) => project.useVersion(attempt.id)}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/parallel-attempts/index.tsx",
  props: [
    { name: "attempts", type: "Attempt[]", description: "One per attempt, in the order the rows show: { id, name, model?, status, progress?, step?, score?, note?, took?, startedAt? }." },
    { name: "attempt.status", type: "\"queued\" | \"running\" | \"done\" | \"failed\"", description: "Picks the bar: growing with a sheen, full, or red where it stopped." },
    { name: "attempt.progress", type: "number", description: "0 to 1: the bar's length while it runs, and where a failed one stopped." },
    { name: "attempt.step", type: "string", description: "While running: what it's doing right now, on the line under the name." },
    { name: "attempt.score", type: "number", description: "0–100 once done. Once every attempt is in, the highest is marked Best and picked unless someone picks another." },
    { name: "attempt.note", type: "string", description: "Once done, the outcome in one line (\"Cuts 6.4s · keeps the click\"); once failed, the error." },
    { name: "attempt.took / attempt.startedAt", type: "number", description: "How long it took, or when it started so its clock ticks while it runs." },
    { name: "task", type: "string", description: "What all of them are trying to do, next to the title." },
    { name: "title", type: "string", description: "Heading of the tray. Default \"Best of 3\", with the number of attempts." },
    { name: "picked", type: "string | null", description: "Controlled pick. Leave it out and the best finished attempt is picked once all are in." },
    { name: "onPick", type: "(attempt) => void", description: "Another attempt was chosen with Use this one (or a click on its row)." },
  ],
  composedOf: ["Tray", "Tag", "RollText", "RollNumber", "Swap", "Duration", "Key"],
  whenToUse: [
    "The agent tries one edit several ways (a cut, a speed ramp, a zoom with a callout) and the person should see them race and keep the say in which one is used.",
    "Best-of-N runs across models or approaches where each result can be scored.",
    "Edits that are cheap to try in parallel and easy to compare by their outcome line.",
  ],
  whenNot: [
    "One run and how it's going: use AgentMonitor.",
    "A plan of different edits in a row: use AgentPlan.",
    "Two versions of a single text or setting to compare word by word: use InlineDiff.",
  ],
  keyboard: [
    ["Tab", "Moves to each finished attempt's Use this one."],
    ["↵ Space", "Uses the focused attempt."],
  ],
  a11y: [
    "The rows are a radiogroup named by the title; each finished attempt's Use this one is a radio named with the approach and its score, and the one in use is checked.",
    "Bars are decoration: what they show is in the text beside them. Running lines and outcomes are plain text.",
    "Each attempt finishing or failing, the best, and every pick are read out in a polite live region.",
  ],
  motion: [
    "Rows rise in out of a 2px blur, a beat (60ms) after each other.",
    "Running bars slide in from the left on a transform, with a soft leading edge and a sheen passing over them.",
    "Finishing rolls the line under the name into the outcome in place, and the score rolls up from zero; rows never change height.",
    "Once all are in, the Best tag blurs in and a soft wash of light settles on the pick; Use this one glides that wash to the new row on spring.morph (no bounce) while the others step back to 55%.",
    "Reduced motion: rows and scores appear at once, the wash jumps, the sheen stands still.",
  ],
};
