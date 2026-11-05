import { useState } from "react";
import type { ReactNode } from "react";
import { Mic, Monitor, Redo2, Scissors, Undo2 } from "lucide-react";
import { Cell, IconKey, Kbd, Key, Label, Mark, Meter, Tag, Timecode } from "@/ui/atoms";
import { Field, Group, Hint, MenuSelect, NoteCard, SourceKey, SwatchPicker, Switcher, ToggleKey } from "@/ui/molecules";
import { ScreenArt, ShotCard } from "@/ui/organisms/shot";
import { SHOTS } from "@/editor/shots";
import shotSrc from "@/ui/organisms/shot/index.tsx?raw";
import { AnnotationDock, RecorderDock } from "@/ui/organisms/dock";
import type { AnnotationTool, RecordSource, RecorderPhase } from "@/ui/organisms/dock";
import { AnnotationLayer, Camera, CanvasViewport, Cursor, DeviceFrame } from "@/ui/organisms/stage";
import { ClipItem, NoteMarker, Timeline, Track, TrackItem, Transport, Waveform } from "@/ui/organisms/timeline";
import { AgentThread, AskCardView, CliUpdateNotice, SuggestionChips } from "@/ui/organisms/agent";
import type { CliUpdateNoticeProps } from "@/ui/organisms/agent";
import { AgentRuntimeProvider, useAgentStoreRuntime } from "@/ui/organisms/agent/runtime";
import type { AgentMessage } from "@/ui/organisms/agent/runtime";
import { Switch } from "@/ui/base/switch/switch";
import { Slider } from "@/ui/base/slider/slider";
import { BACKGROUNDS, DEFAULT_BACKDROP, mockProject } from "@/editor/model";
import type { Note } from "@/editor/model";

import atomsSrc from "@/ui/atoms/index.tsx?raw";
import tooltipSrc from "@/ui/base/tooltip/tooltip.tsx?raw";
import { Tooltip } from "@/ui/base/tooltip/tooltip";
import moleculesSrc from "@/ui/molecules/index.tsx?raw";
import dockSrc from "@/ui/organisms/dock/index.tsx?raw";
import stageSrc from "@/ui/organisms/stage/index.tsx?raw";
import timelineSrc from "@/ui/organisms/timeline/index.tsx?raw";
import agentSrc from "@/ui/organisms/agent/index.tsx?raw";

export type Layer = "Atoms" | "Molecules" | "Organisms";
export interface PropDoc { name: string; type: string; description: string }

export interface DocEntry {
  id: string;
  name: string;
  layer: Layer;
  description: string;
  demo: () => ReactNode;
  flush?: boolean;
  usage: string;
  source: string;
  sourcePath: string;
  props: PropDoc[];
  composedOf?: string[];
  whenToUse: string[];
  whenNot?: string[];
}

/* ───────────────────────── Demo helpers ───────────────────────── */

function DemoRuntime({ messages, children }: { messages: AgentMessage[]; children: ReactNode }) {
  const runtime = useAgentStoreRuntime({ messages, convertMessage: (m: AgentMessage) => m, onNew: async () => {} });
  return <AgentRuntimeProvider runtime={runtime}>{children}</AgentRuntimeProvider>;
}

const demoThread: AgentMessage[] = [
  { id: "d1", role: "user", content: [{ type: "text", text: "Zoom on the Create button and slow this part down a bit." }] },
  {
    id: "d2",
    role: "assistant",
    status: { type: "complete", reason: "stop" },
    content: [
      { type: "reasoning", text: "The note points at the top right of the frame where the click lands at 0:13." },
      { type: "tool-call", toolCallId: "a", toolName: "get_input_events", args: { from: 9, to: 17 }, result: { clicks: [13] } },
      { type: "tool-call", toolCallId: "b", toolName: "add_zoom", args: { start: 11.2, end: 16.6, scale: 1.8 }, result: { id: "z9" } },
      { type: "text", text: "Done: zoomed to 1.8× from 0:11 to 0:16." },
    ],
  },
];

function MenuSelectDemo() {
  const [effort, setEffort] = useState("high");
  const options = [{ value: "low", label: "Low" }, { value: "high", label: "High" }, { value: "max", label: "Max" }];
  return <MenuSelect label="Effort" display={options.find((o) => o.value === effort)!.label} value={effort} options={options} onChange={setEffort} />;
}

