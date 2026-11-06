/**
 * ChatComposer: where you tell the agent what to change. A standalone,
 * controlled composer for places outside the agent thread (the thread keeps
 * its own AgentComposer).
 *
 * A dock card holding a well you type in. Above it, attachments blur in as
 * chips: a frame or a region at a timecode, one of your notes with its ink pin,
 * a file. Below it, one row: "+" to attach, the model, the microphone and Send.
 *
 * Dictation: the microphone is live the way the annotation dock's voice note
 * is: its glyph turns rec and the Meter runs beside the controls. Heard words
 * appear muted in the well and turn to full text once they're confirmed.
 * Pressing the microphone again keeps the words; Esc throws them away. While
 * the agent runs, Send becomes Stop.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Image, Mic, Paperclip, Plus, Square, SquareDashed, StickyNote, X } from "lucide-react";
import { Fold, IconKey, Key, Meter, Swap } from "@/ui/atoms";
import { Tooltip } from "@/ui/base/tooltip/tooltip";
import { ModelPicker, CLAUDE_MODELS } from "@/ui/molecules/model-picker";
import type { Effort, EffortOption, Harness, PickerModel } from "@/ui/molecules/model-picker";
import { NotePin } from "@/ui/organisms/agent";
import { formatTime } from "@/editor/model";
import { blurIn } from "@/ui/tokens/motion";
import { useCtaRole } from "@/ui/cta";
import styles from "./chat-composer.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type AttachKind = "frame" | "region" | "note" | "file";

export interface ComposerAttachment {
  id: string;
  kind: AttachKind;
  /** Position in the recording, in seconds. Frames, regions and notes. */
  at?: number;
  /** A note's text or a file's name. */
  label?: string;
  /** A note's pin number. */
  index?: number;
  /** A CSS background for a frame swatch. */
  thumb?: string;
}

export interface ComposerSendDetails {
  attachments: ComposerAttachment[];
  model: string;
  effort: Effort;
}

/** Words heard so far: `final` is confirmed, `interim` may still change. */
export interface Transcript { final: string; interim: string }

export interface ChatComposerProps {
  /** The text (controlled). */
  value?: string;
  /** Starting text when uncontrolled. */
  defaultValue?: string;
  /** Called with the new text. */
  onChange?: (text: string) => void;
  /** Called on Send or Enter, with the text and what rides along. The field and the attachments clear after. */
  onSend?: (text: string, details: ComposerSendDetails) => void;
  /** The agent is working: Send turns into Stop. */
  running?: boolean;
  /** Called when Stop is pressed. */
  onStop?: () => void;
  /** Attachments (controlled). */
  attachments?: ComposerAttachment[];
  /** Starting attachments when uncontrolled. */
  defaultAttachments?: ComposerAttachment[];
  /** Called with the new list when one is added or removed. */
  onAttachmentsChange?: (attachments: ComposerAttachment[]) => void;
  /** Called when an item in the "+" menu is picked. Return an attachment to add it. Without this, frames and regions are added at `playhead`. */
  onAttach?: (kind: AttachKind) => ComposerAttachment | null | void;
  /** The playhead, in seconds. The "+" menu offers the frame there. */
  playhead?: number;
  /** Harnesses for the picker's left segment, e.g. Claude Code and Codex. Leave out for the model key alone. */
  harnesses?: Harness[];
  /** Chosen harness (controlled). */
  harness?: string;
  /** Called with the picked harness's id. */
  onHarnessChange?: (id: string) => void;
  /** Models for the picker. Default: the current Claude models. */
  models?: PickerModel[];
  /** Chosen model (controlled). */
  model?: string;
  /** Chosen model when uncontrolled. */
  defaultModel?: string;
  /** Called with the picked model's id. */
  onModelChange?: (id: string) => void;
  /** Dictation on (controlled). Without `transcript`, a simulated take of `dictation` plays word by word. */
  listening?: boolean;
  /** Called when dictation starts or stops. */
  onListeningChange?: (listening: boolean) => void;
  /** Words from your speech recognizer while listening. Stopping keeps them; Esc drops them. */
  transcript?: Transcript;
  /** The sentence a simulated take plays when `transcript` isn't given. */
  dictation?: string;
  /** Placeholder of the field. */
  placeholder?: string;
  /** Thinking effort, when the host controls it; one of `efforts`. */
  effort?: Effort;
  onEffortChange?: (effort: Effort) => void;
  /** The effort levels to offer in the model picker, lowest first. Empty hides the effort. */
  efforts?: EffortOption[];
  /** Offer dictation. Off until real speech-to-text is wired, so it never simulates words. */
  voice?: boolean;
  /** Small things in the control row before the model picker, e.g. context usage. */
  meta?: ReactNode;
  /**
   * Let macOS put text in the field: dictation, the emoji picker, Writing Tools,
   * autocorrect and spell check. Off means only the keyboard, paste and drop write here.
   */
  systemInput?: boolean;
  className?: string;
}

