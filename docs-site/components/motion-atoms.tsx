import { useState } from "react";
import type { ReactNode } from "react";
import { Duration, Fold, Key, RollNumber, RollText, Shimmer, StatusGlyph, Swap } from "@/ui/atoms";
import type { GlyphStatus } from "@/ui/atoms";
import src from "@/ui/atoms/motion.tsx?raw";
import { useScript } from "../demo";
import type { DocEntry } from "../registry";

const LABELS = ["Reading the project", "Looking at 0:12", "Adding a zoom"];
const ORDER: GlyphStatus[] = ["queued", "running", "done", "failed", "stopped"];

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "104px 1fr", alignItems: "center", gap: 16, minHeight: 32 }}>
      <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{name}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Demo() {
  const [label, setLabel] = useState(0);
  const [count, setCount] = useState(1240);
  const [glyph, setGlyph] = useState(1);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [since] = useState(() => Date.now() - 2300);
  const root = useScript([
    { at: 900, run: () => { setLabel(1); setCount(1860); setGlyph(2); } },
    { at: 2200, run: () => { setOpen(true); setSaved(true); } },
    { at: 3400, run: () => { setLabel(2); setCount(980); setGlyph(3); } },
    { at: 4800, run: () => { setOpen(false); setSaved(false); setGlyph(4); } },
  ]);
  return (
    <div ref={root} style={{ display: "flex", flexDirection: "column", gap: 10, width: 440, maxWidth: "100%" }}>
      <Row name="RollText">
        <RollText text={LABELS[label]!} shimmer={label < 2} />
        <Key size="sm" variant="tertiary" onClick={() => setLabel((label + 1) % LABELS.length)}>Next</Key>
      </Row>
      <Row name="RollNumber">
        <span style={{ fontSize: 19, fontWeight: 600 }}><RollNumber value={count} format={(n) => n.toLocaleString("en-US")} /></span>
        <Key size="sm" variant="tertiary" onClick={() => setCount(count + 137)}>Up</Key>
        <Key size="sm" variant="tertiary" onClick={() => setCount(Math.max(0, count - 211))}>Down</Key>
      </Row>
      <Row name="StatusGlyph">
        <StatusGlyph status={ORDER[glyph]!} size={16} />
        <span style={{ color: "var(--text-secondary)", fontSize: 12, width: 56 }}>{ORDER[glyph]}</span>
        <Key size="sm" variant="tertiary" onClick={() => setGlyph((glyph + 1) % ORDER.length)}>Next</Key>
      </Row>
      <Row name="Shimmer + Duration">
        <Shimmer style={{ color: "var(--text-secondary)", fontSize: 13 }}>Rendering 0:12</Shimmer>
        <Duration since={since} running />
      </Row>
      <Row name="Swap">
        <Key size="sm" onClick={() => setSaved(!saved)}><Swap id={saved ? "saved" : "save"}>{saved ? "Saved" : "Save version"}</Swap></Key>
      </Row>
      <Row name="Fold">
        <Key size="sm" variant="tertiary" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} details</Key>
      </Row>
      <Fold open={open}>
        <p style={{ margin: "0 0 0 120px", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>Height folds on grid rows from 0fr to 1fr with the glide curve. Closed content is inert, so it can't be tabbed into.</p>
      </Fold>
    </div>
  );
}

export const entry: DocEntry = {
  id: "motion-atoms",
  name: "Motion atoms",
  layer: "Atoms",
  category: "Primitives",
  order: 1,
  isNew: true,
  description: "The small moving parts every agent component is built from: rays, a status glyph whose check draws itself, a light sweep, labels and numbers that roll, height folds and blur swaps. Reuse these instead of writing new keyframes, so the whole app moves with one character.",
  demo: () => <Demo />,
  usage: `import { Fold, RollNumber, RollText, StatusGlyph, Swap } from "@/ui/atoms";

<StatusGlyph status={step.status} />                 // queued → running → done | failed | stopped
<RollText text={phaseLabel} shimmer={running} />     // rolls to each new label, glides to its width
<RollNumber value={tokens} format={(n) => n.toLocaleString()} />
<Fold open={expanded}><Details /></Fold>
<Swap id={status}>{status === "done" ? "Saved" : "Saving"}</Swap>`,
  source: src,
  sourcePath: "src/ui/atoms/motion.tsx",
  props: [
    { name: "StatusGlyph.status", type: "\"queued\" | \"running\" | \"done\" | \"failed\" | \"stopped\"", description: "Hairline ring, rays, a drawn check, a drawn cross, or a stop square. Every layer stays mounted so changes animate." },
    { name: "RollText.text", type: "string", description: "Changing it rolls the old label up and out and the new one in." },
    { name: "RollText.shimmer", type: "boolean", description: "Sweeps a band of light over the label while work runs." },
    { name: "RollText.glide", type: "boolean = true", description: "Glides the box to each new width. Off for fixed slots." },
    { name: "RollNumber.value / format", type: "number / (n) => string", description: "Changed digits roll up when it grows, down when it shrinks." },
    { name: "Fold.open", type: "boolean", description: "Folds height on grid rows; closed content is inert." },
    { name: "Swap.id", type: "string", description: "A new id swaps the content: old blurs out, new rises in." },
    { name: "Duration", type: "{ since?, ms?, running? }", description: "\"2.7s\", \"42s\", \"1m 05s\" in the time face. Ticks while running." },
  ],
  whenToUse: [
    "Any agent state change: use StatusGlyph for a step's life, RollText for a label that changes, Swap for a status chip or key label that changes.",
    "Any number that changes while people watch it: counts, tokens, cost, scores.",
    "Any disclosure: Fold, never conditional rendering that makes the layout jump.",
  ],
  whenNot: [
    "Elements that move to a new place on screen: use motion layout or layoutId on spring.travel.",
    "Timeline playback and camera motion: those run on the renderer's springs, not these.",
  ],
  a11y: [
    "StatusGlyph is decorative unless you pass `label`; say the status in text next to it.",
    "RollNumber exposes the whole value once as its label; the rolling digits are hidden.",
    "RollText hides the outgoing label from assistive tech.",
    "Fold makes closed content inert, so it leaves the tab order and the accessibility tree.",
  ],
  motion: [
    "Rays: eight strokes fading in turn, 800ms per turn. The spinner never rotates.",
    "Check and cross: the rays shrink and blur away while the mark grows in and draws itself over 360ms, 120ms after the hand-off starts.",
    "RollText: in rises 70% out of a 3px blur over 460ms; out leaves 70% up into the blur in 320ms; the box glides to the new width over 460ms.",
    "RollNumber: only changed digits move, 60% of a line out of a 2px blur, over 420ms.",
    "Fold: grid rows 0fr → 1fr on --ease-glide over 380ms; opacity follows 80ms later on the way in and leaves first on the way out.",
    "Swap: popLayout presence; the old content blurs out as the new one rises 3px, 240ms, neighbours glide.",
    "Reduced motion: every change is instant; the rays and the sweep stand still.",
  ],
};