/** Click through a real run: Update takes a moment, then lands. Every third try fails, to show Retry. */
function UpdateCardDemo() {
  const [state, setState] = useState<CliUpdateNoticeProps["state"]>({ status: "idle" });
  const [tries, setTries] = useState(0);
  const [shown, setShown] = useState(true);
  const update = () => {
    setState({ status: "updating" });
    const attempt = tries + 1;
    setTries(attempt);
    setTimeout(() => setState(attempt % 3 === 0 ? { status: "failed", error: "npm ERR! permission denied" } : { status: "updated", version: "2.1.318" }), 1400);
  };
  if (!shown) return <Key size="sm" onClick={() => { setShown(true); setState({ status: "idle" }); }}>Show again</Key>;
  return <CliUpdateNotice floating={false} installed="2.1.316" latest="2.1.318" state={state} onUpdate={update} onDismiss={() => setShown(false)} />;
}

function SwitcherDemo() {
  const [mode, setMode] = useState<"lite" | "studio">("lite");
  const [tab, setTab] = useState<"agent" | "notes">("notes");
  return (
    <div style={{ display: "grid", gap: 20, justifyItems: "center" }}>
      <Switcher label="Mode" value={mode} onChange={setMode} options={[{ value: "lite", label: "Lite" }, { value: "studio", label: "Studio" }]} />
      <Switcher label="Panel" value={tab} onChange={setTab} options={[{ value: "agent", label: "Agent" }, { value: "notes", label: "Notes", count: 2 }]} />
    </div>
  );
}

function ToggleDemo() {
  const [mic, setMic] = useState(false);
  const [src, setSrc] = useState("display");
  return (
    <div style={{ display: "grid", gap: 20, justifyItems: "center" }}>
      <div role="radiogroup" aria-label="Source" style={{ display: "flex", gap: 2 }}>
        <SourceKey icon={<Monitor />} label="Display" selected={src === "display"} onSelect={() => setSrc("display")} />
        <SourceKey icon={<Monitor />} label="Window" selected={src === "window"} onSelect={() => setSrc("window")} />
      </div>
      <ToggleKey on={mic} onChange={setMic} iconOn={<Mic />} iconOff={<Mic />} labelOn="Microphone" labelOff="No microphone" />
    </div>
  );
}

function AnnotationDockDemo() {
  const [tool, setTool] = useState<AnnotationTool>("pen");
  return <div style={{ position: "relative", width: "100%", height: 90 }}><AnnotationDock tool={tool} onToolChange={setTool} timeLabel="0:12" onSubmit={() => {}} /></div>;
}

function RecorderDemo() {
  const [phase, setPhase] = useState<RecorderPhase>("setup");
  const [source, setSource] = useState<RecordSource>("display");
  const [mic, setMic] = useState(false);
  const [sys, setSys] = useState(true);
  return (
    <RecorderDock phase={phase} source={source} onSource={setSource} microphone={mic} onMicrophone={setMic} systemAudio={sys} onSystemAudio={setSys}
      elapsed={14} onRecord={() => setPhase("recording")} onStop={() => setPhase("setup")} onDiscard={() => setPhase("setup")} onClose={() => {}} />
  );
}

function StageDemo() {
  const [zoomed, setZoomed] = useState(false);
  const [draft, setDraft] = useState<{ ink?: string; region?: Note["region"] } | null>(null);
  return (
    <div style={{ position: "relative", width: "100%", height: 420 }}>
      <CanvasViewport aspect="16:9" inset={[24, 24, 64, 24]} background={BACKGROUNDS.graphite!.css}
        overlay={<div style={{ position: "absolute", bottom: 16, left: "50%", translate: "-50% 0" }}><Key variant="primary" onClick={() => setZoomed(!zoomed)}>{zoomed ? "Zoom out" : "Zoom to timeline"}</Key></div>}>
        <Camera scale={zoomed ? 1.9 : 1} target={{ x: 0.36, y: 0.84 }}>
          <DeviceFrame kind="browser">
            <ScreenArt tone="cobalt" />
            <Cursor x={0.36} y={0.84} size={1.3} />
            <AnnotationLayer notes={[]} tool="pen" draft={draft} onDraft={setDraft} />
          </DeviceFrame>
        </Camera>
      </CanvasViewport>
    </div>
  );
}

