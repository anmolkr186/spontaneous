import { Film } from "lucide-react";
import { Duration, Key, Tag } from "@/ui/atoms";
import { Tray, TraySpacer } from "@/ui/molecules/tray";
import src from "@/ui/molecules/tray/index.tsx?raw";
import type { DocEntry } from "../registry";

function Demo() {
  return (
    <div style={{ width: 380, maxWidth: "100%" }}>
      <Tray
        title={<><Film />Export · Projects walkthrough</>}
        meta={<><span>1080p</span><Duration ms={74200} /></>}
        foot={<><span>Ready to export</span><TraySpacer /><Key size="sm" variant="tertiary">Settings</Key><Key size="sm" variant="primary">Export</Key></>}
      >
        <div style={{ display: "grid", gap: 6, padding: "12px var(--tray-card-inset)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Projects-demo.mp4</span><Tag>H.264</Tag></div>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>3 zooms, 2 cuts and a speed ramp from the agent; 1 callout from you.</span>
        </div>
      </Tray>
    </div>
  );
}

export const entry: DocEntry = {
  id: "tray",
  name: "Tray",
  layer: "Molecules",
  category: "Primitives",
  order: 2,
  isNew: true,
  description: "The shell agent cards live in: one raised card sitting in a shallow tray. The card holds the content; the tray's header and footer rows hold the meta and the actions, so the card stays calm and every agent card reads the same way.",
  demo: () => <Demo />,
  usage: `import { Tray, TraySpacer } from "@/ui/molecules/tray";

<Tray
  title={<><ListChecks />Plan · 5 steps</>}
  meta={<Duration since={startedAt} running />}
  foot={<><span>Running · 2 of 5</span><TraySpacer /><Key size="sm" variant="tertiary">Cancel</Key></>}
>
  <PlanSteps … />
</Tray>`,
  source: src,
  sourcePath: "src/ui/molecules/tray/index.tsx",
  props: [
    { name: "title", type: "ReactNode", description: "Left of the header row: what this is. An icon may lead." },
    { name: "meta", type: "ReactNode", description: "Right of the header row: counts, clocks, cost. Several children get a · between them." },
    { name: "foot", type: "ReactNode", description: "The footer row: status on the left, actions on the right (use TraySpacer)." },
    { name: "bare", type: "boolean", description: "Children go straight into the tray: several TrayCards, or a resolved one-line row." },
    { name: "fluid", type: "boolean", description: "Fill the container instead of the 400px measure." },
  ],
  composedOf: ["Tray material (--tray-bg, --tray-shadow)", "Tray card material (--tray-card-bg, --tray-card-shadow)"],
  whenToUse: [
    "Any agent card with meta or actions: plans, approvals, permissions, monitors, ledgers, context.",
    "A card that resolves into one line: keep the tray, swap the card for a row inside it.",
  ],
  whenNot: [
    "Messages in the thread: those are bubbles and plain text.",
    "Settings groups in the inspector: use Group and Field.",
  ],
  a11y: ["A <section>; give it an aria-label or aria-labelledby when the title isn't enough to name it."],
  motion: [
    "The tray itself doesn't move. Components inside it glide their height with Fold or motion layout, so the tray follows.",
  ],
};
