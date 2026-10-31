import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Mic, MicOff, Monitor, MousePointer2, PenLine, Undo2 } from "lucide-react";
import { Cell, IconKey, Key, Mark, Tag } from "@/ui/atoms";
import { NoteCard, SourceKey, Switcher, ToggleKey } from "@/ui/molecules";
import { DockTool } from "@/ui/organisms/dock";
import { TooltipPreview } from "@/ui/base/tooltip/tooltip";
import { mockProject } from "@/editor/model";
import { MATERIALS, bootStageSVG, runBoot } from "./markStudio";

export interface Variant { name: string; when: string }
export interface State { name: string; note: string; render: () => ReactNode }
export interface Interaction { input: string; response: string }
export interface Details {
  /** The cap on variants, stated as a rule. */
  limit: string;
  variants: Variant[];
  states?: State[];
  interactions?: Interaction[];
  extra?: () => ReactNode;
}

/** Render a child in a forced state (hover, active, focus) for documentation. */
const Force = ({ state, children }: { state?: "hover" | "active" | "focus"; children: ReactNode }) => <div data-force={state} style={{ display: "inline-flex" }}>{children}</div>;

const open = mockProject.notes[0]!;
const applied = mockProject.notes[1]!;

/* ───────────────────────── Mark gallery + Boot ───────────────────────── */