function TimelineDemo() {
  const [time, setTime] = useState(12);
  const [sel, setSel] = useState<string | null>("z3");
  const pps = 7;
  return (
    <div style={{ width: "100%", height: 200, overflow: "hidden", borderRadius: 12, boxShadow: "var(--card-shadow)" }}>
      <Transport time={time} duration={92} playing={false} onPlayPause={() => {}} />
      <Timeline duration={92} pps={pps} time={time} onSeek={setTime}>
        <Track label="Screen">{mockProject.clips.map((c) => <ClipItem key={c.id} start={c.start} end={c.end} pps={pps} label={c.label} />)}</Track>
        <Track label="Zoom">{mockProject.zooms.map((z) => <TrackItem key={z.id} kind="zoom" start={z.start} end={z.end} pps={pps} label={`${z.scale}×`} author={z.author} selected={sel === z.id} onSelect={() => setSel(z.id)} />)}</Track>
        <Track label="Notes">{mockProject.notes.map((n, i) => <NoteMarker key={n.id} at={n.at} pps={pps} index={i + 1} status={n.status} label={n.text} />)}</Track>
        <Track label="Audio"><Waveform duration={92} pps={pps} /></Track>
      </Timeline>
    </div>
  );
}

function AskDemo() {
  const [answer, setAnswer] = useState<string>();
  return <div style={{ width: 340 }}><AskCardView question="What pace should the launch cut have?" options={["Punchy, 20s", "Walkthrough, 45s", "Feature trio, 3×10s"]} answer={answer} onAnswer={setAnswer} /></div>;
}

function ShotsDemo() {
  const [sel, setSel] = useState("orbit-in");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 240px)", gap: 16 }}>
      {SHOTS.map((s) => <ShotCard key={s.id} shot={s} selected={sel === s.id} onSelect={() => setSel(s.id)} />)}
    </div>
  );
}

function SwatchDemo() {
  const [bg, setBg] = useState(DEFAULT_BACKDROP);
  return <div style={{ width: 300 }}><SwatchPicker wide options={Object.entries(BACKGROUNDS).filter(([, b]) => b.set === "natural").slice(0, 12).map(([id, b]) => ({ id, label: b.label, css: b.thumb }))} value={bg} onChange={setBg} /></div>;
}

function GroupDemo() {
  const [on, setOn] = useState(true);
  const [size, setSize] = useState(1.4);
  return (
    <div style={{ width: 280, borderRadius: 14, background: "var(--surface)", boxShadow: "var(--card-shadow)" }}>
      <Group title="Cursor"><Slider label="Size" value={size} min={0.6} max={3} step={0.1} format={(v) => `${v.toFixed(1)}×`} showValue onValueChange={setSize} /></Group>
      <Group title="Behavior">
        <Field label="Hide idle"><Switch checked={on} onCheckedChange={setOn} aria-label="Hide idle" /></Field>
        <Hint>Applies to footage you already have.</Hint>
      </Group>
    </div>
  );
}

function TooltipDemo() {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <Tooltip content="Split at playhead"><Key>Hover: label</Key></Tooltip>
      <Tooltip content="Undo" shortcut="⌘Z"><Key>Hover: shortcut</Key></Tooltip>
      <Tooltip content="Can't record yet" description="Choose a window"><Key>Hover: hint</Key></Tooltip>
    </div>
  );
}

/* ───────────────────────── Registry ───────────────────────── */

