import { useState } from "react";
import { ToolCall, ToolCallGroup } from "@/ui/molecules/tool-call";
import type { ToolCallStatus } from "@/ui/molecules/tool-call";
import src from "@/ui/molecules/tool-call/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

interface Call {
  id: string;
  name: string;
  status: ToolCallStatus;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  startedAt?: number;
  duration?: number;
}

const CLICKS = { from: 9.4, to: 17.4 };
const ZOOM = { start: 11.2, end: 16.6, scale: 1.8, target: { x: 0.88, y: 0.12 } };
const CUT = { start: 58.4, end: 62.9 };
const OVERLAP = "The cut at 0:58.4–1:02.9 starts inside the speed change at 0:56–0:59. Shorten one of them first.";

function Demo() {
  const [calls, setCalls] = useState<Call[]>([]);
  const add = (c: Call) => setCalls((all) => [...all, c]);
  const update = (id: string, patch: Partial<Call>) => setCalls((all) => all.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const finish = (id: string, patch: Partial<Call>) =>
    setCalls((all) => all.map((c) => (c.id === id ? { ...c, ...patch, duration: Date.now() - (c.startedAt ?? Date.now()) } : c)));

  const retry = () => {
    update("cut", { status: "running", error: undefined, startedAt: Date.now(), duration: undefined });
    window.setTimeout(() => finish("cut", { status: "done", args: { start: 59, end: 62.9 }, result: { removed: 3.9, ok: true } }), 1300);
  };

  const root = useScript([
    { at: 400, run: () => add({ id: "clicks", name: "get_input_events", status: "running", args: CLICKS, startedAt: Date.now() }) },
    { at: 1500, run: () => finish("clicks", { status: "done", result: { clicks: [13.1], focus: "Create project" } }) },
    { at: 1800, run: () => add({ id: "zoom", name: "add_zoom", status: "running", args: ZOOM, startedAt: Date.now() }) },
    { at: 3100, run: () => finish("zoom", { status: "done", result: { id: "z9", ok: true } }) },
    { at: 3400, run: () => add({ id: "cut", name: "cut", status: "running", args: CUT, startedAt: Date.now() }) },
    { at: 4500, run: () => finish("cut", { status: "failed", error: OVERLAP }) },
    { at: 6800, run: retry },
  ]);

  return (
    <div ref={root}>
      <DemoPanel>
        <UserSays>Zoom on the Create button and cut the dead air before the share dialog.</UserSays>
        <AgentSays>
          {calls.length > 0 && (
            <ToolCallGroup defaultOpen>
              {calls.map((c) => (
                <ToolCall key={c.id} name={c.name} status={c.status} args={c.args} result={c.result} error={c.error}
                  startedAt={c.startedAt} duration={c.duration} onRetry={c.id === "cut" ? retry : undefined} />
              ))}
            </ToolCallGroup>
          )}
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "tool-call",
  name: "ToolCall",
  layer: "Molecules",
  category: "Chat",
  order: 30,
  isNew: true,
  description: "One line per call the agent makes to the editor: what it did in plain words, a short summary, how long it took and whether it landed. It folds open to the arguments and the result as labelled rows, and ToolCallGroup gathers a turn's calls under one line.",
  demo: () => <Demo />,
  usage: `import { ToolCall, ToolCallGroup } from "@/ui/molecules/tool-call";

// One call, straight from the agent's stream
<ToolCall
  name="add_zoom"
  status={call.result ? "done" : "running"}
  args={{ start: 11.2, end: 16.6, scale: 1.8, target: { x: 0.88, y: 0.12 } }}
  result={call.result}
  startedAt={call.startedAt}
/>

// A turn with several calls: one quiet line, folded
<ToolCallGroup>
  <ToolCall name="get_input_events" status="done" args={{ from: 9.4, to: 17.4 }} result={{ clicks: [13.1] }} duration={1100} />
  <ToolCall name="add_zoom" status="done" args={zoom} result={{ id: "z9" }} duration={1300} />
  <ToolCall name="cut" status="failed" args={{ start: 58.4, end: 62.9 }} error={message} onRetry={retryCut} />
</ToolCallGroup>`,
  source: src,
  sourcePath: "src/ui/molecules/tool-call/index.tsx",
  props: [
    { name: "name", type: "string", description: "The tool as the agent calls it (\"add_zoom\"). Picks the words and the icon from TOOLS; never shown as is. Unknown names are shown in plain words with a wrench." },
    { name: "status", type: "\"running\" | \"done\" | \"failed\"", description: "Running ticks the clock and shimmers the title; done draws a check and settles the duration; failed draws a cross, says Failed and opens the card." },
    { name: "title", type: "string", description: "Replaces the title from the tool map." },
    { name: "summary", type: "ReactNode", description: "Replaces the summary worked out from args (\"0:11.2–0:16.6 · 1.8×\"). Truncates with an ellipsis." },
    { name: "icon", type: "ReactNode", description: "Replaces the tool's icon in the tile. A lucide icon; it is drawn at 13px." },
    { name: "args", type: "Record<string, unknown>", description: "What the agent asked for, shown as labelled rows. A start and end become one Range row. Hidden when undefined." },
    { name: "result", type: "unknown", description: "What came back. Objects become rows, strings a paragraph. While running without one, the card says it is waiting." },
    { name: "error", type: "string", description: "Why it failed, shown in the body when status is \"failed\"." },
    { name: "startedAt", type: "number", description: "When the call started (ms since epoch). The clock counts from here." },
    { name: "duration", type: "number", description: "Final duration in ms. Otherwise the time measured while it ran." },
    { name: "defaultOpen / open / onOpenChange", type: "boolean / boolean / (open) => void", description: "Folded state, uncontrolled or controlled." },
    { name: "openOnError", type: "boolean = true", description: "Opens on failure and closes again on the next run, unless someone toggled it by hand. Uncontrolled only." },
    { name: "onRetry", type: "() => void", description: "Shows a Retry key next to the error." },
    { name: "maxRows", type: "number = 5", description: "Rows per section before \"Show all\"." },
    { name: "ToolCallGroup · children", type: "ToolCall elements", description: "The calls. The group reads their name, icon, status, startedAt and duration, so pass them as direct children." },
    { name: "ToolCallGroup · label", type: "string", description: "Header once nothing runs. Default: \"Used 3 tools\"." },
    { name: "ToolCallGroup · runningLabel", type: "string = \"Using tools…\"", description: "Shimmering header while any call runs." },
    { name: "ToolCallGroup · duration", type: "number", description: "Total in ms. Otherwise the sum of the calls' durations, or the time measured while any of them ran." },
    { name: "ToolCallGroup · defaultOpen / open / onOpenChange", type: "boolean / boolean / (open) => void", description: "Folded state of the list. Closed by default." },
  ],
  composedOf: ["StatusGlyph", "RollText", "Duration", "Swap", "Fold", "IconKey", "Key", "Tray and tray card materials"],
  whenToUse: [
    "Each editor call in an agent turn: reading clicks, adding a zoom, cutting a section, changing speed or the shot.",
    "A turn with two or more calls: wrap them in ToolCallGroup so the agent's answer isn't buried under cards.",
    "When someone needs to check exactly what the agent asked for (a range, a scale, a focus point) or copy it into a bug report.",
  ],
  whenNot: [
    "Steps inside the thread runtime's message parts: AgentThread already draws those on its steps rail.",
    "The wait before the first call: use ThinkingLoader, or ThinkingState when the steps and the moments it looked at matter.",
    "A batch of notes being applied: use the NotesPlan checklist in AgentThread, which ticks off per note.",
  ],
  keyboard: [
    ["Tab", "Moves through the headers, Copy keys, Show all and Retry. Folded content is skipped."],
    ["↵ Space", "On a header: opens or folds the call, or the group."],
  ],
  a11y: [
    "Headers are buttons with aria-expanded and aria-controls pointing at the body. Folded bodies are inert.",
    "Each call has a polite live region: \"Adding a zoom\", \"Added a zoom\", \"Cut a section failed: …\". The group says \"Using tools…\" and \"Used 3 tools, 1 failed\".",
    "Copy keys are named \"Copy arguments\" and \"Copy result\" and switch to \"Copied\". Icons are hidden.",
    "Failure is said in words and with a cross, not only in red.",
  ],
  motion: [
    "The title rolls between \"Adding a zoom\" and \"Added a zoom\" and shimmers while the call runs; the clock ticks in tenths.",
    "Status swaps with a blur: rays shrink away as the check grows in and draws itself (or the cross, with Failed).",
    "The body folds open on grid rows (380ms, glide curve) while the chevron turns; rows rise out of a 2px blur 60ms apart.",
    "Copy blurs into a drawn check for 1.4s. Show all folds the remaining rows open and its label rolls to Show less.",
    "In the group, each new tool icon pops into the stack on the pop spring and older ones slide out; new cards blur in under the last one.",
    "Reduced motion: labels and statuses switch instantly, rows appear without rising, the shimmer and rays stand still.",
  ],
  details: {
    limit: "Three statuses. No variants: a call always reads as one line that folds open.",
    variants: [
      { name: "ToolCall", when: "One call on its own, or as a child of a group." },
      { name: "ToolCallGroup", when: "Two or more calls in one agent turn." },
    ],
    states: [
      { name: "Running", note: "Shimmering title, ticking clock, rays.", render: () => <div style={{ width: 360 }}><ToolCall name="set_speed" status="running" args={{ start: 31.5, end: 36, speed: 1.5 }} startedAt={Date.now() - 1800} /></div> },
      { name: "Done", note: "Past tense, settled duration, check.", render: () => <div style={{ width: 360 }}><ToolCall name="add_overlay" status="done" args={{ start: 37, end: 42, label: "One click to start" }} result={{ id: "o4" }} duration={900} /></div> },
      { name: "Failed", note: "Opens itself to the error and Retry.", render: () => <div style={{ width: 360 }}><ToolCall name="cut" status="failed" args={{ start: 58.4, end: 62.9 }} error={OVERLAP} onRetry={() => {}} /></div> },
    ],
  },
};