function MarkGallery() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
      {MATERIALS.map((m, i) => (
        <figure key={m.id} style={{ margin: 0, display: "grid", gap: 8, padding: 12, borderRadius: 14, background: "var(--surface)", boxShadow: "var(--card-shadow)" }}>
          <div style={{ aspectRatio: "1", filter: "drop-shadow(0 10px 18px rgb(0 0 0 / .5))" }} dangerouslySetInnerHTML={{ __html: m.svg(`mk${i}-`) }} />
          <figcaption style={{ display: "grid", gap: 4 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--foreground)", fontWeight: 520, fontSize: 13 }}>{m.name}{m.shipped && <Tag tone="ink" size="sm">Shipped</Tag>}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>{m.note}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function BootPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.innerHTML = bootStageSVG(`boot${run}-`);
    const svg = node.querySelector("svg");
    if (!svg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return runBoot(svg);
  }, [run]);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div ref={ref} style={{ position: "relative", aspectRatio: "16 / 9", borderRadius: 14, overflow: "hidden", background: "radial-gradient(120% 90% at 50% 40%, #0d0e12 0%, #030304 62%)", boxShadow: "var(--card-shadow)" }} />
      <div><Key size="sm" onClick={() => setRun((r) => r + 1)}>Replay</Key></div>
    </div>
  );
}

/* ───────────────────────── Details per component ───────────────────────── */

export const DETAILS: Record<string, Details> = {
  mark: {
    limit: "One shipped material (Monolith). The rest are documented explorations, not for use in product.",
    variants: MATERIALS.map((m) => ({ name: m.name, when: m.shipped ? "App icon, title bar, agent avatar, agent markers." : "Exploration only." })),
    interactions: [
      { input: "App launch", response: "Recorder intro: the camera pulls back onto the mark with zoom blur (spring 200/40/2.25), then hands over to the dock." },
      { input: "Loading (Boot)", response: "Pixels flicker on in reading order, a light sweeps across, then they power down in reverse. 6.8s loop." },
    ],
    extra: () => (
      <>
        <h3 style={{ margin: "28px 0 12px", fontSize: 15, fontWeight: 600 }}>Materials</h3>
        <MarkGallery />
        <h3 style={{ margin: "28px 0 12px", fontSize: 15, fontWeight: 600 }}>Loading animation: Boot</h3>
        <BootPreview />
      </>
    ),
  },
  key: {
    limit: "3 variants × 3 sizes. One primary per surface; never two primaries side by side.",
    variants: [
      { name: "primary", when: "The one action the surface exists for: Export, Record, Send, Apply all, Play." },
      { name: "secondary", when: "Other real actions: Apply on a card, Regenerate, Change, suggestions." },
      { name: "tertiary", when: "Quiet, reversible or escape actions: Dismiss, Undo, Close, Cancel." },
    ],
    states: [
      { name: "Rest", note: "Material only", render: () => <div style={{ display: "flex", gap: 8 }}><Key variant="primary">Export</Key><Key>Apply</Key><Key variant="tertiary">Dismiss</Key></div> },
      { name: "Hover", note: "Lighter gradient; tertiary gains a fill", render: () => <Force state="hover"><div style={{ display: "flex", gap: 8 }}><Key variant="primary">Export</Key><Key>Apply</Key><Key variant="tertiary">Dismiss</Key></div></Force> },
      { name: "Pressed", note: "Seats 0.5px, scale .98, inset shadow", render: () => <Force state="active"><div style={{ display: "flex", gap: 8 }}><Key variant="primary">Export</Key><Key>Apply</Key><Key variant="tertiary">Dismiss</Key></div></Force> },
      { name: "Toggled", note: "aria-pressed: stays seated", render: () => <Key pressed>Loop</Key> },
      { name: "Focus", note: "Keyboard only: 2px outline", render: () => <Force state="focus"><Key>Apply</Key></Force> },
      { name: "Disabled", note: "40% and no pointer", render: () => <div style={{ display: "flex", gap: 8 }}><Key variant="primary" disabled>Export</Key><Key disabled>Apply</Key></div> },
    ],
    interactions: [
      { input: "Hover", response: "Background shifts to the hover gradient over 120ms." },
      { input: "Press", response: "Moves down 0.5px and scales to .98 with an inset shadow; releases on the standard ease in 120ms." },
      { input: "Tab / Shift-Tab", response: "Focus ring appears only for keyboard focus." },
      { input: "Enter / Space", response: "Activates, same as click." },
    ],
  },
  "icon-key": {
    limit: "Tertiary by default; secondary only in a toolbar that needs visible keys. Sizes sm and md.",
    variants: [
      { name: "tertiary", when: "Title bar and timeline tools (undo, redo, split, share)." },
      { name: "secondary", when: "Standalone icon actions on a busy background." },
    ],
    states: [
      { name: "Rest", note: "Icon only", render: () => <IconKey label="Undo" tooltip={false}><Undo2 /></IconKey> },
      { name: "Hover", note: "Fill appears", render: () => <Force state="hover"><IconKey label="Undo" tooltip={false}><Undo2 /></IconKey></Force> },
      { name: "Pressed", note: "Seats and scales", render: () => <Force state="active"><IconKey label="Undo" tooltip={false}><Undo2 /></IconKey></Force> },
      { name: "Disabled", note: "Nothing to undo", render: () => <IconKey label="Undo" tooltip={false} disabled><Undo2 /></IconKey> },
    ],
    interactions: [
      { input: "Hover 450ms", response: "Tooltip reveals with the label and shortcut. Neighbours then open instantly for 400ms." },
      { input: "Press", response: "Same as Key." },
    ],
  },
  tooltip: {
    limit: "3 variants. Never more than one line of description; anything longer belongs in the UI.",
    variants: [
      { name: "label", when: "Names an icon-only control." },
      { name: "shortcut", when: "The control has a keyboard shortcut." },
      { name: "hint", when: "Explains why something is disabled, or what a pin says." },
    ],
    states: [
      { name: "label", note: "22px, one line", render: () => <TooltipPreview content="Split at playhead" /> },
      { name: "shortcut", note: "Label + key caps", render: () => <TooltipPreview content="Undo" shortcut="⌘Z" /> },
      { name: "hint", note: "Title + one line", render: () => <TooltipPreview content="Can't record yet" description="Choose a window" /> },
    ],
    interactions: [
      { input: "Hover 450ms", response: "Reveals: scales from .94 and travels 3px away from the trigger on --ease-reveal over 220ms." },
      { input: "Move to a neighbour within 400ms", response: "Opens instantly in place, fade only." },
      { input: "Leave / press", response: "Collapses toward the trigger on --ease-collapse in 110ms." },
      { input: "Reduced motion", response: "Opacity only." },
    ],
  },
  tag: {
    limit: "3 tones × 2 sizes. Tones carry meaning only: ink = yours, rec = recording.",
    variants: [
      { name: "neutral", when: "Intents and small categories (Zoom, Timing)." },
      { name: "ink", when: "Something you marked or that needs your attention." },
      { name: "rec", when: "Recording state only." },
    ],
    states: [
      { name: "md", note: "18px, in cards", render: () => <div style={{ display: "flex", gap: 6 }}><Tag>Zoom</Tag><Tag tone="ink">Open</Tag><Tag tone="rec">Recording</Tag></div> },
      { name: "sm", note: "16px, dense rows", render: () => <div style={{ display: "flex", gap: 6 }}><Tag size="sm">Zoom</Tag><Tag size="sm" tone="ink">Shipped</Tag></div> },
    ],
  },
  cell: {
    limit: "5 variants, each one meaning.",
    variants: [
      { name: "solid", when: "Made by you." }, { name: "hollow", when: "Made automatically." },
      { name: "ink", when: "Your notes." }, { name: "rec", when: "Live recording." }, { name: "muted", when: "Idle status." },
    ],
  },
  switcher: {
    limit: "2–5 options. One per surface level (mode, panel, tab).",
    variants: [
      { name: "inline", when: "Modes and panels in a header (Lite/Studio, Agent/Notes)." },
      { name: "full", when: "Inspector tabs and enums that fill a column." },
    ],
    states: [
      { name: "Selected", note: "Option rises as a key", render: () => <Switcher label="Mode" value="lite" onChange={() => {}} options={[{ value: "lite", label: "Lite" }, { value: "studio", label: "Studio" }]} /> },
      { name: "With count", note: "Open items in ink", render: () => <Switcher label="Panel" value="agent" onChange={() => {}} options={[{ value: "agent", label: "Agent" }, { value: "notes", label: "Notes", count: 2 }]} /> },
      { name: "Hover", note: "Unselected text brightens", render: () => <Force state="hover"><Switcher label="Mode" value="lite" onChange={() => {}} options={[{ value: "lite", label: "Lite" }, { value: "studio", label: "Studio" }]} /></Force> },
    ],
    interactions: [
      { input: "Click an option", response: "The key slides to it on a critically damped spring (visual 320ms, no bounce)." },
      { input: "⌘1 / ⌘2", response: "Switches Lite and Studio from anywhere in the editor." },
    ],
  },
  "dock-keys": {
    limit: "SourceKey: one radio group per dock. ToggleKey: label states the setting, never the action.",
    variants: [
      { name: "SourceKey", when: "Choosing exactly one of a few sources." },
      { name: "ToggleKey", when: "An on/off setting inside a dock." },
    ],
    states: [
      { name: "Selected", note: "Raised key", render: () => <SourceKey icon={<Monitor />} label="Display" selected onSelect={() => {}} /> },
      { name: "Unselected", note: "Text only", render: () => <SourceKey icon={<Monitor />} label="Window" selected={false} onSelect={() => {}} /> },
      { name: "Hover", note: "Fill appears", render: () => <Force state="hover"><SourceKey icon={<Monitor />} label="Area" selected={false} onSelect={() => {}} /></Force> },
      { name: "Chosen + clear", note: "Shows the choice; × returns to Display", render: () => <SourceKey icon={<Monitor />} label="Safari" selected onSelect={() => {}} onClear={() => {}} /> },
      { name: "Toggle on", note: "Foreground", render: () => <ToggleKey on onChange={() => {}} iconOn={<Mic />} iconOff={<MicOff />} labelOn="Microphone" labelOff="No microphone" /> },
      { name: "Toggle off", note: "Muted, says so", render: () => <ToggleKey on={false} onChange={() => {}} iconOn={<Mic />} iconOff={<MicOff />} labelOn="Microphone" labelOff="No microphone" /> },
    ],
    interactions: [
      { input: "Click", response: "Selection moves instantly; the key gains the raised material over 160ms. Window and Area open the on-screen picker." },
      { input: "Click ×", response: "Drops the chosen window or area and returns to Display." },
      { input: "Press", response: "Scale .97." },
    ],
  },
  "note-card": {
    limit: "4 states: open, queued, applying, applied (collapsed). One secondary and one tertiary action at most.",
    variants: [
      { name: "open", when: "A note waiting for you to apply it." },
      { name: "queued", when: "Applied while the agent is busy; it waits its turn and can be cancelled." },
      { name: "applying", when: "The agent is working on it; no actions." },
      { name: "applied", when: "Resolved; collapses to the text and edit count." },
    ],
    states: [
      { name: "Open", note: "Pin, time, text, intents, Dismiss + Apply", render: () => <div style={{ width: 320 }}><NoteCard note={open} index={1} /></div> },
      { name: "Hover", note: "Edge brightens", render: () => <Force state="hover"><div style={{ width: 320 }}><NoteCard note={open} index={1} /></div></Force> },
      { name: "Selected", note: "Ink edge, pin on frame active", render: () => <div style={{ width: 320 }}><NoteCard note={open} index={1} selected /></div> },
      { name: "Queued", note: "Waits its turn; Cancel takes it back", render: () => <div style={{ width: 320 }}><NoteCard note={{ ...open, status: "queued" }} index={1} /></div> },
      { name: "Applying", note: "Progress, no actions", render: () => <div style={{ width: 320 }}><NoteCard note={{ ...open, status: "applying" }} index={1} /></div> },
      { name: "Applied", note: "Collapsed", render: () => <div style={{ width: 320 }}><NoteCard note={applied} index={2} /></div> },
    ],
    interactions: [
      { input: "Click the time", response: "Seeks the playhead; tooltip shows when it was written." },
      { input: "Click the voice chip", response: "Plays the voice note; the chip fills as it plays. The note's text is its transcript." },
      { input: "Apply while the agent is busy", response: "The note is queued and shows under the thread as Up next; a second click does nothing." },
      { input: "Click the card", response: "Selects it and highlights its pin on the frame and timeline." },
      { input: "Apply", response: "Hands the note to the agent; the card shows Applying… then collapses to Applied." },
    ],
  },
  "annotation-dock": {
    limit: "3 tools (select, draw, mark area) + voice. No other tools join the dock.",
    variants: [{ name: "stage", when: "Bottom centre of the stage, one per editor." }],
    states: [
      { name: "Tool selected", note: "Raised key", render: () => <div style={{ display: "flex", gap: 2, padding: 4, borderRadius: 12, background: "var(--dock-bg)", boxShadow: "var(--dock-shadow)" }}><DockTool label="Select"><MousePointer2 /></DockTool><DockTool label="Draw" pressed><PenLine /></DockTool></div> },
      { name: "Voice live", note: "Rec color + meter", render: () => <div style={{ display: "flex", gap: 2, padding: 4, borderRadius: 12, background: "var(--dock-bg)", boxShadow: "var(--dock-shadow)" }}><DockTool label="Stop voice note" pressed live><Mic /></DockTool></div> },
    ],
    interactions: [
      { input: "V / P / M", response: "Select, draw, mark area." },
      { input: "Drag on the frame (pen)", response: "Ink follows the pointer; on release the well focuses for words." },
      { input: "Drag on the frame (area)", response: "Dashed ink rectangle; on release the well focuses." },
      { input: "Enter", response: "Sends the note pinned to the current time." },
    ],
  },
  "recorder-dock": {
    limit: "2 phases (setup, live). Keys are 32px; one primary (Record / Stop).",
    variants: [
      { name: "setup", when: "Choosing source and audio." },
      { name: "live", when: "Recording: clock, level, Discard, Stop." },
    ],
    interactions: [
      { input: "Drag the grip or any empty part", response: "Moves the window." },
      { input: "Window", response: "On-screen picker: the window under the cursor is tinted and named; click it. Tab / arrows cycle front to back, Return picks, Esc cancels, all in one press even after Cmd-Tab." },
      { input: "Area", response: "Opens the full-screen picker; drag to choose, Enter to confirm, Esc to cancel." },
      { input: "Record", response: "Label swaps to Starting… in place (fixed width), then the slab swaps to the live phase." },
      { input: "Stop / Esc", response: "Saving…, then the dock closes and the editor opens on the new project." },
    ],
  },
  timeline: {
    limit: "Item kinds: clip (blue), zoom (face), overlay (key). No new hues.",
    variants: [
      { name: "clip", when: "Recorded footage." }, { name: "zoom", when: "Camera moves." }, { name: "overlay", when: "Callouts, blurs, key overlays." },
    ],
    interactions: [
      { input: "Click / drag the ruler", response: "Scrubs." },
      { input: "← / → (⇧ for 1s)", response: "Steps the playhead a frame or a second." },
      { input: "Click an item", response: "Selects it; zooms also seek to their start." },
      { input: "Delete", response: "Removes the selected item (undoable)." },
    ],
  },
  "agent-thread": {
    limit: "Part renderers: text, reasoning, tool card, ask card. Edits always carry Undo (tertiary).",
    variants: [
      { name: "read tool", when: "The agent inspected something: muted title." },
      { name: "edit tool", when: "The agent changed the project: bright title + Undo." },
    ],
    interactions: [
      { input: "Reasoning", response: "Shimmers while streaming; click to expand." },
      { input: "Enter in composer", response: "Sends; Send becomes Stop while running." },
    ],
  },
};

export { Cell, Mark };
