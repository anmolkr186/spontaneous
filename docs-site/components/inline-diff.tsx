import { useRef } from "react";
import { Captions } from "lucide-react";
import { Timecode } from "@/ui/atoms";
import { InlineDiff } from "@/ui/organisms/inline-diff";
import type { InlineDiffHandle } from "@/ui/organisms/inline-diff";
import src from "@/ui/organisms/inline-diff/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

const BEFORE = "So, um, this is the Projects page. And here you just, uh, click the Create button up in the top right, and it opens the new project dialog.";
const AFTER = "This is the Projects page. Click the Create button in the top right to open the new project dialog.";

function Demo() {
  const diff = useRef<InlineDiffHandle>(null);
  const root = useScript([
    { at: 1400, run: () => diff.current?.highlight(0) },
    { at: 2700, run: () => diff.current?.accept(0) },
    { at: 4100, run: () => diff.current?.accept(1) },
    { at: 5500, run: () => diff.current?.reject(2) },
    { at: 6900, run: () => diff.current?.acceptAll() },
  ]);
  return (
    <div ref={root}>
      <DemoPanel width={420}>
        <UserSays>Tighten the captions for the first shot, drop the filler words.</UserSays>
        <AgentSays>
          <InlineDiff
            ref={diff}
            original={BEFORE}
            suggested={AFTER}
            label={<><Captions />Captions · Make it shorter</>}
            meta={<span><Timecode value={0} muted />–<Timecode value={14} muted /></span>}
          />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "inline-diff",
  name: "InlineDiff",
  layer: "Organisms",
  category: "Agent",
  order: 70,
  isNew: true,
  description: "The agent's edits to prose in the project (captions, the narration script, on-screen text, the title) shown inline as struck and added words, accepted or rejected one by one. Nothing changes in the project until each edit gets an explicit yes.",
  demo: () => <Demo />,
  usage: `import { InlineDiff } from "@/ui/organisms/inline-diff";

// Captions: diffed word by word.
<InlineDiff
  label={<><Captions />Captions · Make it shorter</>}
  original={caption.text}
  suggested={agentText}
  onChange={(text) => preview(caption.id, text)}
  onDone={(text) => editor.setCaption(caption.id, text)}
/>

// A title with the edits already worked out.
<InlineDiff
  label="Title · Fix the tone"
  changes={[
    { type: "change", remove: "Super easy ", insert: "" },
    { type: "equal", text: "project setup in Acme" },
  ]}
/>

// Driving it from elsewhere (a keyboard shortcut, the agent's own pace).
const diff = useRef<InlineDiffHandle>(null);
diff.current?.highlight(0);
diff.current?.acceptAll();`,
  source: src,
  sourcePath: "src/ui/organisms/inline-diff/index.tsx",
  props: [
    { name: "cta", type: "CtaProposal", description: "Labels the agent proposed. Shown when they pass the CTA checks; otherwise the label derived from context." },
    { name: "original", type: "string", description: "The text as it is now." },
    { name: "suggested", type: "string", description: "The text the agent suggests, diffed word by word against original." },
    { name: "changes", type: "DiffSegment[]", description: "Pre-computed { type: \"equal\", text } and { type: \"change\", remove, insert } segments, instead of original and suggested. New input starts a new review." },
    { name: "onChange", type: "(text) => void", description: "Every decision and undo, with the text so far. Pending edits keep the original words." },
    { name: "onDone", type: "(text) => void", description: "The last pending edit was decided, with the final text." },
    { name: "label", type: "ReactNode", description: "Tray title: what is edited and why. \"Captions · Make it shorter\"." },
    { name: "meta", type: "ReactNode", description: "Right of the tray title, e.g. the time range of the captions." },
    { name: "ref", type: "Ref<InlineDiffHandle>", description: "highlight(index | null), accept(index), reject(index), acceptAll(), rejectAll(), undo(), reset()." },
    { name: "className", type: "string", description: "Extra class on the tray." },
  ],
  composedOf: ["Tray", "Swap", "RollNumber", "DrawCheck", "Key", "IconKey", "Kbd", "diffWords"],
  whenToUse: [
    "The agent rewrote prose in the project (captions, narration, an overlay's text, the title) and each edit should be approved.",
    "\"Make it shorter\", \"drop the filler words\", \"fix the tone\": small edits scattered through a paragraph.",
    "Anywhere the project should only change with an explicit yes per edit.",
  ],
  whenNot: [
    "Edits to the timeline (zooms, cuts, speed): those are steps with Undo in the agent thread.",
    "Full rewrites where almost every word changes: show the new version next to the old one.",
    "Typing in a caption field: this reviews a finished suggestion, it isn't an editor.",
  ],
  keyboard: [
    ["Tab ⇧ Tab", "Move between pending edits."],
    ["Y ↵", "Accept the focused edit and move to the next one."],
    ["N ⌫", "Reject the focused edit and move to the next one."],
    ["Space", "Open the popover on the focused edit."],
    ["‹ ›", "Toolbar arrows: point at the previous or next pending edit, wrapping, and open its popover. Y and N then decide it."],
    ["Esc", "Close the popover and clear the highlight."],
  ],
  a11y: [
    "Each pending edit is a button named like \"Suggestion 2 of 4: remove “up”. Press Y to accept, N to reject\".",
    "Removed words are a <del>, new words an <ins>; the side that was dropped is hidden from assistive tech once decided.",
    "Every decision, Accept all, Reject all and Undo is announced in a polite status region with the number left.",
    "After the last decision, focus moves to Undo; after an undo, back to the edit that opened again.",
  ],
  motion: [
    "The popover rises 4px out of a 2px blur above the edit and glides to the next one on a no-bounce spring.",
    "Accepting shrinks the struck words to nothing over 300ms on the drawer curve, blurring out, while the new words' wash fades and they settle into the line.",
    "Rejecting does the opposite: the new words shrink away and the strike and wash fade from the old ones.",
    "The arrows scroll only when the next edit is out of view.",
    "The count rolls; at the end the toolbar blurs into \"All changes reviewed\" and its check draws itself.",
    "Reduced motion: nothing moves; edits resolve at once, the popover jumps between edits and the toolbar swaps with a plain fade.",
  ],
};
