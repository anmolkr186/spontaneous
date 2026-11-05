import { useState } from "react";
import { Duration, Timecode } from "@/ui/atoms";
import { NoteThread } from "@/ui/organisms/note-thread";
import type { NoteThreadMessage } from "@/ui/organisms/note-thread";
import src from "@/ui/organisms/note-thread/index.tsx?raw";
import { useScript } from "../demo";
import type { Beat } from "../demo";
import type { DocEntry } from "../registry";

const you = { name: "You" };
const agent = { name: "Spontaneous", agent: true };

function thread(now: number): NoteThreadMessage[] {
  return [
    { id: "n2", author: you, text: "zoom here, it's too small", createdAt: now - 4 * 60_000 },
    {
      id: "r1",
      author: agent,
      text: "Zoomed in on the Create button while you click it, and eased out once the dialog opens.",
      createdAt: now - 3 * 60_000,
      status: {
        label: "Added a zoom",
        at: 11.2,
        end: 16.6,
        details: [
          { label: "Scale", value: "1.8×" },
          { label: "Focus", value: "Create button" },
          { label: "From", value: <Timecode value={11.2} /> },
          { label: "To", value: <Timecode value={16.6} /> },
          { label: "Ease in", value: <Duration ms={600} /> },
        ],
      },
    },
  ];
}

const slower: NoteThreadMessage = {
  id: "r2",
  author: agent,
  text: "Slowed the zoom in and held it a second longer, so the dialog has time to land.",
  status: {
    label: "Retimed the zoom",
    at: 11.2,
    end: 17.6,
    details: [
      { label: "Ease in", value: <Duration ms={900} /> },
      { label: "To", value: <Timecode value={17.6} /> },
    ],
  },
};

const ASK = "@agent make it slower";

/** Types into the reply field the way a person would, then sends. */
function typeAndSend(root: () => HTMLElement | null, text: string, start: number): Beat[] {
  const input = () => root()?.querySelector("input");
  const set = (value: string) => {
    const el = input();
    if (!el) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return [
    ...text.split("").map((_, i) => ({ at: start + i * 45, run: () => set(text.slice(0, i + 1)) })),
    { at: start + text.length * 45 + 350, run: () => input()?.form?.requestSubmit() },
  ];
}

function Demo() {
  const [now] = useState(() => Date.now());
  const root = useScript([
    { at: 1700, run: () => root.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.click() },
    ...typeAndSend(() => root.current, ASK, 3600),
  ]);
  return (
    <div ref={root} style={{ width: 380, maxWidth: "100%" }}>
      <NoteThread
        index={2}
        at={12}
        messages={thread(now)}
        onSeek={() => {}}
        onClose={() => {}}
        onReply={(text) => (text.includes("@agent") ? new Promise((done) => window.setTimeout(() => done(slower), 3200)) : undefined)}
      />
    </div>
  );
}

export const entry: DocEntry = {
  id: "note-thread",
  name: "NoteThread",
  layer: "Organisms",
  category: "Agent",
  order: 80,
  isNew: true,
  description: "One note on the frame with the conversation under it: the note as you left it, the agent's replies with what it did, and a reply field. Status lines fold open the exact changes, and asking @agent again shows it thinking in place.",
  demo: () => <Demo />,
  usage: `import { NoteThread } from "@/ui/organisms/note-thread";

<NoteThread
  index={2}
  at={12}
  messages={[
    { id: note.id, author: { name: "You" }, text: "zoom here, it's too small" },
    {
      id: "r1",
      author: { name: "Spontaneous", agent: true },
      text: "Zoomed in on the Create button while you click it.",
      status: {
        label: "Added a zoom", at: 11.2, end: 16.6,
        details: [
          { label: "Scale", value: "1.8×" },
          { label: "From", value: <Timecode value={11.2} /> },
          { label: "To", value: <Timecode value={16.6} /> },
        ],
      },
    },
  ]}
  onSeek={seek}
  onClose={() => select(null)}
  // Return a promise to show the agent thinking until it answers.
  onReply={(text) => text.includes("@agent") ? agent.reply(note.id, text) : undefined}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/note-thread/index.tsx",
  props: [
    { name: "index", type: "number", description: "The note's pin number, as on the frame." },
    { name: "at", type: "number", description: "The time the note points at, in seconds." },
    { name: "messages", type: "NoteThreadMessage[]", description: "{ id, author, text, createdAt?, status? }. The first is the note itself. New replies are kept inside." },
    { name: "currentUser", type: "NoteAuthor = { name: \"You\" }", description: "Author of new replies." },
    { name: "onReply", type: "(text) => NoteThreadMessage | Promise<NoteThreadMessage | void> | void", description: "Called with each reply. Return the agent's answer to post it; a promise shows the agent thinking until it settles; nothing just posts the reply." },
    { name: "thinking", type: "string[]", description: "Phases the thinking line rolls through. Default: reading the note, looking at the frame, changing the edit." },
    { name: "onSeek", type: "(t) => void", description: "Makes the note's time a button that jumps the playhead." },
    { name: "onClose", type: "() => void", description: "Shows a close key in the tray header." },
    { name: "title", type: "ReactNode", description: "Tray title. Default: \"Note 2 · 0:12\"." },
    { name: "placeholder", type: "string = \"Reply, or ask @agent…\"", description: "Placeholder for the reply field." },
    { name: "className", type: "string", description: "Extra class on the tray." },
  ],
  composedOf: ["Tray", "NotePin", "Mark", "StatusGlyph", "Fold", "ThinkingLoader", "RollNumber", "Timecode"],
  whenToUse: [
    "Opening one note from the frame or the Notes list to see what the agent did about it and to follow up.",
    "Follow-ups that belong to that note: \"@agent make it slower\", \"keep the zoom but drop the callout\".",
    "Agent replies that changed the timeline: give them a status line with the times, and the exact values as details.",
  ],
  whenNot: [
    "Requests about the whole video: use the agent thread in the panel.",
    "Listing every note in the project: use NoteCard in the Notes list.",
    "Reviewing edits to captions or narration word by word: use InlineDiff.",
  ],
  keyboard: [
    ["↵", "Sends the reply."],
    ["Tab", "Reaches the note's time, each status line and the reply field."],
    ["Space ↵", "On a status line: folds its details open or shut."],
  ],
  a11y: [
    "The tray is a section named \"Note 2 at 0:12\".",
    "Status lines are buttons with aria-expanded and aria-controls; folded details are inert.",
    "New replies are announced politely; the thinking line is a status region that reads each phase once.",
    "Details are a description list, so each value is read with its label.",
  ],
  motion: [
    "The thread there from the start builds up a beat at a time; each reply rises 3px out of a 2px blur.",
    "Asking @agent puts a thinking line in place; its answer blurs in where the line was as the line blurs out.",
    "Details fold open on the drawer curve and their rows drop in 60ms apart; the chevron turns.",
    "The card's height glides to every change on a no-bounce spring, and the reply count rolls.",
    "Reduced motion: nothing moves; replies and details appear at once and the thinking line stands still.",
  ],
};
