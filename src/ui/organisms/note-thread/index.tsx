/**
 * NoteThread: one note on the frame and the conversation under it.
 *
 * The note leads, as you left it: its ink pin, who wrote it, the time it points
 * at, and the words. Under it the agent replies with what it did; a reply's
 * status line ("Added a zoom · 0:11–0:16") is a button that folds open the
 * details as plain rows. Asking the agent again ("@agent make it slower") shows
 * it thinking in place until its answer arrives. The reply field sits in a well
 * at the bottom; Enter sends.
 *
 * The card's height glides as replies arrive and details fold, so the tray
 * never jumps; replies rise out of a small blur.
 */
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ArrowUp, ChevronDown, X } from "lucide-react";
import { Cell, Fold, IconKey, Mark, RollNumber, StatusGlyph, Timecode } from "@/ui/atoms";
import { Tray } from "@/ui/molecules/tray";
import { ThinkingLoader } from "@/ui/molecules/thinking-loader";
import { NotePin } from "@/ui/organisms/agent";
import { formatTime } from "@/editor/model";
import { blurIn, motionTokens } from "@/ui/tokens/motion";
import styles from "./note-thread.module.css";

export interface NoteAuthor {
  name: string;
  /** The agent: signs with the mark and can show a thinking state. */
  agent?: boolean;
}

export interface NoteDetail {
  /** What changed: "Scale", "From". */
  label: string;
  /** Its value. Put times in a Timecode or Duration so they read in the time face. */
  value: ReactNode;
}

export interface NoteThreadMessage {
  id: string;
  author: NoteAuthor;
  text: string;
  /** When it was written. Shown as "just now", "4m", "2h". */
  createdAt?: number | Date;
  /** Agent replies: what it did, as a status line that folds open its details. */
  status?: { label: string; at?: number; end?: number; details?: NoteDetail[] };
}

export interface NoteThreadProps {
  /** The note's pin number, as on the frame. */
  index: number;
  /** The time the note points at, in seconds. */
  at: number;
  /** The thread to start with; the first message is the note itself. New replies are kept inside. */
  messages: NoteThreadMessage[];
  /** Author of new replies. */
  currentUser?: NoteAuthor;
  /** Called with each reply. Return the agent's answer, or a promise of it, to show it thinking first; return nothing to just post. */
  onReply?: (text: string) => NoteThreadMessage | Promise<NoteThreadMessage | void> | void;
  /** What the agent says it is doing while it thinks, in order. */
  thinking?: string[];
  /** The note's time was clicked. */
  onSeek?: (t: number) => void;
  /** Shows a close key in the tray header. */
  onClose?: () => void;
  /** Tray title. Defaults to "Note 2 · 0:12". */
  title?: ReactNode;
  /** Placeholder for the reply field. */
  placeholder?: string;
  className?: string;
}

const THINKING = ["Reading the note", "Looking at the frame", "Changing the edit"];

