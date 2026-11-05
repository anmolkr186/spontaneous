/**
 * AgentSteering: steer the agent while it works, without stopping it.
 *
 * The card reads top to bottom: what the agent is working on, its plan (done
 * steps with a check, the active one turning and shimmering, the rest
 * waiting), the notes you've queued, and a field to write the next one. Enter
 * queues a note for the next step; ⌘Enter applies it to the active step right
 * away. When the agent picks a queued note up, the note glides out of the
 * queue into the step it changed and lights softly once it lands, so the run
 * still reads later as "this note changed that step".
 *
 * Notes are your words, so they carry the ink cell. The tray's header holds the
 * agent and the run clock; its footer the run's state and Pause or Resume.
 */
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { ArrowUp, Pause, Play, X } from "lucide-react";
import { Cell, DrawCheck, Duration, Fold, IconKey, Kbd, Key, Mark, RollNumber, Shimmer, StatusGlyph, Swap, formatDuration } from "@/ui/atoms";
import type { GlyphStatus } from "@/ui/atoms";
import { Tray, TraySpacer } from "@/ui/molecules/tray";
import { blurIn, motionTokens } from "@/ui/tokens/motion";
import { AutoHeight } from "@/ui/atoms";
import styles from "./agent-steering.module.css";

export type SteerStepStatus = "done" | "active" | "pending";
export type SteerStatus = "running" | "paused" | "done";

export interface SteerNote {
  id: string;
  /** Your words, as written. */
  text: string;
}

export interface SteerStep {
  id: string;
  /** What the step does: "Zoom on the Create button". */
  title: string;
  /** Default "pending". */
  status?: SteerStepStatus;
  /** How long it took, in ms, once done. */
  duration?: number;
  /** Notes this step took in. Move a queued note here (same id) and it glides over from the queue. */
  notes?: SteerNote[];
}

export interface AgentSteeringProps {
  /** What the agent is working on: the card's heading. */
  title: string;
  /** Who is working, shown in the tray header. Default "Claude Code". */
  agent?: string;
  /** The plan, in order. */
  steps: SteerStep[];
  /** Notes waiting for the next step, oldest first. */
  queue?: SteerNote[];
  /** The run. The clock ticks while running; done folds the field away. */
  status?: SteerStatus;
  /** When the run started (ms since epoch). The header clock counts from here, minus time spent paused. */
  startedAt?: number;
  /** Enter in the field: add the note to the queue. */
  onQueue?: (text: string) => void;
  /** ⌘Enter in the field, or Now on a queued note: apply it to the active step right away. Shows the shortcut and the Now buttons. */
  onInterrupt?: (text: string, queuedId?: string) => void;
  /** ✕ on a queued note. */
  onRemove?: (id: string) => void;
  /** Shows Pause while running. */
  onPause?: () => void;
  /** Shows Resume while paused. */
  onResume?: () => void;
  /** Controlled field text, e.g. to prefill a suggestion. */
  draft?: string;
  /** Every change to the field's text. */
  onDraftChange?: (text: string) => void;
  /** Text in the empty field. */
  placeholder?: string;
  className?: string;
}

const GLYPH: Record<SteerStepStatus, GlyphStatus> = { pending: "queued", active: "running", done: "done" };

/** Remembers the last thing to read out, keyed so the same words can be said twice. */
function useAnnouncer() {
  const [said, setSaid] = useState({ n: 0, text: "" });
  return [said, (text: string) => setSaid((s) => ({ n: s.n + 1, text }))] as const;
}

/** The run's clock: it stands still while paused and picks up where it stopped. */
function useRunClock(status: SteerStatus, startedAt?: number) {
  const ticking = status === "running";
  const [clock, setClock] = useState(() => {
    const spent = startedAt !== undefined ? Date.now() - startedAt : 0;
    return ticking ? { base: 0, since: startedAt ?? Date.now() } : { base: spent, since: null as number | null };
  });
  if (ticking && clock.since === null) setClock({ base: clock.base, since: Date.now() });
  if (!ticking && clock.since !== null) setClock({ base: clock.base + Date.now() - clock.since, since: null });
  return clock;
}