/** Inserts the keyboard, paste and drop make. Anything else that inserts with no key pressed came from the OS. */
const KEYLESS_OK = /^insert(?:FromPaste|FromDrop|FromYank|LineBreak|Paragraph)/;
/** Typed text, an input method's included, lands within this long of a key press. */
const KEY_WINDOW_MS = 1000;
/** Turns off the text help WebKit offers on a field: corrections, spell check, inline predictions. */
const NO_SYSTEM_TEXT = { spellCheck: false, autoCorrect: "off", autoCapitalize: "off", autoComplete: "off", writingsuggestions: "false" };

const MENU: { kind: AttachKind; label: string; icon: ReactNode }[] = [
  { kind: "frame", label: "Frame at playhead", icon: <Image /> },
  { kind: "region", label: "Region on frame", icon: <SquareDashed /> },
  { kind: "note", label: "Note", icon: <StickyNote /> },
  { kind: "file", label: "File…", icon: <Paperclip /> },
];

const WORD_MS = 240;
const join = (a: string, b: string) => (a && b ? `${a.replace(/\s+$/, "")} ${b.trim()}` : a || b.trim());
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

function Chip({ item, onRemove }: { item: ComposerAttachment; onRemove: () => void }) {
  const time = item.at !== undefined ? formatTime(item.at) : null;
  const name = item.kind === "frame" ? "Frame" : item.kind === "region" ? "Region" : item.label ?? (item.kind === "note" ? "Note" : "File");
  return (
    <>
      {item.kind === "note" ? <NotePin index={item.index ?? 1} />
        : item.thumb ? <span className={styles.thumb} style={{ "--thumb": item.thumb } as CSSProperties} aria-hidden />
        : <span className={styles.chipIcon} aria-hidden>{item.kind === "region" ? <SquareDashed /> : item.kind === "frame" ? <Image /> : <Paperclip />}</span>}
      <span className={styles.chipLabel}>{name}</span>
      {time && item.kind !== "note" && <span className={styles.time}>{time}</span>}
      <button type="button" className={styles.chipRemove} aria-label={`Remove ${name}${time ? ` at ${time}` : ""}`} onClick={onRemove}><X aria-hidden /></button>
    </>
  );
}

