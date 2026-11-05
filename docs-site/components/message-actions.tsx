import { useRef, useState } from "react";
import { MessageActions, MessageText } from "@/ui/molecules/message-actions";
import src from "@/ui/molecules/message-actions/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

const VERSIONS = [
  "Zoomed to 1.8× on the Create button from 0:11 to 0:16, and cut 4.5s of dead air before the share dialog.",
  "Zoomed to 1.6× on the Create button for the click at 0:13, easing in over half a second. Cut the pause at 0:58 so the share dialog opens right after the click, and slowed the click itself to 0.8× so it reads.",
  "Held a gentle 1.4× zoom on the toolbar from 0:10 to 0:17 instead of punching in on the button. Cut 3.9s before the share dialog.",
];

function Demo() {
  const [versions, setVersions] = useState(VERSIONS.slice(0, 1));
  const [version, setVersion] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const count = useRef(versions.length);
  count.current = versions.length;
  const writing = useRef(0);
  const playing = useRef(0);

  // A new version arrives 1.6s after Regenerate; the switcher jumps to it.
  const regenerate = () => {
    setRegenerating(true);
    window.clearTimeout(writing.current);
    writing.current = window.setTimeout(() => {
      const n = count.current;
      setVersions((v) => [...v, VERSIONS[v.length % VERSIONS.length]!]);
      setVersion(n);
      setRegenerating(false);
    }, 1600);
  };
  // The changed range is 3.4s long.
  const preview = (on: boolean) => {
    setPreviewing(on);
    window.clearTimeout(playing.current);
    if (on) playing.current = window.setTimeout(() => setPreviewing(false), 3400);
  };

  const root = useScript([
    { at: 1200, run: regenerate },
    { at: 4400, run: () => setVersion(0) },
    { at: 5800, run: () => setVersion(1) },
    { at: 7000, run: () => preview(true) },
  ]);

  return (
    <div ref={root}>
      <DemoPanel>
        <UserSays>Zoom on the Create button and cut the dead air before the share dialog.</UserSays>
        <AgentSays>
          <MessageText version={version}>
            <p style={{ margin: 0, fontSize: "var(--text-base)", lineHeight: 1.55 }}>{versions[version]}</p>
          </MessageText>
          <MessageActions text={versions[version]} versions={versions} version={version} onVersionChange={setVersion}
            onRegenerate={regenerate} regenerating={regenerating} previewing={previewing} onPreview={preview}
            onFeedback={(vote, reason) => setHeard(reason ? `Sent: ${reason}` : vote ? `Voted ${vote}` : null)} />
          {heard && <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>{heard}</span>}
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "message-actions",
  name: "MessageActions",
  layer: "Molecules",
  category: "Chat",
  order: 40,
  isNew: true,
  description: "The quiet bar under an agent message: copy it, ask for another version and flip between versions, rate the edit with a reason, and preview the stretch of the recording it changed. MessageText crossfades the message between versions while its height eases.",
  demo: () => <Demo />,
  usage: `import { MessageActions, MessageText } from "@/ui/molecules/message-actions";

<MessageText version={version}>
  <p>{versions[version]}</p>
</MessageText>
<MessageActions
  text={versions[version]}
  versions={versions}
  version={version}
  onVersionChange={setVersion}
  onRegenerate={() => agent.retry(turnId)}
  regenerating={agent.isRunning}
  onFeedback={(vote, reason) => log.feedback(turnId, vote, reason)}
  onPreview={(on) => (on ? player.playRange(11.2, 16.6) : player.pause())}
  previewing={player.playingRange}
/>`,
  source: src,
  sourcePath: "src/ui/molecules/message-actions/index.tsx",
  props: [
    { name: "text", type: "string", description: "The message text. Copy writes it to the clipboard." },
    { name: "actions", type: "(\"copy\" | \"regenerate\" | \"feedback\" | \"preview\")[]", description: "Which actions to show, in this order. feedback is the two thumbs. Default: all four." },
    { name: "versions", type: "number | string[]", description: "All versions, or how many there are. From two on, the \"‹ 2 / 3 ›\" switcher unfolds next to Regenerate." },
    { name: "version", type: "number", description: "Controlled version, 0-based." },
    { name: "defaultVersion", type: "number", description: "Starting version when uncontrolled; the newest by default. Uncontrolled, the switcher jumps to each new version." },
    { name: "onVersionChange", type: "(index: number) => void", description: "Called with the version picked in the switcher." },
    { name: "onCopy", type: "(text?: string) => void", description: "Called after Copy, with text." },
    { name: "onRegenerate", type: "() => void", description: "Called when Regenerate is pressed. Add a version to versions and the switcher shows it." },
    { name: "regenerating", type: "boolean = false", description: "Keeps the arrow turning while a new version is written. Presses are ignored meanwhile." },
    { name: "onFeedback", type: "(vote: \"up\" | \"down\" | null, reason?: string) => void", description: "The vote right away, null when taken back, and \"down\" once more with a reason when the row is sent. A new version starts without a vote." },
    { name: "reasons", type: "string[]", description: "Quick reasons. Default: Wrong moment, Too much zoom, Didn't follow my note, Other. \"Other\" unfolds a field." },
    { name: "onPreview", type: "(playing: boolean) => void", description: "Called with true when the preview starts and false when it stops." },
    { name: "previewing", type: "boolean", description: "Controlled playing state; tie it to the player. Without it the preview stops itself after previewMs." },
    { name: "previewMs", type: "number = 3200", description: "How long an uncontrolled preview plays: the length of the changed range." },
    { name: "label", type: "string = \"Message actions\"", description: "Accessible name of the bar." },
    { name: "MessageText · version", type: "string | number", description: "Which version shows. A new value crossfades to the new children." },
    { name: "MessageText · children", type: "ReactNode", description: "The text of that version." },
  ],
  composedOf: ["IconKey (tertiary, sm)", "RollNumber", "Meter", "Fold", "Swap", "DrawCheck", "Key (primary, in the feedback row)"],
  whenToUse: [
    "Under every finished agent message that describes an edit: copy it, try again, rate it, play the change.",
    "Wherever the agent can answer more than once and people should flip between the versions it wrote.",
    "When you collect feedback on edits and want a reason, not only a thumb.",
  ],
  whenNot: [
    "Under your own messages: editing and deleting fit there better than regenerating and rating.",
    "While the message is still streaming: show the composer's Stop key and bring the bar in once it's done.",
    "Undoing a single edit: use the Undo on its step in AgentThread or the ToolCall it came from.",
  ],
  keyboard: [
    ["Tab", "Moves through the actions, the version arrows and, when it is open, the reasons, the field and Send."],
    ["↵ Space", "Presses an action, picks or drops a reason, sends."],
    ["↵", "In the Other field: sends."],
    ["Esc", "Closes the feedback row and puts focus back on the thumbs down."],
  ],
  a11y: [
    "Each action is a button with its own name. The thumbs and Preview are toggle buttons with aria-pressed; thumbs down has aria-expanded for the feedback row.",
    "Tooltips repeat the names on hover and keyboard focus.",
    "Copied, the version you switched to, Preview, and Thanks are announced through a polite live region. The count reads \"Version 2 of 3\".",
    "The version arrows are disabled at either end. The folded feedback row and the hidden switcher are inert.",
  ],
  motion: [
    "Copy: the sheets blur away as a check grows in and draws itself; it turns back after 1.6s.",
    "Regenerate spins once per press (640ms) and turns steadily while regenerating.",
    "The version switcher unfolds sideways on grid columns; the current number rolls up or down with the direction you moved.",
    "MessageText crossfades: the old text blurs out in 260ms while the new one sharpens in over 420ms, and the block eases to its new height on the glide curve.",
    "A vote fills the thumb and pops once (the pop curve, one small overshoot). The feedback row folds open under the bar, swaps to Thanks with a drawn check, and folds away after 1.5s.",
    "Preview: the play glyph blurs into four level bars that move while the range plays.",
    "Reduced motion: icons and numbers switch in place, nothing spins or pops, and the bars stand still.",
  ],
};
