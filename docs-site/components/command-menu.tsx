import { useRef } from "react";
import { CommandMenu } from "@/ui/organisms/command-menu";
import src from "@/ui/organisms/command-menu/index.tsx?raw";
import { useScript } from "../demo";
import type { Beat } from "../demo";
import type { DocEntry } from "../registry";

/** Types into the menu's field the way a person would, without taking focus from the page. */
function typeInto(el: HTMLInputElement | null, text: string) {
  if (!el) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const press = (el: HTMLInputElement | null, key: string, shiftKey = false) => el?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));

/** Letter by letter, from `at`, one keystroke every `every` ms. */
const typing = (at: number, text: string, field: () => HTMLInputElement | null, every = 70): Beat[] =>
  Array.from({ length: text.length }, (_, i) => ({ at: at + i * every, run: () => typeInto(field(), text.slice(0, i + 1)) }));

function Demo() {
  const wrap = useRef<HTMLDivElement>(null);
  const field = () => wrap.current?.querySelector("input") ?? null;
  const root = useScript([
    { at: 800, run: () => press(field(), "ArrowDown") },
    { at: 1350, run: () => press(field(), "ArrowDown") },
    { at: 2000, run: () => press(field(), "Tab") },
    { at: 2600, run: () => press(field(), "ArrowDown") },
    ...typing(3300, "zoom", field, 110),
    { at: 4300, run: () => press(field(), "Enter") },
    { at: 6400, run: () => press(field(), "Escape") },
    ...typing(7000, "make the intro snappier", field, 45),
    { at: 8500, run: () => press(field(), "Enter") },
  ]);
  return (
    <div ref={root} style={{ width: 460, maxWidth: "100%" }}>
      <div ref={wrap}><CommandMenu onClose={() => typeInto(field(), "")} /></div>
    </div>
  );
}

export const entry: DocEntry = {
  id: "command-menu",
  name: "CommandMenu",
  layer: "Organisms",
  category: "Inputs",
  order: 30,
  isNew: true,
  description: "⌘K for the editor: one field searches every command, grouped into suggestions, edits and places to go. A key-material highlight glides from row to row, and the row you run gives a short press while a check and what happened appear in the footer.",
  demo: () => <Demo />,
  usage: `import { CommandMenu, EDITOR_COMMANDS } from "@/ui/organisms/command-menu";

// In the app's ⌘K dialog
<CommandMenu
  autoFocus
  groups={EDITOR_COMMANDS}
  onRun={(id, query) => {
    if (id === "ask") { agent.ask(query); return "Asked the agent"; }
    if (id === "add-zoom") { const zoom = addZoom(playhead); return \`Added a zoom at \${formatTime(zoom.start)}\`; }
    runCommand(id);
  }}
  onClose={closeDialog}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/command-menu/index.tsx",
  props: [
    { name: "groups", type: "CommandGroup[] = EDITOR_COMMANDS", description: "Each { id, label, commands: { id, label, icon?, hint?, keys?, keywords?, done? }[] }. The group with id \"suggestions\" gets ⌘1–⌘5." },
    { name: "placeholder", type: "string", description: "Text in the empty field. Default \"Type a command or search…\"." },
    { name: "onRun", type: "(id, query?) => string | void", description: "A command ran. The agent fallback sends \"ask\" with the typed words. Return a sentence to show in the footer instead of the command's done." },
    { name: "onClose", type: "() => void", description: "Esc in an empty field. Close the dialog here." },
    { name: "autoFocus", type: "boolean", description: "Focus the field when the menu appears." },
    { name: "className", type: "string", description: "Extra class on the slab." },
  ],
  composedOf: ["Dock material", "Well", "Kbd", "Mark", "DrawCheck", "Swap", "RollText"],
  whenToUse: [
    "The editor's ⌘K: reach any edit, suggestion or panel without the mouse.",
    "Suggestions driven by the project: open notes to apply, silences to trim, the export people usually run.",
    "Anything typed that isn't a command goes to the agent, so the menu doubles as a quick prompt.",
  ],
  whenNot: [
    "The only way to reach something. Keep the toolbar, inspector and panels visible as well.",
    "Fewer than five actions. Keys on the surface are easier to find.",
    "A conversation with the agent. Use the composer in AgentThread; the menu only hands over one line.",
  ],
  keyboard: [
    ["↑ ↓", "Moves the highlight row by row through every section, wrapping around."],
    ["Tab", "Jumps to the first row of the next section. Shift Tab goes back."],
    ["↵", "Runs the highlighted command."],
    ["⌘ 1–5", "Runs a suggestion straight away."],
    ["Esc", "Clears the field, then closes."],
    ["⌘ K", "Focuses the field from anywhere."],
  ],
  a11y: [
    "The field is a combobox that controls the listbox; the highlighted command is its aria-activedescendant, so focus never leaves the field.",
    "Groups are labelled; each command is an option named by its label and hint. Shortcut caps and the footer keys are hidden from assistive tech.",
    "What just ran is announced once in a polite live region.",
  ],
  motion: [
    "The highlight is one key that glides from row to row on a no-bounce spring (snappy, 260ms).",
    "Running a row presses it to .98 for 140ms, then the footer's keys blur out while a check draws itself next to what happened; after 2.6s the keys blur back.",
    "Filtering glides the list to its new height over 380ms; matched letters stay bright while the rest of each label dims.",
    "\"Close\" rolls to \"Clear\" once there is something to clear.",
    "Reduced motion: the highlight jumps, the press and the height glide are skipped, the footer swaps without blur.",
  ],
};