export function ChatComposer({
  value, defaultValue = "", onChange, onSend, running = false, onStop,
  attachments, defaultAttachments = [], onAttachmentsChange, onAttach, playhead = 0,
  harnesses, harness, onHarnessChange,
  models = CLAUDE_MODELS, model, defaultModel, onModelChange,
  listening, onListeningChange, transcript, dictation = "Cut the pause before the share dialog and zoom on the invite link",
  placeholder = "Describe an edit, or ask about the recording…", className,
  effort: effortProp, onEffortChange, efforts, voice = true, meta, systemInput = true,
}: ChatComposerProps) {
  const reduce = useReducedMotion();
  const field = useRef<HTMLTextAreaElement>(null);

  const [textState, setTextState] = useState(defaultValue);
  const text = value ?? textState;
  const textRef = useRef(text);
  textRef.current = text;
  const setText = (next: string) => { if (value === undefined) setTextState(next); onChange?.(next); };

  const [attachState, setAttachState] = useState(defaultAttachments);
  const items = attachments ?? attachState;
  const setItems = (next: ComposerAttachment[]) => { if (attachments === undefined) setAttachState(next); onAttachmentsChange?.(next); };

  const [modelState, setModelState] = useState(() => defaultModel ?? models[0]?.id ?? "");
  // Effort follows the host when it controls it (the app passes the CLI's choice).
  const [effortState, setEffortState] = useState<Effort>("medium");
  const effort = effortProp ?? effortState;
  const setEffort = (e: Effort) => { if (effortProp === undefined) setEffortState(e); onEffortChange?.(e); };

  const [status, setStatus] = useState("");
  const announce = (s: string) => setStatus((old) => (old === s ? `${s} ` : s));

  /* Dictation */
  const [listenState, setListenState] = useState(false);
  const isListening = listening ?? listenState;
  const setListening = (on: boolean) => { if (listening === undefined) setListenState(on); onListeningChange?.(on); };
  const take = words(dictation);
  const [heard, setHeard] = useState(0);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!isListening || transcript || heard >= take.length) return;
    const t = window.setTimeout(() => setHeard((h) => h + 1), heard === 0 ? 500 : WORD_MS);
    return () => window.clearTimeout(t);
  }, [isListening, transcript, heard, take.length]);
  // The simulated take confirms its last words a moment after the speaker stops.
  useEffect(() => {
    if (!isListening || transcript || heard < take.length || !take.length) return;
    const t = window.setTimeout(() => setSettled(true), 600);
    return () => window.clearTimeout(t);
  }, [isListening, transcript, heard, take.length]);
  const confirmed = settled ? heard : Math.max(0, heard - 2);
  const finalWords = transcript ? words(transcript.final) : take.slice(0, confirmed);
  const interimWords = transcript ? words(transcript.interim) : take.slice(confirmed, heard);
  const heardText = [...finalWords, ...interimWords].join(" ");
  const heardRef = useRef(heardText);
  heardRef.current = heardText;

  // Leaving dictation keeps what was heard, unless it was discarded.
  const discarded = useRef(false);
  const wasListening = useRef(isListening);
  useEffect(() => {
    if (wasListening.current && !isListening) {
      if (!discarded.current && heardRef.current) {
        const next = join(textRef.current, heardRef.current);
        if (value === undefined) setTextState(next);
        onChange?.(next);
      }
      discarded.current = false;
      setHeard(0);
      setSettled(false);
      field.current?.focus();
    }
    wasListening.current = isListening;
    // Runs on the listening edge only; the callbacks are read fresh at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]);

  const toggleListening = () => {
    if (isListening) { setListening(false); announce("Added what you said"); }
    else { discarded.current = false; setHeard(0); setSettled(false); setListening(true); announce("Listening"); }
  };
  const discard = () => { discarded.current = true; setListening(false); announce("Dictation discarded"); };

  /* Autosize: the well grows with the text up to six lines, then scrolls. */
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.setProperty("--field-h", "auto");
    el.style.setProperty("--field-h", `${Math.min(el.scrollHeight, 160)}px`);
  }, [text, isListening]);

  /* Attach */
  const attach = (kind: AttachKind) => {
    const made = onAttach ? onAttach(kind) : kind === "frame" || kind === "region" ? { id: `${kind}-${Date.now()}`, kind, at: playhead } : null;
    if (made) { setItems([...items, made]); announce(`Attached ${kind === "frame" ? "the frame" : kind === "region" ? "a region" : kind === "note" ? "a note" : "a file"}`); }
    requestAnimationFrame(() => field.current?.focus());
  };
  const remove = (id: string) => { setItems(items.filter((a) => a.id !== id)); field.current?.focus(); };

  /* Send */
  const canSend = !running && !isListening && (text.trim().length > 0 || items.length > 0);
  // Send competes for the panel's primary: a decision waiting elsewhere on the panel outranks it.
  const sendRole = useCtaRole("run", canSend);
  const send = () => {
    if (!canSend) return;
    onSend?.(text.trim(), { attachments: items, model: model ?? modelState, effort });
    setText("");
    setItems([]);
    announce("Sent");
  };
  // OS dictation, the emoji picker and Writing Tools insert text without a key
  // press; with systemInput off that text is dropped and the field keeps its value.
  const lastKey = useRef(0);
  const onFieldChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const kind = (e.nativeEvent as InputEvent).inputType ?? "";
    if (!systemInput && kind.startsWith("insert") && !KEYLESS_OK.test(kind) && performance.now() - lastKey.current > KEY_WINDOW_MS) return;
    setText(e.target.value);
  };
  const onFieldKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    lastKey.current = performance.now();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
  };
  const onRootKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isListening) { e.preventDefault(); e.stopPropagation(); discard(); }
  };
  // Pressing the card anywhere that isn't a control puts the caret in the field.
  const onCardDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input, textarea, a, [role=menu], [role=dialog]")) return;
    e.preventDefault();
    field.current?.focus();
  };

  const chipMotion = reduce ? { initial: false as const, transition: { duration: 0 } } : blurIn;

  return (
    <div className={cx(styles.composer, className)} data-listening={isListening || undefined} onKeyDown={onRootKey} onMouseDown={onCardDown}>
      <span className="visually-hidden" role="status" aria-live="polite">{status}</span>

      <Fold open={items.length > 0}>
        <ul className={styles.chips} aria-label="Attachments">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((a) => (
              <motion.li key={a.id} layout className={styles.chip} {...chipMotion}>
                <Chip item={a} onRemove={() => remove(a.id)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Fold>

      <div className={styles.well}>
        {isListening ? (
          <p className={styles.heard}>
            {text && <span>{text} </span>}
            {finalWords.map((w, i) => <span key={i} className={styles.word} data-final="">{w} </span>)}
            {interimWords.map((w, i) => <span key={finalWords.length + i} className={styles.word}>{w} </span>)}
            {!text && !heardText && <span className={styles.listeningHint}>Listening…</span>}
          </p>
        ) : (
          <textarea ref={field} className={styles.field} rows={1} value={text} placeholder={placeholder} aria-label="Message to the agent"
            {...(systemInput ? {} : NO_SYSTEM_TEXT)} onChange={onFieldChange} onKeyDown={onFieldKey} />
        )}
      </div>

      <div className={styles.row}>
        <Menu.Root modal={false}>
          <Tooltip content="Attach" side="top">
            <Menu.Trigger asChild>
              <Key variant="tertiary" data-icon-only="" aria-label="Attach" className={styles.plus} disabled={isListening}><Plus /></Key>
            </Menu.Trigger>
          </Tooltip>
          <Menu.Portal>
            <Menu.Content className={styles.menu} side="top" align="start" sideOffset={6} collisionPadding={8}>
              {MENU.map((m) => (
                <Menu.Item key={m.kind} className={styles.item} onSelect={() => attach(m.kind)}>
                  <span className={styles.itemIcon} aria-hidden>{m.icon}</span>
                  <span className={styles.itemLabel}>{m.label}</span>
                  {m.kind === "frame" && <span className={styles.time}>{formatTime(playhead)}</span>}
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>

        <span className={styles.middle}>
          <Swap id={isListening ? "level" : "idle"} inline className={styles.middleSwap}>
            {isListening ? <><span className={styles.level}><Meter bars={16} /></span><span className={styles.escHint}>Esc to discard</span></> : null}
          </Swap>
        </span>

        {meta}
        <ModelPicker harnesses={harnesses} harness={harness} onHarnessChange={onHarnessChange}
          models={models} value={model ?? modelState} side="top" align="end"
          onChange={(id) => { setModelState(id); onModelChange?.(id); }}
          effort={effort} onEffortChange={setEffort} efforts={efforts} />

        {voice && (
          <IconKey label={isListening ? "Keep what you said" : "Dictate"} tooltip="top" variant="tertiary"
            pressed={isListening} className={styles.mic} data-listening={isListening || undefined} onClick={toggleListening}>
            <Mic />
          </IconKey>
        )}

        <IconKey label={running ? "Stop" : "Send"} shortcut={running ? undefined : "↵"} tooltip="top" variant={isListening ? "secondary" : running ? "primary" : sendRole}
          className={styles.send} disabled={!running && !canSend} onClick={running ? onStop : send}>
          <Swap id={running ? "stop" : "send"}>{running ? <Square className={styles.stopGlyph} /> : <ArrowUp />}</Swap>
        </IconKey>
      </div>
    </div>
  );
}
