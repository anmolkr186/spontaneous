import { useEffect, useState } from "react";
import { CitedAnswer } from "@/ui/organisms/cited-answer";
import type { CitedSegment, Moment } from "@/ui/organisms/cited-answer";
import src from "@/ui/organisms/cited-answer/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

/** A frame of the recorded Projects page, small enough for a preview strip. */
function ProjectsFrame({ cursor, pressed, dialog, ink }: { cursor?: [number, number]; pressed?: boolean; dialog?: boolean; ink?: boolean }) {
  return (
    <svg viewBox="0 0 160 100" aria-hidden>
      <rect width="160" height="100" fill="#f4f4f5" />
      <rect width="160" height="10" fill="#e7e7ea" />
      <rect x="0" y="10" width="34" height="90" fill="#ececee" />
      {[18, 26, 34].map((y) => <rect key={y} x="6" y={y} width="20" height="3" rx="1.5" fill="#cfcfd4" />)}
      <rect x="42" y="18" width="40" height="5" rx="2" fill="#2a2a2e" />
      <rect x="128" y="16" width="24" height="9" rx="2.5" fill={pressed ? "#3a3a40" : "#111113"} />
      <rect x="133" y="19.5" width="14" height="2" rx="1" fill="#f4f4f5" />
      {[32, 46, 60, 74].map((y) => <rect key={y} x="42" y={y} width="110" height="10" rx="2" fill="#fff" stroke="#e4e4e7" strokeWidth=".6" />)}
      {dialog && (
        <>
          <rect width="160" height="100" fill="rgb(0 0 0 / .28)" />
          <rect x="44" y="22" width="72" height="56" rx="4" fill="#fff" />
          <rect x="50" y="29" width="34" height="4" rx="2" fill="#2a2a2e" />
          <rect x="50" y="40" width="60" height="8" rx="2" fill="#f1f1f3" stroke="#dedee3" strokeWidth=".6" />
          <rect x="88" y="66" width="22" height="7" rx="2" fill="#111113" />
        </>
      )}
      {ink && <ellipse cx="140" cy="20.5" rx="17" ry="10" fill="none" stroke="#f0b444" strokeWidth="1.6" strokeLinecap="round" />}
      {cursor && <path d={`M${cursor[0]} ${cursor[1]}l0 9 2.4-2.2 1.7 3.8 1.5-.7-1.7-3.7 3.3-.2z`} fill="#111" stroke="#fff" strokeWidth=".7" strokeLinejoin="round" />}
    </svg>
  );
}

const MOMENTS: Moment[] = [
  { id: "t1", kind: "transcript", at: 0, end: 4.2, title: "Opening narration", quote: "So, um, this is the Projects page. And here you just, uh, click the Create button up in the top right.", highlight: ["um", "uh"] },
  { id: "c1", kind: "click", at: 11.2, title: "Click on Create", thumb: [<ProjectsFrame key="a" cursor={[96, 52]} />, <ProjectsFrame key="b" cursor={[124, 30]} />, <ProjectsFrame key="c" cursor={[139, 20]} pressed />] },
  { id: "n2", kind: "note", pin: 2, at: 12, title: "zoom here, it's too small", quote: "zoom here, it's too small", highlight: "too small", thumb: <ProjectsFrame cursor={[139, 20]} ink /> },
  { id: "f1", kind: "frame", at: 11.4, title: "Create button, top right", quote: "click the Create button up in the top right", highlight: "Create button", thumb: <ProjectsFrame cursor={[139, 20]} /> },
  { id: "f2", kind: "frame", at: 14.1, end: 16.6, title: "New project dialog opens", thumb: [<ProjectsFrame key="a" dialog />, <ProjectsFrame key="b" dialog cursor={[96, 50]} />] },
];

const ANSWER: CitedSegment[] = [
  { text: "Trim the filler at the start: you say “um” and “uh” before the page has even loaded. ", cite: ["t1"] },
  { text: "Then zoom in on the Create button as you click it, ", cite: ["c1", "n2"] },
  { text: "since it is a small dark button in the top right corner and hard to read on a phone.", cite: ["f1"] },
  { text: "Ease the zoom back out once the new project dialog opens, so the whole form is in view.", cite: ["f2"], paragraph: true },
];

/** The answer as it would be after `n` words have streamed in. A segment cites once it's complete. */
function upTo(n: number): CitedSegment[] {
  const out: CitedSegment[] = [];
  let left = n;
  for (const seg of ANSWER) {
    if (left <= 0) break;
    const words = seg.text.match(/\S+\s*/g) ?? [];
    if (words.length <= left) out.push(seg);
    else out.push({ text: words.slice(0, left).join(""), paragraph: seg.paragraph });
    left -= words.length;
  }
  return out;
}
const TOTAL = ANSWER.reduce((sum, s) => sum + (s.text.match(/\S+/g)?.length ?? 0), 0);

