import { useState } from "react";
import { ModelPicker } from "@/ui/molecules/model-picker";
import type { Effort } from "@/ui/molecules/model-picker";
import src from "@/ui/molecules/model-picker/index.tsx?raw";
import { DemoPanel, useScript } from "../demo";
import type { DocEntry } from "../registry";

/** Sends a key to the open model list, as if pressed. Untrusted events don't stop the script. */
const press = (key: string) => () =>
  document.querySelector('[role="listbox"][aria-label="Model"]')?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

function Demo() {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState("claude-sonnet-5-5");
  const [thinking, setThinking] = useState(false);
  const [effort, setEffort] = useState<Effort>("medium");
  const root = useScript([
    { at: 700, run: () => setOpen(true) },
    { at: 1900, run: press("ArrowUp") },
    { at: 3100, run: press("ArrowDown") },
    { at: 3900, run: press("ArrowDown") },
    { at: 5100, run: () => setThinking(true) },
    { at: 6300, run: () => setEffort("high") },
    { at: 7300, run: press("ArrowUp") },
    { at: 8100, run: press("ArrowUp") },
    { at: 9100, run: press("Enter") },
  ]);
  return (
    <div ref={root}>
      <DemoPanel>
        {/* Room below for the menu, which opens downward here. */}
        <div style={{ minHeight: 380 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>Edit with</span>
            <ModelPicker value={model} onChange={setModel} open={open} onOpenChange={setOpen}
              thinking={thinking} onThinkingChange={setThinking} effort={effort} onEffortChange={setEffort} />
          </div>
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
  description: "Which model the agent edits with, and whether it thinks before it edits. Pointing at a model fills its speed, quality and cost meters and rolls its first-token time and price in the tray, so the cost of a choice shows before you make it.",
  demo: () => <Demo />,
  usage: `import { CLAUDE_MODELS, ModelPicker } from "@/ui/molecules/model-picker";

// In a composer at the bottom of the agent panel: open upward, line up with the right edge
<ModelPicker
  models={CLAUDE_MODELS}
  value={settings.model}
  onChange={(id) => setSettings({ model: id })}
  thinking={settings.thinking}
  onThinkingChange={(thinking) => setSettings({ thinking })}
  effort={settings.effort}
  onEffortChange={(effort) => setSettings({ effort })}
  side="top"
  align="end"
/>`,
  source: src,
  sourcePath: "src/ui/molecules/model-picker/index.tsx",
  props: [
    { name: "models", type: "PickerModel[]", description: "{ id, name, short?, description?, speed?, quality?, cost?, latencyMs?, pricePerM? }. Strengths go from 1 to 5 (cost 5 is the most expensive). Leave all three out for a router like Auto and the row says Varies. Default: CLAUDE_MODELS (Auto, Opus 5.5, Sonnet 5.5, Haiku 5.5)." },
    { name: "value", type: "string", description: "Id of the chosen model (controlled)." },
    { name: "defaultValue", type: "string", description: "Chosen model when uncontrolled. Default: the first." },
    { name: "onChange", type: "(id: string) => void", description: "Called with the picked model's id." },
    { name: "thinking", type: "boolean", description: "Extended thinking switch (controlled)." },
    { name: "defaultThinking", type: "boolean = false", description: "Starting state of the switch." },
    { name: "onThinkingChange", type: "(on: boolean) => void", description: "Called when the switch flips." },
    { name: "effort", type: "\"low\" | \"medium\" | \"high\"", description: "Thinking effort (controlled). The control only shows while thinking is on." },
    { name: "defaultEffort", type: "Effort = \"medium\"", description: "Starting effort." },
    { name: "onEffortChange", type: "(effort: Effort) => void", description: "Called with the new effort." },
    { name: "open", type: "boolean", description: "Menu open state (controlled)." },
    { name: "defaultOpen", type: "boolean = false", description: "Start open when uncontrolled." },
    { name: "onOpenChange", type: "(open: boolean) => void", description: "Called when the menu opens or closes." },
    { name: "side", type: "\"top\" | \"bottom\" = \"bottom\"", description: "Open above or below the trigger. Use top in a composer at the bottom of the panel." },
    { name: "align", type: "\"start\" | \"end\" = \"start\"", description: "Which edge of the trigger the menu lines up with." },
  ],
  composedOf: ["Key (tertiary, sm)", "RollText", "Cell", "RollNumber", "Swap", "Switch", "Switcher", "Fold", "Dock material"],
  whenToUse: [
    "The model switch in the agent composer: the place people trade speed and cost against how well the edit is planned.",
    "A handful of models that differ in speed, quality and price, plus settings that ride along with them: extended thinking and its effort.",
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
    ["Tab", "From the list to Extended thinking and Effort."],
    ["← →", "In Effort: Low, Medium, High."],
    ["Esc", "Closes the menu and returns focus to the trigger."],
  ],
  a11y: [
    "The trigger's name carries the model and, when on, extended thinking and its effort (\"Model: Claude Sonnet 5.5, extended thinking on, high effort\").",
    "The models are a listbox with aria-activedescendant, so focus stays on the list while the arrows move the highlight. Each option reads its description, its strengths as \"speed 4 of 5\", its first-token time and its price.",
    "Extended thinking is a switch; Effort is a radio group whose arrows move both the choice and the focus.",
    "The meters and the tray are hidden from assistive tech; the option text says the same in words.",
  ],
  motion: [
    "The menu grows out of the trigger's corner: fade, scale from .96 and a 2px blur on the reveal curve (220ms); it collapses in 110ms.",
    "The highlight is one fill that glides between rows on the morph spring.",
    "Pointing at a model fills its meters cell by cell, 45ms apart, each column a beat after the last; the other rows step back to half opacity.",
    "First-token time and price roll digit by digit to the highlighted model's values; Varies swaps in with a blur.",
    "Effort unfolds under the switch (grid rows, glide curve); its key slides to the chosen level.",
    "The model name in the trigger rolls to the new one; a bulb unfolds sideways next to it while thinking is on.",
    "Reduced motion: the menu appears and disappears, cells fill at once, numbers and names switch in place.",
  ],
};
