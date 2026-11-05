import { useState } from "react";
import { Timecode } from "@/ui/atoms";
import { ShotSuggestion } from "@/ui/molecules/shot-suggestion";
import type { ShotOption } from "@/ui/molecules/shot-suggestion";
import { shotById } from "@/editor/shots";
import src from "@/ui/molecules/shot-suggestion/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

const name = (id: string) => shotById(id)?.name ?? id;

const OPTIONS: ShotOption[] = [
  { id: "orbit-in", label: name("orbit-in"), confidence: 3, reason: "The take opens on the Projects page for six seconds with nothing moving. Orbit In swings from three-quarter to straight-on, so the camera settles just as you reach for Create." },
  { id: "lid-rise", label: name("lid-rise"), confidence: 2, reason: "The lid opens and the screen powers on: a strong opener, but it adds about 1.6s before the page is readable." },
  { id: "focus", label: name("focus"), confidence: 2, reason: "Keeps the browser frame and follows your clicks. Calm and readable, but the opening stays flat." },
  { id: "takeover", label: name("takeover"), confidence: 1, reason: "Pushes through the bezel into the page. It needs a busy first frame; yours starts on an empty list." },
];

function Demo() {
  const [value, setValue] = useState("orbit-in");
  const root = useScript([
    { at: 2600, run: () => setValue("lid-rise") },
    { at: 4800, run: () => setValue("orbit-in") },
    { at: 6600, run: () => [...(root.current?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "Accept")?.click() },
  ]);
  return (
    <div ref={root}>
      <DemoPanel>
        <UserSays>The start feels static. Make it feel more like a launch.</UserSays>
        <AgentSays>
          <ShotSuggestion
            options={OPTIONS}
            value={value}
            onPick={(o) => setValue(o.id)}
            context="for the opening"
            meta={<span><Timecode value={0} muted />–<Timecode value={6} muted /></span>}
          />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "shot-suggestion",
  name: "ShotSuggestion",
  layer: "Molecules",
  category: "Agent",
  order: 90,
  isNew: true,
  description: "The agent suggests one shot for part of the video, says why and how sure it is, and leaves a way out: other options in a small menu, and Undo after accepting. Use it when the agent has a favorite; when it doesn't, show the choices side by side.",
  demo: () => <Demo />,
  usage: `import { ShotSuggestion } from "@/ui/molecules/shot-suggestion";
import { shotById } from "@/editor/shots";

<ShotSuggestion
  context="for the opening"
  meta={<span><Timecode value={0} muted />–<Timecode value={6} muted /></span>}
  options={[
    { id: "orbit-in", label: shotById("orbit-in")!.name, confidence: 3, reason: "Swings to straight-on as you reach for Create." },
    { id: "lid-rise", label: shotById("lid-rise")!.name, confidence: 2, reason: "Strong opener, but adds 1.6s before the page reads." },
  ]}
  onAccept={(o) => editor.setTemplate(o.id)}
  onUndo={() => editor.undo()}
/>`,
  source: src,
  sourcePath: "src/ui/molecules/shot-suggestion/index.tsx",
  props: [
    { name: "options", type: "ShotOption[]", description: "{ id, label, reason, confidence: 1 | 2 | 3 }. The first is the suggestion; the rest go under Other options." },
    { name: "context", type: "string", description: "Finishes the sentence \"Use Orbit In …\", e.g. \"for the opening\"." },
    { name: "title", type: "ReactNode = \"Suggested shot\"", description: "Tray title, with the film icon by default." },
    { name: "meta", type: "ReactNode", description: "Right of the tray title: the range the shot covers, in Timecodes." },
    { name: "value", type: "string", description: "Id of the option shown, controlled. Update it from onPick." },
    { name: "defaultValue", type: "string", description: "Id of the option shown first when uncontrolled. Defaults to the suggestion." },
    { name: "defaultOpen", type: "boolean = true", description: "Start with the reason unfolded." },
    { name: "onPick", type: "(option) => void", description: "Another option was picked from the menu." },
    { name: "onAccept", type: "(option) => void", description: "The shown option was accepted." },
    { name: "onUndo", type: "(option) => void", description: "An accept was undone while Undo was showing." },
    { name: "undoFor", type: "number = 5000", description: "Ms Undo stays after accepting. The editor's own undo still works afterwards." },
    { name: "className", type: "string", description: "Extra class on the tray." },
  ],
  composedOf: ["Tray", "Fold", "Swap", "RollText", "Cell", "DrawCheck", "Key", "Tag"],
  whenToUse: [
    "The agent has a clear favorite shot for a stretch of the video and should say why before changing it.",
    "Any single choice the agent would otherwise make silently (a backdrop, an aspect, a camera speed) where people should keep the final say.",
    "Write the reason in the project's terms: what is on screen at that time and what the shot does to it.",
  ],
  whenNot: [
    "Choices without a favorite: show the shots side by side in the shot library.",
    "Edits the agent already made: report them as steps in the thread with Undo there.",
    "Questions the agent can't continue without answering: use the ask card in the thread.",
  ],
  keyboard: [
    ["Space ↵", "On the sentence: fold the reason. On Other options: open the menu. On Accept: accept."],
    ["↑ ↓", "On Other options: open the menu. In the menu: move between options."],
    ["Home End", "First or last option in the menu."],
    ["Esc", "Close the menu and return focus to Other options."],
    ["Tab", "Close the menu and move on."],
  ],
  a11y: [
    "The sentence is a button with aria-expanded and aria-controls pointing at the reason; the folded reason is inert.",
    "Other options opens a menu of menuitemradio items with aria-checked; each one's name includes its confidence in words.",
    "Confidence is written out (\"High confidence\"); the three cells are hidden from assistive tech.",
    "Accepting and undoing are announced in a polite status region.",
  ],
  motion: [
    "The reason folds open and shut on the drawer curve; the chevron turns with it.",
    "Picking another option rolls the shot name in the sentence, gliding the words after it, while the reason blurs out and the new one rises in.",
    "The confidence cells fill or empty one after another, 40ms apart, and the word rolls.",
    "The menu rises 4px out of a 2px blur from its key's corner; a light fill glides between options under the pointer or focus.",
    "Accept: the reason folds away and the footer swaps to a drawn check and \"Using Orbit In\"; Undo blurs out after its time is up.",
    "Reduced motion: nothing moves; folds and rolls are instant and swaps become a plain fade.",
  ],
};