function ago(time: number, now: number) {
  const s = Math.max(0, Math.round((now - time) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/** Plain text with @mentions set apart by weight, never by hue. */
function withMentions(text: string) {
  return text.split(/(@[\w-]+)/g).map((part, i) => (part.startsWith("@") ? <span key={i} className={styles.mention}>{part}</span> : <Fragment key={i}>{part}</Fragment>));
}

export function NoteThread({
  index,
  at,
  messages: initial,
  currentUser = { name: "You" },
  onReply,
  thinking: phases = THINKING,
  onSeek,
  onClose,
  title,
  placeholder = "Reply, or ask @agent…",
  className,
}: NoteThreadProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const [messages, setMessages] = useState(initial);
  const [first] = useState(() => new Set(initial.map((m) => m.id)));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const list = useRef<HTMLDivElement>(null);
  const height = useAutoHeight(list);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const el = list.current;
    if (el && messages.length > initial.length) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages.length, thinking]);

  const send = async () => {
    const text = draft.trim();
    if (!text || thinking) return;
    setDraft("");
    setNow(Date.now());
    setMessages((m) => [...m, { id: `${id}-${Date.now()}`, author: currentUser, createdAt: Date.now(), text }]);
    const answer = onReply?.(text);
    if (!answer) return;
    if (!("then" in answer)) { setMessages((m) => [...m, { ...answer, createdAt: answer.createdAt ?? Date.now() }]); return; }
    setThinking(true);
    try {
      const reply = await answer;
      if (reply) setMessages((m) => [...m, { ...reply, createdAt: reply.createdAt ?? Date.now() }]);
    } finally {
      setThinking(false);
      setNow(Date.now());
    }
  };

  const toggle = (mid: string) => setOpen((o) => {
    const next = new Set(o);
    if (next.has(mid)) next.delete(mid);
    else next.add(mid);
    return next;
  });

  const replies = messages.length - 1;
  const enter = (m: NoteThreadMessage, i: number) => ({
    ...blurIn,
    // The thread there from the start builds up a beat at a time; new replies arrive at once.
    transition: reduce ? { duration: 0 } : { ...blurIn.transition, duration: 0.32, delay: first.has(m.id) ? Math.min(i, 5) * motionTokens.stagger.row * 2 : 0 },
  });

  return (
    <MotionConfig reducedMotion="user">
      <Tray
        className={[styles.root, className].filter(Boolean).join(" ")}
        aria-label={`Note ${index} at ${formatTime(at)}`}
        title={title ?? <>Note {index} · <Timecode value={at} muted className={styles.titleTime} /></>}
        meta={<>
          {replies > 0 && <span><RollNumber value={replies} /> {replies === 1 ? "reply" : "replies"}</span>}
          {onClose && <IconKey label="Close note" size="sm" tooltip={false} className={styles.close} onClick={onClose}><X /></IconKey>}
        </>}
      >
        <motion.div className={styles.morph} animate={height === undefined ? undefined : { height }} initial={false} transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>
          <div ref={list} className={styles.list} aria-live="polite" aria-relevant="additions">
            <AnimatePresence initial mode="popLayout">
              {messages.map((m, i) => {
                const note = i === 0;
                const details = m.status?.details ?? [];
                const isOpen = open.has(m.id);
                return (
                  <motion.article key={m.id} className={styles.message} data-agent={m.author.agent || undefined} {...enter(m, i)}>
                    <header className={styles.byline}>
                      {note ? <NotePin index={index} /> : m.author.agent ? <Mark size={14} title="" /> : <Cell size={7} variant="muted" />}
                      <span className={styles.name}>{m.author.agent ? m.author.name || "Spontaneous" : m.author.name}</span>
                      {note && (onSeek
                        ? <button type="button" className={styles.time} onClick={() => onSeek(at)} aria-label={`Go to ${formatTime(at)}`}>{formatTime(at)}</button>
                        : <span className={styles.time}>{formatTime(at)}</span>)}
                      {m.createdAt !== undefined && <time className={styles.ago} dateTime={new Date(m.createdAt).toISOString()}>{ago(+m.createdAt, now)}</time>}
                    </header>
                    {m.text && <p className={styles.text}>{withMentions(m.text)}</p>}
                    {m.status && (
                      <div className={styles.status}>
                        {details.length ? (
                          <button type="button" className={styles.statusLine} aria-expanded={isOpen} aria-controls={`${id}-${m.id}`} onClick={() => toggle(m.id)}>
                            <StatusLine status={m.status} />
                            <ChevronDown className={styles.chevron} aria-hidden />
                          </button>
                        ) : (
                          <span className={styles.statusLine}><StatusLine status={m.status} /></span>
                        )}
                        {details.length > 0 && (
                          <Fold open={isOpen} id={`${id}-${m.id}`} className={styles.fold}>
                            <dl className={styles.details}>
                              {details.map((d, k) => (
                                <div key={k} className={styles.row} style={{ "--i": k } as CSSProperties}>
                                  <dt>{d.label}</dt>
                                  <dd>{d.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </Fold>
                        )}
                      </div>
                    )}
                  </motion.article>
                );
              })}
              {thinking && (
                <motion.article key="thinking" className={styles.message} data-agent aria-label="The agent is thinking" {...blurIn} transition={reduce ? { duration: 0 } : blurIn.transition}>
                  <header className={styles.byline}><Mark size={14} title="" /><span className={styles.name}>Spontaneous</span></header>
                  <ThinkingLoader variant="plain" size="sm" phases={phases} interval={1800} className={styles.thinking} />
                </motion.article>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
        <form className={styles.reply} onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input className={styles.input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={`Reply to note ${index}`} />
          <button type="submit" className={styles.send} aria-label="Send reply" disabled={!draft.trim() || thinking}><ArrowUp aria-hidden /></button>
        </form>
      </Tray>
    </MotionConfig>
  );
}

/** "✓ Added a zoom · 0:11–0:16": the check, what it did, and when, in the time face. */
function StatusLine({ status }: { status: NonNullable<NoteThreadMessage["status"]> }) {
  return (
    <>
      <StatusGlyph status="done" size={13} />
      <span className={styles.statusText}>{status.label}</span>
      {status.at !== undefined && (
        <span className={styles.statusTime}>
          {formatTime(status.at)}{status.end !== undefined && <>–{formatTime(status.end)}</>}
        </span>
      )}
    </>
  );
}

/** The height of an element's content, kept current, so a wrapper can glide to it. */
function useAutoHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return height;
}
