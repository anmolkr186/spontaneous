import { useState } from "react";
import { HARNESSES, ModelPicker } from "@/ui/molecules/model-picker";
import type { Effort } from "@/ui/molecules/model-picker";
import src from "@/ui/molecules/model-picker/index.tsx?raw";
import { DemoPanel, useScript } from "../demo";
import type { DocEntry } from "../registry";

/** Sends a key to the open model list, as if pressed. Untrusted events don't stop the script. */
const press = (key: string) => () =>
  document.querySelector('[role="listbox"][aria-label="Model"]')?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

function Demo() {
  const [open, setOpen] = useState(false);
  const [harness, setHarness] = useState("claude-code");
  const [model, setModel] = useState("claude-sonnet-5-5");
  const [effort, setEffort] = useState<Effort>("medium");
  const root = useScript([
    { at: 700, run: () => setOpen(true) },
    { at: 1900, run: press("ArrowUp") },
    { at: 3100, run: press("ArrowDown") },
    { at: 3900, run: press("ArrowDown") },
    { at: 5100, run: () => setEffort("high") },
    { at: 6100, run: () => setEffort("low") },
    { at: 7300, run: press("ArrowUp") },
    { at: 8100, run: press("ArrowUp") },
    { at: 9100, run: press("Enter") },
  ]);
  return (
    <div ref={root}>
      <DemoPanel>
        {/* Room below for the menu, which opens downward here. */}
        <div style={{ minHeight: 360 }}>
          <ModelPicker harnesses={HARNESSES} harness={harness} onHarnessChange={setHarness}
            value={model} onChange={setModel} open={open} onOpenChange={setOpen} effort={effort} onEffortChange={setEffort} />
        </div>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "model-picker",
  name: "ModelPicker",
  layer: "Molecules",
  category: "Chat",
  order: 60,
  isNew: true,
  description: "Which harness runs the agent, which model it edits with, and how hard it thinks. A segmented key: the harness's mark on the left, the model and its effort on the right. Pointing at a model fills its speed, quality and cost meters and rolls its first-token time and price in the tray, so the cost of a choice shows before you make it.",
  demo: () => <Demo />,
  usage: `import { CLAUDE_MODELS, HARNESSES, ModelPicker } from "@/ui/molecules/model-picker";

// In a composer at the bottom of the agent panel: open upward, line up with the right edge
<ModelPicker
  harnesses={HARNESSES}
  harness={settings.harness}
  onHarnessChange={(harness) => setSettings({ harness })}
  models={CLAUDE_MODELS}
  value={settings.model}
  onChange={(id) => setSettings({ model: id })}
  effort={settings.effort}
  onEffortChange={(effort) => setSettings({ effort })}
  side="top"
  align="end"
/>`,
  source: src,
  sourcePath: "src/ui/molecules/model-picker/index.tsx",
  props: [
    { name: "harnesses", type: "Harness[]", description: "{ id, name, icon, note? }. Adds the left segment and its menu. Leave out for the model key alone. HARNESSES has Claude Code and Codex." },
    { name: "harness / defaultHarness / onHarnessChange", type: "string / string / (id) => void", description: "The chosen harness, controlled or not. Default: the first." },
    { name: "models", type: "PickerModel[]", description: "{ id, name, short?, description?, speed?, quality?, cost?, latencyMs?, pricePerM? }. Strengths go from 1 to 5 (cost 5 is the most expensive). Leave all three out and the row says Varies. Default: CLAUDE_MODELS (Opus 5.5, Sonnet 5.5, Haiku 5.5)." },
    { name: "value", type: "string", description: "Id of the chosen model (controlled)." },
    { name: "defaultValue", type: "string", description: "Chosen model when uncontrolled. Default: the first." },
    { name: "onChange", type: "(id: string) => void", description: "Called with the picked model's id." },
    { name: "efforts", type: "EffortOption[]", description: "{ value, label }, lowest first, as the CLI names them. Default: Low, Medium, High. Empty hides the effort." },
    { name: "effort", type: "Effort", description: "Thinking effort (controlled). Always one of efforts: there is no default level." },
    { name: "defaultEffort", type: "Effort = \"medium\"", description: "Starting effort." },
    { name: "onEffortChange", type: "(effort: Effort) => void", description: "Called with the new effort." },
    { name: "open", type: "boolean", description: "Menu open state (controlled)." },
    { name: "defaultOpen", type: "boolean = false", description: "Start open when uncontrolled." },
    { name: "onOpenChange", type: "(open: boolean) => void", description: "Called when the menu opens or closes." },
    { name: "side", type: "\"top\" | \"bottom\" = \"bottom\"", description: "Open above or below the trigger. Use top in a composer at the bottom of the panel." },
    { name: "align", type: "\"start\" | \"end\" = \"start\"", description: "Which edge of the trigger the menu lines up with." },
  ],
  composedOf: ["Key (tertiary, sm)", "RollText", "Cell", "RollNumber", "Swap", "Slider (stepped)", "Well material (segmented key)", "Dock material"],
  whenToUse: [
    "The model switch in the agent composer: the place people trade speed and cost against how well the edit is planned.",
    "A handful of models that differ in speed, quality and price, plus the effort they think with.",
    "Switching which agent runs the edit, Claude Code or Codex: pass harnesses for the left segment.",
    "When people should see what a choice costs before they send: the tray shows first-token time and price per million output tokens.",
  ],
  whenNot: [
    "Picking between two modes that have nothing to do with models: use Switcher.",
    "Long lists people need to search: a command menu fits better.",
    "Project-wide agent settings that rarely change: put them in the inspector with Group and Field.",
  ],
  keyboard: [
    ["↵ Space ↓", "On the trigger: opens the menu with the highlight on the chosen model."],
    ["↑ ↓ Home End", "In the list: moves the highlight. The meters fill and the tray follows."],
    ["↵ Space", "In the list: picks the highlighted model and closes the menu."],
    ["Tab", "From the list to Effort."],
    ["← → Home End", "On the Effort slider: one level down or up, or to the ends."],
    ["↵ Space ↓", "On the harness segment: opens its menu; ↑ ↓ and ↵ pick one."],
    ["Esc", "Closes the menu and returns focus to the trigger."],
  ],
  a11y: [
    "The segmented key is a group named Agent. The harness segment reads \"Harness: Claude Code\" and opens a radio menu.",
    "The model trigger's name carries the model and its effort (\"Model: Claude Sonnet 5.5, high effort\").",
    "The models are a listbox with aria-activedescendant, so focus stays on the list while the arrows move the highlight. Each option reads its description, its strengths as \"speed 4 of 5\", its first-token time and its price.",
    "Effort is a slider whose value reads as the level's name (\"High\"), with one step per level.",
    "The meters and the tray are hidden from assistive tech; the option text says the same in words.",
  ],
  motion: [
    "The menu grows out of the trigger's corner: fade, scale from .96 and a 2px blur on the reveal curve (220ms); it collapses in 110ms.",
    "The highlight is one fill that glides between rows on the morph spring.",
    "Pointing at a model fills its meters cell by cell, 45ms apart, each column a beat after the last; the other rows step back to half opacity.",
    "First-token time and price roll digit by digit to the highlighted model's values; Varies swaps in with a blur.",
    "Effort is the app's step slider: the thumb snaps between ticks on a spring, overshoots softly at the ends, and the level name rolls.",
    "The model name and effort in the trigger roll to the new ones.",
    "Reduced motion: the menu appears and disappears, cells fill at once, numbers and names switch in place.",
  ],
};