function Demo() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= TOTAL) return;
    const t = window.setTimeout(() => setN((x) => Math.min(TOTAL, x + 2)), n === 0 ? 700 : 110);
    return () => window.clearTimeout(t);
  }, [n]);
  const click = (selector: string) => root.current?.querySelector<HTMLButtonElement>(selector)?.click();
  const root = useScript([
    { at: 6400, run: () => click("[aria-label^='Note 2']") },
    { at: 8400, run: () => click("[role='toolbar'] [aria-label^='Moment 2']") },
    { at: 10600, run: () => click("[role='toolbar'] [aria-label^='Moment 2']") },
  ]);
  return (
    <div ref={root}>
      <DemoPanel width={420}>
        <UserSays>What should change in the first fifteen seconds?</UserSays>
        <AgentSays>
          <CitedAnswer
            segments={upTo(n)}
            moments={MOMENTS}
            streaming={n < TOTAL}
            onSeek={() => {}}
            action={{ label: "Apply as edits", onClick: () => {} }}
          />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "cited-answer",
  name: "CitedAnswer",
  layer: "Organisms",
  category: "Chat",
  order: 70,
  isNew: true,
  description: "An agent answer wired to the moments in the recording it rests on: frames, narration, clicks and your notes. Point at a citation to light its sentence and its chip; click to unfold the frames and the quoted narration with the matching words marked.",
  demo: () => <Demo />,
  usage: `import { CitedAnswer } from "@/ui/organisms/cited-answer";

<CitedAnswer
  moments={[
    { id: "t1", kind: "transcript", at: 0, end: 4.2, title: "Opening narration",
      quote: "So, um, this is the Projects page…", highlight: ["um", "uh"] },
    { id: "c1", kind: "click", at: 11.2, title: "Click on Create", thumb: [frameAt(10.4), frameAt(10.9), frameAt(11.2)] },
    { id: "n2", kind: "note", pin: 2, at: 12, title: note.text, quote: note.text, highlight: "too small" },
  ]}
  segments={[
    { text: "Trim the filler at the start. ", cite: ["t1"] },
    { text: "Then zoom in on the Create button as you click it.", cite: ["c1", "n2"] },
  ]}
  streaming={!done}
  onSeek={(t) => editor.seek(t)}
  action={{ label: "Apply as edits", onClick: () => agent.applyAnswer(answerId) }}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/cited-answer/index.tsx",
  props: [
    { name: "segments", type: "CitedSegment[]", description: "{ text, cite?, paragraph? } in order. cite lists moment ids, one marker each after the text; paragraph starts a new paragraph. While streaming, only append." },
    { name: "moments", type: "Moment[]", description: "{ id, at, end?, title, kind, quote?, highlight?, thumb?, pin? }. kind is \"frame\", \"transcript\", \"note\" or \"click\"; one chip each, in this order." },
    { name: "streaming", type: "boolean = false", description: "More text is coming: words rise in, markers pop in after their sentence, a cell pulses at the end, the action waits." },
    { name: "title", type: "ReactNode = \"From your recording\"", description: "Tray title." },
    { name: "meta", type: "ReactNode", description: "Right of the tray title." },
    { name: "defaultOpen", type: "string", description: "Id of the moment whose preview is open at first." },
    { name: "onPreviewChange", type: "(id | null) => void", description: "A preview opened, switched or closed." },
    { name: "onSeek", type: "(t, moment) => void", description: "Shows \"Go to 0:12\" in the preview." },
    { name: "action", type: "{ label, onClick }", description: "One action on the tray, e.g. Apply as edits. Disabled while streaming." },
    { name: "className", type: "string", description: "Extra class on the tray." },
  ],
  composedOf: ["Tray", "TrayCard", "TrayRow", "NotePin", "Fold", "Swap", "Shimmer", "Cell", "Key", "Timecode"],
  whenToUse: [
    "Agent answers about the recording where each claim should point at the moment it comes from: a frame, the narration, a click, one of your notes.",
    "Explaining why the agent made or suggests an edit, so people can check the moment before they apply it.",
    "Use note moments for anything that came from your own notes; they show the ink pin instead of a time.",
  ],
  whenNot: [
    "Plain replies that don't rest on specific moments: use the agent's text in the thread.",
    "Reporting edits the agent made: use the steps in the thread, with Undo.",
    "More than about six moments: the chips stop being scannable; split the answer.",
  ],
  keyboard: [
    ["Tab", "Through the markers in reading order, the preview's Go to key, the chips (one stop) and the action."],
    ["Space ↵", "Open or close the preview of a marker or chip."],
    ["← → Home End", "Move between the chips."],
    ["Esc", "Close the preview and return focus to the marker or chip that opened it."],
  ],
  a11y: [
    "Markers and chips are buttons named like \"Note 2: zoom here, it's too small, 0:12\", with aria-expanded and aria-controls pointing at the preview.",
    "Focusing a marker or chip lights the same sentences and chip as pointing at it.",
    "The preview is a named section; folded, it is inert.",
    "The answer is aria-busy while it streams, so it's read once complete; the tray line is a polite live region.",
  ],
  motion: [
    "Streaming: words rise out of a 3px blur 40ms apart (at most eight in a row), markers pop in just after their sentence, and a cell pulses where the text grows.",
    "Pointing at a marker tints its sentence and lights its chip; pointing at a chip tints every sentence citing it and steps the rest back to 38%.",
    "The preview unfolds under the answer on the drawer curve; switching moments blurs the old one out while the new one rises in, and the height glides between them.",
    "The tray line crossfades: from \"Answering from 5 moments\" to the count, and to the open moment's title.",
    "Chips rise in one after another when the answer starts streaming.",
    "Reduced motion: nothing moves; words, markers and previews appear at once, the tray line swaps with a plain fade and the cell stands still.",
  ],
};
