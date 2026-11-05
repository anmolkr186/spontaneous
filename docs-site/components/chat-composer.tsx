import { useRef, useState } from "react";
import { ChatComposer } from "@/ui/organisms/chat-composer";
import type { AttachKind, ComposerAttachment } from "@/ui/organisms/chat-composer";
import src from "@/ui/organisms/chat-composer/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

const PLAYHEAD = 12.4;
const FRAME = "linear-gradient(180deg, #2a2d34 0 22%, #1b1d22 22% 100%)";
const NOTE: ComposerAttachment = { id: "note-1", kind: "note", index: 1, at: 12.4, label: "Zoom on the Create button" };

interface Said { id: number; text: string; reply?: string }

function Demo() {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [listening, setListening] = useState(false);
  const [running, setRunning] = useState(false);
  const [said, setSaid] = useState<Said[]>([]);
  const reply = useRef(0);

  const make = (kind: AttachKind): ComposerAttachment | null => {
    const id = `${kind}-${Date.now()}`;
    if (kind === "frame") return { id, kind, at: PLAYHEAD, thumb: FRAME };
    if (kind === "region") return { id, kind, at: PLAYHEAD };
    if (kind === "note") return { ...NOTE, id };
    return { id, kind, label: "cursor-path.json" };
  };
  const send = (message: string) => {
    const id = Date.now();
    setSaid((s) => [...s, { id, text: message || "Use these" }]);
    setText("");
    setAttachments([]);
    setRunning(true);
    window.clearTimeout(reply.current);
    reply.current = window.setTimeout(() => {
      setRunning(false);
      setSaid((s) => s.map((m) => (m.id === id ? { ...m, reply: "Cut 0:58–1:02 and zoomed 1.6× on the invite link from 1:04 to 1:09." } : m)));
    }, 2600);
  };

  // The script sends whatever the dictation left in the field.
  const textNow = useRef(text);
  textNow.current = text;
  const root = useScript([
    { at: 600, run: () => setAttachments([make("frame")!]) },
    { at: 1300, run: () => setAttachments((a) => [...a, NOTE]) },
    { at: 2300, run: () => setListening(true) },
    { at: 7600, run: () => setListening(false) },
    { at: 8900, run: () => send(textNow.current) },
  ]);

  return (
    <div ref={root}>
      <DemoPanel>
        {said.map((m) => (
          <div key={m.id} style={{ display: "contents" }}>
            <UserSays>{m.text}</UserSays>
            <AgentSays status={m.reply ? undefined : "Working"}>{m.reply && <p style={{ margin: 0, fontSize: "var(--text-base)", lineHeight: 1.55 }}>{m.reply}</p>}</AgentSays>
          </div>
        ))}
        <ChatComposer value={text} onChange={setText} attachments={attachments} onAttachmentsChange={setAttachments}
          onAttach={make} playhead={PLAYHEAD} listening={listening} onListeningChange={setListening}
          running={running} onStop={() => { window.clearTimeout(reply.current); setRunning(false); }}
          onSend={(message) => send(message)} />
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "chat-composer",
  name: "ChatComposer",
  layer: "Organisms",
  category: "Chat",
  order: 50,
  isNew: true,
  description: "Where you tell the agent what to change: a field that grows with the text, frames, regions and notes attached as chips, the model, dictation and Send. A standalone controlled composer for places outside the agent thread, which keeps its own AgentComposer.",
  demo: () => <Demo />,
  usage: `import { ChatComposer } from "@/ui/organisms/chat-composer";

<ChatComposer
  value={draft}
  onChange={setDraft}
  attachments={attachments}
  onAttachmentsChange={setAttachments}
  playhead={player.time}
  onAttach={(kind) => (kind === "note" ? noteAttachment(selectedNote) : kind === "file" ? openFilePicker() : null)}
  listening={speech.listening}
  onListeningChange={speech.toggle}
  transcript={{ final: speech.final, interim: speech.interim }}
  running={agent.isRunning}
  onStop={agent.cancel}
  onSend={(text, { attachments, model, thinking, effort }) => agent.run({ text, attachments, model, thinking, effort })}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/chat-composer/index.tsx",
  props: [
    { name: "value / defaultValue / onChange", type: "string / string / (text) => void", description: "The text, controlled or not." },
    { name: "onSend", type: "(text, { attachments, model, thinking, effort }) => void", description: "Called on Send or Enter. The field and the attachments clear after." },
    { name: "running", type: "boolean = false", description: "The agent is working: Send turns into Stop." },
    { name: "onStop", type: "() => void", description: "Called when Stop is pressed." },
    { name: "attachments / defaultAttachments / onAttachmentsChange", type: "ComposerAttachment[] / … / (list) => void", description: "{ id, kind, at?, label?, index?, thumb? } where kind is frame, region, note or file. Controlled or not." },
    { name: "onAttach", type: "(kind) => ComposerAttachment | null | void", description: "Called when an item in the \"+\" menu is picked; return an attachment to add it. Without it, frames and regions are added at the playhead." },
    { name: "playhead", type: "number = 0", description: "The playhead in seconds. The menu offers the frame there." },
    { name: "models / model / defaultModel / onModelChange", type: "PickerModel[] / string / string / (id) => void", description: "Passed to the ModelPicker in the row. Thinking and effort are kept inside and handed to onSend." },
    { name: "listening / onListeningChange", type: "boolean / (on) => void", description: "Dictation on, controlled or not. Stopping keeps the words; Esc drops them." },
    { name: "transcript", type: "{ final: string; interim: string }", description: "Words from your speech recognizer while listening. Without it, a simulated take of dictation plays word by word." },
    { name: "dictation", type: "string", description: "The sentence a simulated take plays." },
    { name: "placeholder", type: "string", description: "Default: \"Describe an edit, or ask about the recording…\"." },
  ],
  composedOf: ["ModelPicker", "NotePin", "IconKey", "Key", "Meter", "Fold", "Swap", "Tooltip", "Dock and well materials"],
  whenToUse: [
    "An input for the agent outside the thread runtime: a floating ask bar over the stage, a review screen, an onboarding prompt.",
    "When the request should carry context from the recording: the frame at the playhead, a region on it, one of your notes.",
    "When people want to talk through an edit instead of typing it.",
  ],
  whenNot: [
    "Inside AgentThread: it has its own AgentComposer, wired to the thread runtime's send and cancel.",
    "A note on a frame: use the annotation dock, which pins the note where you drew it.",
    "A single setting or a yes/no answer to the agent: use the ask card's options.",
  ],
  keyboard: [
    ["↵", "Sends the message."],
    ["⇧ ↵", "New line. The field grows to six lines, then scrolls."],
    ["Esc", "While dictating: throws away what was heard and stops listening."],
    ["↑ ↓", "On the model key: opens the model list."],
    ["↑ ↓ ↵", "In the \"+\" menu: moves and picks."],
  ],
  a11y: [
    "Listening, Added what you said, Dictation discarded, attachments added and Sent are announced through a polite live region.",
    "The microphone is a toggle button with aria-pressed; its name says what pressing it does next (Dictate, Keep what you said).",
    "Each chip has a remove button named for it (\"Remove Frame at 0:12\"). The empty attachment row is inert.",
    "Pressing anywhere on the card that isn't a control puts the caret in the field.",
  ],
  motion: [
    "Attachment chips blur in, rising 3px; the others glide aside on layout, and the row unfolds the first time (grid rows, glide curve).",
    "Dictating: the microphone becomes the light face with three calm level bars and a ring that breathes outwards every 2.2s.",
    "Heard words blur in muted and settle into full text once confirmed; a dotted trace scrolls left beside the controls.",
    "Send and Stop swap with a blur; the \"+\" menu grows out of the key's corner and collapses faster than it opened.",
    "Reduced motion: words and chips appear in place, the trace and the ring stand still, the bars hold.",
  ],
};