export function AgentSteering({
  title,
  agent = "Claude Code",
  steps,
  queue = [],
  status = "running",
  startedAt,
  onQueue,
  onInterrupt,
  onRemove,
  onPause,
  onResume,
  draft,
  onDraftChange,
  placeholder = "Steer the agent…",
  className,
}: AgentSteeringProps) {
  const [ownDraft, setOwnDraft] = useState("");
  const text = draft ?? ownDraft;
  const setText = (next: string) => { if (draft === undefined) setOwnDraft(next); onDraftChange?.(next); };

  const clock = useRunClock(status, startedAt);
  const [said, announce] = useAnnouncer();
  const headingId = useId();
  const hintId = useId();
  const layoutId = useId();

  // Where each note in a step came from decides how it arrives: notes that
  // were queued glide over, notes applied right away rise in, notes that were
  // there from the start just sit there.
  const lastQueue = useRef(queue);
  const [atMount] = useState(() => new Set(steps.flatMap((s) => s.notes ?? []).map((n) => n.id)));
  const origin = (id: string): NoteOrigin => (lastQueue.current.some((q) => q.id === id) ? "queue" : atMount.has(id) ? "mount" : "now");

  useEffect(() => {
    const taken = new Map(steps.flatMap((s) => (s.notes ?? []).map((n) => [n.id, s] as const)));
    for (const q of lastQueue.current) {
      const step = taken.get(q.id);
      if (step) announce(`${agent} picked up “${q.text}” for ${step.title}`);
    }
    lastQueue.current = queue;
  }, [queue, steps]);

  const send = (now: boolean) => {
    const clean = text.trim();
    if (!clean) return;
    if (now && onInterrupt) { onInterrupt(clean); announce(`Applied now: “${clean}”`); }
    else if (onQueue) { onQueue(clean); announce(`Queued for the next step: “${clean}”`); }
    else return;
    setText("");
  };

  const activeIndex = steps.findIndex((s) => s.status === "active");
  const doneCount = steps.filter((s) => s.status === "done").length;
  const position = activeIndex >= 0 ? activeIndex + 1 : Math.min(doneCount + 1, steps.length);
  const finished = status === "done";

  return (
    <MotionConfig reducedMotion="user">
      <Tray
        className={className}
        aria-labelledby={headingId}
        title={<><Mark size={13} title="" />{agent}</>}
        meta={clock.since !== null ? <Duration since={clock.since - clock.base} running className={styles.clock} /> : <Duration ms={clock.base} className={styles.clock} />}
        foot={
          <Swap id={status} className={styles.foot}>
            {status === "running" && <span className={styles.state}>Step <RollNumber value={position} /> of {steps.length}</span>}
            {status === "paused" && <span className={styles.state}>Paused at step {position} of {steps.length}</span>}
            {finished && <span className={styles.state} data-done><DrawCheck size={13} />Done in {formatDuration(clock.base)}</span>}
            <TraySpacer />
            {status === "running" && onPause && <Key size="sm" variant="tertiary" onClick={onPause}><Pause />Pause</Key>}
            {status === "paused" && onResume && <Key size="sm" variant="secondary" onClick={onResume}><Play />Resume</Key>}
          </Swap>
        }
      >
        <AutoHeight>
          <LayoutGroup id={layoutId}>
            <div className={styles.body}>
              <h3 id={headingId} className={styles.title}>{title}</h3>
              <ol className={styles.steps} aria-label="Plan">
                {steps.map((step) => <StepRow key={step.id} step={step} paused={status === "paused"} origin={origin} />)}
              </ol>

              <motion.div layout="position" transition={{ layout: motionTokens.spring.travel }}>
                <Fold open={queue.length > 0}>
                  <div className={styles.queue}>
                    <span className={styles.queueHead}>Up next<span className={styles.count}><RollNumber value={queue.length} /></span></span>
                    <ul className={styles.queueList} aria-label="Queued notes">
                      <AnimatePresence initial={false}>
                        {queue.map((note) => (
                          <motion.li
                            key={note.id}
                            layout="position"
                            className={styles.queued}
                            initial={blurIn.initial}
                            animate={blurIn.animate}
                            exit={{ opacity: 0, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.standard } }}
                            transition={{ ...blurIn.transition, layout: motionTokens.spring.travel }}
                          >
                            <NoteChip note={note} single />
                            {onInterrupt && (
                              <Key size="sm" variant="tertiary" className={styles.now} onClick={() => { onInterrupt(note.text, note.id); announce(`Applied now: “${note.text}”`); }}>Now</Key>
                            )}
                            {onRemove && (
                              <IconKey size="sm" label={`Remove “${note.text}”`} tooltip="top" onClick={() => { onRemove(note.id); announce(`Removed from the queue: “${note.text}”`); }}><X /></IconKey>
                            )}
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </div>
                </Fold>

                <Fold open={!finished}>
                  <div className={styles.composer}>
                    <div className={styles.field}>
                      <textarea
                        className={styles.input}
                        rows={1}
                        value={text}
                        placeholder={placeholder}
                        aria-label="Steer the agent"
                        aria-describedby={hintId}
                        onChange={(e) => setText(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape" && text) { e.preventDefault(); setText(""); return; }
                          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                          e.preventDefault();
                          send(e.metaKey || e.ctrlKey);
                        }}
                      />
                      <IconKey size="sm" variant={text.trim() ? "secondary" : "tertiary"} label="Queue for the next step" shortcut="↵" tooltip="top" disabled={!text.trim()} onClick={() => send(false)} className={styles.send}>
                        <ArrowUp />
                      </IconKey>
                    </div>
                    <p id={hintId} className={styles.hint}>
                      <span><Kbd>↵</Kbd> next step</span>
                      {onInterrupt && <span><Kbd>⌘</Kbd><Kbd>↵</Kbd> now</span>}
                      <span className={styles.hintExtra}><Kbd>⇧</Kbd><Kbd>↵</Kbd> new line</span>
                    </p>
                  </div>
                </Fold>
              </motion.div>
            </div>
          </LayoutGroup>
        </AutoHeight>
        <span className="visually-hidden" role="status" aria-live="polite">{said.text}{said.n % 2 ? " " : ""}</span>
      </Tray>
    </MotionConfig>
  );
}

/* ───────────────────────── A step ───────────────────────── */

type NoteOrigin = "queue" | "now" | "mount";

function StepRow({ step, paused, origin }: { step: SteerStep; paused: boolean; origin: (id: string) => NoteOrigin }) {
  const status = step.status ?? "pending";
  // The check pops only when a step finishes in front of you, not for steps that were already done.
  const [was, setWas] = useState(status);
  const [popped, setPopped] = useState(false);
  if (was !== status) { setWas(status); if (status === "done") setPopped(true); }
  const notes = step.notes ?? [];

  return (
    <motion.li
      layout="position"
      transition={{ layout: motionTokens.spring.travel }}
      className={styles.step}
      data-status={status}
      aria-current={status === "active" ? "step" : undefined}
    >
      <span className={styles.glyph} data-popped={popped || undefined}>
        <StatusGlyph status={paused && status === "active" ? "stopped" : GLYPH[status]} size={14} />
      </span>
      <span className={styles.stepTitle}>
        <Shimmer active={status === "active" && !paused}>{step.title}</Shimmer>
        <span className="visually-hidden">{status === "done" ? ", done" : status === "active" ? (paused ? ", paused" : ", working") : ""}</span>
      </span>
      <span className={styles.took}>{status === "done" && step.duration !== undefined && <Duration ms={step.duration} muted />}</span>
      {notes.length > 0 && (
        <ul className={styles.notes} aria-label={`Notes for ${step.title}`}>
          {notes.map((n) => <NoteChip key={n.id} note={n} origin={origin(n.id)} />)}
        </ul>
      )}
    </motion.li>
  );
}

/* ───────────────────────── A note ───────────────────────── */

/**
 * One of your notes: the ink cell and your words. The same note shares a
 * layout id in the queue and in its step, so when the agent takes it in it
 * travels from one to the other instead of disappearing and reappearing.
 */
function NoteChip({ note, single, origin = "mount" }: { note: SteerNote; single?: boolean; origin?: NoteOrigin }) {
  const [from] = useState(origin);
  const [lit, setLit] = useState(false);
  const light = () => { if (from !== "mount") setLit(true); };
  const Element = single ? motion.span : motion.li;
  return (
    <Element
      layoutId={`steer-note-${note.id}`}
      layout="position"
      className={styles.note}
      data-single={single || undefined}
      data-lit={lit || undefined}
      transition={{ ...blurIn.transition, layout: motionTokens.spring.travel }}
      initial={from === "now" ? blurIn.initial : false}
      animate={blurIn.animate}
      onLayoutAnimationComplete={light}
      onAnimationComplete={from === "now" ? light : undefined}
    >
      <Cell variant="ink" size={6} className={styles.noteCell} />
      <span className={styles.noteText}>{note.text}</span>
    </Element>
  );
}