export const ENTRIES: DocEntry[] = [
  /* Atoms */
  {
    id: "mark", name: "Mark", layer: "Atoms",
    description: "The monolith mark: an S built from bevelled cells on a graphite tile. It also signs the agent's work: the agent avatar, and the marker on every edit the agent made.",
    demo: () => <div style={{ display: "flex", gap: 28, alignItems: "end" }}>{[96, 48, 22, 12].map((s) => <Mark key={s} size={s} />)}</div>,
    usage: `<Mark size={18} />              // title bar\n<Mark size={12} title="" />     // agent marker on a timeline item`,
    source: atomsSrc, sourcePath: "src/ui/atoms/index.tsx",
    props: [
      { name: "size", type: "number = 24", description: "Rendered size in px." },
      { name: "title", type: "string", description: "Accessible name. Pass \"\" when it's decorative." },
    ],
    whenToUse: ["Title bar at 18px, agent avatar at 22px, agent markers at 12px."],
    whenNot: ["Never recolor it or use it as decoration on content."],
  },
  {
    id: "key", name: "Key", layer: "Atoms",
    description: "The machined key, in three levels of hierarchy. Primary is the light cell from the mark, for the one action a surface exists for. Secondary is a dark key with a lit top edge. Tertiary has no material until you hover it, for quiet and escape actions.",
    demo: () => (
      <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Key variant="tertiary">Dismiss</Key><Key>Apply</Key><Key variant="primary">Export</Key>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Key size="sm">Small</Key><Key>Medium</Key><Key size="lg">Large</Key><Key pressed>Pressed</Key>
        </div>
      </div>
    ),
    usage: `<Key variant="primary" onClick={exportVideo}>Export</Key>\n<Key size="sm" variant="tertiary">Dismiss</Key>`,
    source: atomsSrc, sourcePath: "src/ui/atoms/index.tsx",
    props: [
      { name: "variant", type: "\"primary\" | \"secondary\" | \"tertiary\"", description: "Place in the hierarchy. Default secondary." },
      { name: "size", type: "\"sm\" | \"md\" | \"lg\"", description: "24, 28 or 34px tall." },
      { name: "pressed", type: "boolean", description: "Toggle state. Sets aria-pressed and seats the key." },
    ],
    whenToUse: ["Every button in the app is a Key or a component built from one."],
    whenNot: ["More than one primary per surface. If two actions compete, one of them is not primary."],
  },
  {
    id: "icon-key", name: "IconKey", layer: "Atoms",
    description: "An icon-only key. The label is required: it is the accessible name and the tooltip.",
    demo: () => (
      <div style={{ display: "flex", gap: 4 }}>
        <IconKey label="Undo" shortcut="⌘Z"><Undo2 /></IconKey>
        <IconKey label="Redo" shortcut="⇧⌘Z"><Redo2 /></IconKey>
        <IconKey label="Split" shortcut="S" variant="secondary"><Scissors /></IconKey>
      </div>
    ),
    usage: `<IconKey label="Undo" shortcut="⌘Z" onClick={undo}><Undo2 /></IconKey>`,
    source: atomsSrc, sourcePath: "src/ui/atoms/index.tsx",
    props: [
      { name: "label", type: "string", description: "Required. Accessible name and tooltip." },
      { name: "shortcut", type: "string", description: "Shown as a Kbd in the tooltip." },
      { name: "tooltip", type: "side | false", description: "Tooltip side. Bottom in the title bar, top on the timeline." },
      { name: "variant", type: "\"tertiary\" | \"secondary\"", description: "Default tertiary." },
    ],
    whenToUse: ["Toolbars where the icon is well known (undo, split, share)."],
    whenNot: ["Actions people need to read. Use a Key with words."],
  },
  {
    id: "text", name: "Label, Kbd and Timecode", layer: "Atoms",
    description: "Small text atoms. Timecode is the only place the mono face appears, so time always reads as time.",
    demo: () => (
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Label>Padding</Label>
        <span style={{ display: "flex", gap: 3 }}><Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>R</Kbd></span>
        <Timecode value={72.42} frames />
        <Timecode value={92} muted />
      </div>
    ),
    usage: `<Timecode value={time} frames fps={60} />`,
    source: atomsSrc, sourcePath: "src/ui/atoms/index.tsx",
    props: [
      { name: "value", type: "number", description: "Seconds (Timecode)." },
      { name: "frames", type: "boolean", description: "Append frames." },
      { name: "muted", type: "boolean", description: "Secondary color." },
    ],
    whenToUse: ["Timecode for every displayed time. Label for small captions next to controls."],
    whenNot: ["Mono for anything that isn't a time or a timestamp."],
  },
  {
    id: "tag", name: "Tag", layer: "Atoms",
    description: "A quiet label. Neutral by default; ink only for things you marked, rec only for recording.",
    demo: () => <div style={{ display: "flex", gap: 6 }}><Tag>Zoom</Tag><Tag>Timing</Tag><Tag tone="ink">Open</Tag><Tag tone="rec">Recording</Tag></div>,
    usage: `<Tag>Zoom</Tag>`,
    source: atomsSrc, sourcePath: "src/ui/atoms/index.tsx",
    props: [{ name: "tone", type: "\"neutral\" | \"ink\" | \"rec\"", description: "The only two colors in the system." }],
    whenToUse: ["Note intents, small statuses."],
    whenNot: ["Color-coding categories. Categories are told apart by their words."],
  },
  {
    id: "cell", name: "Cell", layer: "Atoms",
    description: "The mark's building block, skewed like the S, used as the marker shape everywhere a dot would otherwise go: who made an edit, recording state, note bullets.",
    demo: () => (
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        {(["solid", "hollow", "ink", "rec", "muted"] as const).map((v) => <span key={v} style={{ display: "grid", gap: 8, justifyItems: "center", fontSize: 11, color: "var(--text-muted)" }}><Cell variant={v} size={12} />{v}</span>)}
      </div>
    ),
    usage: `<Cell variant="hollow" />  // made automatically\n<Cell />                   // made by you\n<Mark size={12} title="" />  // made by the agent`,
    source: atomsSrc, sourcePath: "src/ui/atoms/index.tsx",
    props: [
      { name: "variant", type: "\"solid\" | \"hollow\" | \"ink\" | \"rec\" | \"muted\"", description: "Meaning, not decoration." },
      { name: "size", type: "number = 7", description: "Edge in px." },
    ],
    whenToUse: ["Anywhere you'd reach for a status dot."],
  },
  {
    id: "meter", name: "Meter", layer: "Atoms",
    description: "A live audio level. Inherits its color, so it's rec while recording and muted elsewhere.",
    demo: () => <span style={{ color: "var(--rec)" }}><Meter bars={20} /></span>,
    usage: `<span style={{ color: "var(--rec)" }}><Meter /></span>`,
    source: atomsSrc, sourcePath: "src/ui/atoms/index.tsx",
    props: [{ name: "bars", type: "number = 16", description: "Bar count." }],
    whenToUse: ["While a microphone is live."],
  },

  /* Molecules */
  {
    id: "tooltip", name: "Tooltip", layer: "Molecules",
    description: "A compact dark key that names a control, shows its shortcut, or explains a disabled state. Three variants chosen by content.",
    demo: () => <TooltipDemo />,
    usage: `<Tooltip content="Undo" shortcut="⌘Z"><IconKey … /></Tooltip>\n<Tooltip content="Can't record yet" description="Choose a window">…</Tooltip>`,
    source: tooltipSrc, sourcePath: "src/ui/base/tooltip/tooltip.tsx",
    props: [
      { name: "content", type: "ReactNode", description: "Label or hint title." },
      { name: "shortcut", type: "string", description: "Key caps; switches to the shortcut variant." },
      { name: "description", type: "ReactNode", description: "One line; switches to the hint variant." },
      { name: "side", type: "\"top\" | \"bottom\" | \"left\" | \"right\"", description: "Placement; collisions flip it." },
    ],
    whenToUse: ["Icon-only controls, shortcuts, and disabled reasons."],
    whenNot: ["Information people need to complete a task. Put it in the UI."],
  },
  {
    id: "menu-select", name: "MenuSelect", layer: "Molecules",
    description: "A quiet text trigger that opens a list of options above it. Use it for settings beside a control, like the composer's model and effort.",
    demo: () => <MenuSelectDemo />,
    usage: `<MenuSelect label="Effort" display="High" value={effort} onChange={setEffort}\n  options={[{ value: "low", label: "Low" }, { value: "high", label: "High" }]} />`,
    source: moleculesSrc, sourcePath: "src/ui/molecules/index.tsx",
    props: [
      { name: "label", type: "string", description: "Names the setting, for the menu heading and screen readers." },
      { name: "display", type: "string", description: "The trigger's text. It can say more than the option's label, like the exact model version." },
      { name: "options", type: "{ value, label }[]", description: "The choices, shown as a single-select list." },
      { name: "hint", type: "string", description: "A tooltip on the trigger that explains the current choice, like what Default means." },
    ],
    whenToUse: ["A setting beside a control, where a Switcher would take too much room.", "For 2 to 5 short options with space to show them, use Switcher."],
  },
  {
    id: "switcher", name: "Switcher", layer: "Molecules",
    description: "Mutually exclusive options in a well. The chosen option rises as a key and slides between positions on a spring. Used for Lite/Studio, the side panel, inspector tabs and aspect ratios.",
    demo: () => <SwitcherDemo />,
    usage: `<Switcher label="Editor mode" value={mode} onChange={setMode}\n  options={[{ value: "lite", label: "Lite" }, { value: "studio", label: "Studio" }]} />`,
    source: moleculesSrc, sourcePath: "src/ui/molecules/index.tsx",
    props: [
      { name: "options", type: "{ value, label, count? }[]", description: "2–5 options. count shows open items in ink." },
      { name: "full", type: "boolean", description: "Stretch to the container width." },
    ],
    composedOf: ["Well material", "Key material"],
    whenToUse: ["Switching views or a small enum."],
    whenNot: ["More than five options. Use a list."],
  },
  {
    id: "group", name: "Group and Field", layer: "Molecules",
    description: "Inspector layout: a titled group, and label-plus-control rows on a fixed label column so controls line up across groups.",
    demo: () => <GroupDemo />,
    usage: `<Group title="Behavior">\n  <Field label="Hide idle"><Switch … /></Field>\n  <Hint>Applies to footage you already have.</Hint>\n</Group>`,
    source: moleculesSrc, sourcePath: "src/ui/molecules/index.tsx",
    props: [
      { name: "title", type: "string", description: "Group heading." },
      { name: "label", type: "string", description: "Field label." },
    ],
    whenToUse: ["Every inspector tab."],
  },
  {
    id: "dock-keys", name: "SourceKey and ToggleKey", layer: "Molecules",
    description: "The keys inside docks. SourceKey stacks an icon over a label for choosing what to record. ToggleKey states its current setting in words (\"No microphone\") so the dock reads like a sentence.",
    demo: () => <ToggleDemo />,
    usage: `<ToggleKey on={mic} onChange={setMic} iconOn={<Mic />} iconOff={<MicOff />}\n  labelOn="Microphone" labelOff="No microphone" />`,
    source: moleculesSrc, sourcePath: "src/ui/molecules/index.tsx",
    props: [
      { name: "selected / on", type: "boolean", description: "State." },
      { name: "labelOn / labelOff", type: "string", description: "Say the state, not the action." },
    ],
    whenToUse: ["Inside a Dock."],
  },
  {
    id: "note-card", name: "NoteCard", layer: "Molecules",
    description: "A note pinned to a moment. Open notes can be applied by the agent; applied notes say how many edits answered them.",
    demo: () => <div style={{ width: 340, display: "grid", gap: 8 }}>{mockProject.notes.map((n, i) => <NoteCard key={n.id} note={n} index={i + 1} />)}</div>,
    usage: `<NoteCard note={note} index={1} onSeek={seek} onApply={() => agent.applyNotes([note.id])} />`,
    source: moleculesSrc, sourcePath: "src/ui/molecules/index.tsx",
    props: [
      { name: "note", type: "Note", description: "Time, text, intents, status, optional voice, ink and region." },
      { name: "index", type: "number", description: "Matches the pin on the frame and the timeline." },
    ],
    composedOf: ["Key", "Tag", "Well"],
    whenToUse: ["The Notes tab."],
  },
  {
    id: "swatch", name: "SwatchPicker", layer: "Molecules",
    description: "Backdrop picker. Quiet graphite backdrops first, then the colour set for launch shots.",
    demo: () => <SwatchDemo />,
    usage: `<SwatchPicker options={…} value={background} onChange={setBackground} />`,
    source: moleculesSrc, sourcePath: "src/ui/molecules/index.tsx",
    props: [{ name: "options", type: "{ id, label, css }[]", description: "Backdrops from the tokens." }],
    whenToUse: ["The Shot tab in Studio."],
  },


  /* Organisms */
  {
    id: "annotation-dock", name: "AnnotationDock", layer: "Organisms",
    description: "The note bar on the stage: voice, draw, mark an area, type, send. Notes are pinned to the current time and go to the agent. This is the main way to edit in Spontaneous.",
    demo: () => <AnnotationDockDemo />,
    usage: `<AnnotationDock tool={tool} onToolChange={setTool} timeLabel="0:12" hasDraft={!!draft} onSubmit={addNote} />`,
    source: dockSrc, sourcePath: "src/ui/organisms/dock/index.tsx",
    props: [
      { name: "tool", type: "\"pointer\" | \"pen\" | \"region\"", description: "Active tool." },
      { name: "hasDraft", type: "boolean", description: "Ink is waiting for words; focuses the well." },
      { name: "onSubmit", type: "(text, voice?) => void", description: "Create the note." },
    ],
    composedOf: ["Dock", "DockTool", "Well", "Face send key", "Meter"],
    whenToUse: ["Bottom of the stage, once per editor."],
  },
  {
    id: "recorder-dock", name: "RecorderDock", layer: "Organisms",
    description: "The recorder. Opened from the menu bar, it picks the source and audio, records, and stops. The same slab swaps its contents between setup and recording so it never jumps. Stopping opens the editor.",
    demo: () => <RecorderDemo />,
    usage: `<RecorderDock phase={phase} source={source} onSource={setSource} … onRecord={record} onStop={stop} />`,
    source: dockSrc, sourcePath: "src/ui/organisms/dock/index.tsx",
    props: [
      { name: "phase", type: "\"setup\" | \"starting\" | \"recording\" | \"stopping\"", description: "What the slab shows." },
      { name: "blocked", type: "string | null", description: "Why Record is disabled, shown as its tooltip." },
      { name: "above", type: "ReactNode", description: "Window list, permission notice or error, above the dock." },
    ],
    composedOf: ["Dock", "SourceKey", "ToggleKey", "Face record key", "Cell", "Timecode"],
    whenToUse: ["The recorder window only."],
  },
  {
    id: "stage", name: "Stage", layer: "Organisms",
    description: "CanvasViewport fits a frame of the given aspect into the stage and reports its rect to Rust, where the native renderer will draw. Camera previews the motion model: separate springs for scale and center, with the pan clamped so the edges never show.",
    demo: () => <StageDemo />, flush: true,
    usage: `<CanvasViewport aspect="16:9" background={bg} overlay={<AnnotationDock … />}>\n  <Camera scale={zoom.scale} target={zoom.target}>\n    <DeviceFrame kind="browser">…</DeviceFrame>\n  </Camera>\n</CanvasViewport>`,
    source: stageSrc, sourcePath: "src/ui/organisms/stage/index.tsx",
    props: [
      { name: "aspect", type: "\"16:9\" | \"9:16\" | \"1:1\" | \"4:5\"", description: "Canvas aspect." },
      { name: "scale / target", type: "number / { x, y }", description: "Camera zoom and focus." },
      { name: "kind", type: "\"browser\" | \"browser-minimal\" | \"window\" | \"iphone\"", description: "Device frame." },
    ],
    whenToUse: ["The editor stage and template previews."],
    whenNot: ["Never draw video frames in the webview in the shipped renderer; this is the hole the native layer fills."],
  },
  {
    id: "timeline", name: "Timeline", layer: "Organisms",
    description: "Tracks with a shared ruler and playhead. Item kinds are told apart by material, not hue: clips are blue, zooms are light face keys, overlays are dark keys. Each item carries who made it.",
    demo: () => <TimelineDemo />, flush: true,
    usage: `<Timeline duration={92} pps={12} time={time} onSeek={seek}>\n  <Track label="Zoom"><TrackItem kind="zoom" start={4} end={9} pps={12} label="1.6×" author="auto" /></Track>\n</Timeline>`,
    source: timelineSrc, sourcePath: "src/ui/organisms/timeline/index.tsx",
    props: [
      { name: "pps", type: "number", description: "Pixels per second." },
      { name: "kind", type: "\"zoom\" | \"overlay\"", description: "Item material." },
      { name: "author", type: "\"user\" | \"auto\" | \"agent\"", description: "Solid cell, hollow cell, or the mark." },
    ],
    whenToUse: ["Studio mode."],
    whenNot: ["Lite mode, which uses a single scrub bar."],
  },
  {
    id: "shot-library", name: "Shot library", layer: "Organisms",
    description: "Where a recording sits and how the camera moves. Two sets: Basics for demos, and Director's Cut for launches, built on device models. Each shot is a starting pose plus motion primitives (orbit, tilt, push, truck, rise, lid, settle, drift, shuffle). Thumbnails rest on the hero frame and play the move on hover. Every card uses the same stand-in screen (the editor, drawn from the tokens), so shots are compared against one real interface.",
    demo: () => <ShotsDemo />,
    usage: `<ShotCard shot={shotById("orbit-in")} selected onSelect={…} />\n<ShotScene shot={shot} pose={poseAt(shot, t, project.motion)} screen={<VideoScreen … />} />`,
    source: shotSrc, sourcePath: "src/ui/organisms/shot/index.tsx",
    props: [
      { name: "shot", type: "Shot", description: "Device, backdrop, start pose and motion primitives." },
      { name: "pose", type: "Pose", description: "The frame to draw; poseAt(shot, t, tuning) computes it." },
      { name: "tuning", type: "{ speed, amount }", description: "Per project. The agent changes these from descriptions." },
    ],
    whenToUse: ["The Shot tab; the stage for 3D shots."],
    whenNot: ["Flat Basics shots (Zoom focus, Clean window) render through the stage's own frame."],
  },
  {
    id: "agent-thread", name: "AgentThread", layer: "Organisms",
    description: "The agent conversation. Text, collapsed reasoning, and a card for every tool call. Edits get an Undo, and questions from the agent become an AskCard.",
    demo: () => <div style={{ width: 360, height: 480, display: "flex", overflow: "hidden", borderRadius: 14, background: "var(--surface)", boxShadow: "var(--card-shadow)" }}><DemoRuntime messages={demoThread}><AgentThread suggestions={<SuggestionChips items={[{ id: "a", label: "Apply 2 open notes", onSelect: () => {} }]} />} /></DemoRuntime></div>,
    usage: `<AgentRuntimeProvider runtime={runtime}>\n  <AgentThread suggestions={<SuggestionChips items={…} />} />\n</AgentRuntimeProvider>`,
    source: agentSrc, sourcePath: "src/ui/organisms/agent/index.tsx",
    props: [
      { name: "suggestions", type: "ReactNode", description: "Above the composer, driven by open notes." },
      { name: "tools", type: "Record<string, ToolCallMessagePartComponent>", description: "Per-tool renderers; others fall back to an edit card." },
    ],
    composedOf: ["Mark", "Key", "Kbd", "Dock material (composer)"],
    whenToUse: ["The Agent tab."],
    whenNot: ["Holding thread state in React. Rust owns it; the runtime mirrors it."],
  },
  {
    id: "update-card", name: "CliUpdateNotice", layer: "Organisms",
    description: "Offers a newer Claude Code, once per launch. Update runs the CLI's own updater, then checks the version it reports.",
    demo: () => <UpdateCardDemo />,
    usage: `<CliUpdateNotice installed="2.1.316" latest="2.1.318" state={state}\n  onUpdate={install} onDismiss={dismiss} />`,
    source: agentSrc, sourcePath: "src/ui/organisms/agent/index.tsx",
    props: [
      { name: "installed / latest", type: "string", description: "Versions as plain numbers, like 2.1.318." },
      { name: "state", type: "idle | updating | updated | failed", description: "Drives the button and the note. Failed carries the updater's last line." },
      { name: "floating", type: "boolean", description: "Default true: fixed under the title bar. Off to show it in place." },
    ],
    composedOf: ["Mark", "Key", "IconKey", "Dock material"],
    whenToUse: ["The installed Claude Code is older than the latest release."],
    whenNot: ["Errors the user didn't cause. A failed version lookup stays silent."],
  },
  {
    id: "ask", name: "AskCard", layer: "Organisms",
    description: "Steering. When the agent needs a decision it asks, and your answer goes back to it as the tool result.",
    demo: () => <AskDemo />,
    usage: `tools: { by_name: { ask_user: AskCard } }`,
    source: agentSrc, sourcePath: "src/ui/organisms/agent/index.tsx",
    props: [
      { name: "question", type: "string", description: "One decision." },
      { name: "options", type: "string[]", description: "2–4 answers; number keys pick." },
    ],
    whenToUse: ["When the agent would otherwise guess at taste or direction."],
  },
];

export const LAYERS: Layer[] = ["Atoms", "Molecules", "Organisms"];
