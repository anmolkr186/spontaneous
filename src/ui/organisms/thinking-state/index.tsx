/**
 * ThinkingState: the agent's working panel while it reads a recording and
 * plans an edit. The header says "Working" with a live clock and turns into
 * "Worked for 14s"; it folds the steps away.
 *
 * Steps arrive one by one on a thin rail that grows down to each new node.
 * The step in progress pulses and shimmers. Under a step sit the moments of
 * the recording the agent looked at: small chips with a timecode and a frame
 * swatch that pop in one after another, with "+N more" for the rest. A chip
 * seeks the recording there. When the work is done a check pops in at the end
 * of the rail and draws itself.
 *
 * It runs on its own timer (`stepMs`), or the agent's stream drives it with
 * `activeIndex` and `done`.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { Cell, DrawCheck, Duration, Fold, RollText, Shimmer } from "@/ui/atoms";
import { TrayCard } from "@/ui/molecules/tray";
import { Tooltip } from "@/ui/base/tooltip/tooltip";
import { formatTime } from "@/editor/model";
import styles from "./thinking-state.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** A moment of the recording the agent looked at. */
export interface Moment {
  id: string;
  /** Position in the recording, in seconds. */
  at: number;
  /** What is on the frame there: "Create button". Shown in the tooltip. */
  label: string;
  /** A CSS background for the frame swatch: an image url or a gradient. */
  thumb?: string;
}

export interface ThinkingStep {
  id: string;
  /** What the agent does, in a few words: "Finding the click on Create". */
  label: string;
  /** One quiet line under the label. */
  detail?: string;
  /** Moments it looked at during this step. */
  moments?: Moment[];
}

export interface ThinkingStateProps {
  /** The steps, revealed in order. */
  steps: ThinkingStep[];
  /** Pause between two steps when it runs on its own timer, in ms. */
  stepMs?: number;
  /** Controlled: the step working now. Steps before it are done, steps after it aren't shown yet. Stops the timer. */
  activeIndex?: number;
  /** Controlled: all steps done. The clock stops and the final row draws its check. Back to false starts over. */
  done?: boolean;
  /** Label of the final row. */
  doneLabel?: string;
  /** Header while working. */
  label?: string;
  /** Called once when the work is done, with how long it took in ms. */
  onDone?: (ms: number) => void;
  /** Called when a moment chip is pressed, with its position in seconds. */
  onSeek?: (at: number) => void;
  /** Moment chips shown per step before "+N more". */
  maxMoments?: number;
  /** Steps unfolded (controlled). */
  open?: boolean;
  /** Steps unfolded when uncontrolled. */
  defaultOpen?: boolean;
  /** Called when the header is toggled. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

function MomentChip({ moment, onSeek }: { moment: Moment; onSeek?: (at: number) => void }) {
  const time = formatTime(moment.at);
  return (
    <Tooltip content={`Frame at ${time} · ${moment.label}`} side="top">
      <button type="button" className={styles.chip} data-thumb={moment.thumb ? "" : undefined} aria-label={`Go to ${time}, ${moment.label}`} onClick={() => onSeek?.(moment.at)}>
        {moment.thumb && <span className={styles.thumb} style={{ "--thumb": moment.thumb } as CSSProperties} aria-hidden />}
        <span className={styles.time}>{time}</span>
      </button>
    </Tooltip>
  );
}

function Step({ step, state, maxMoments, onSeek }: { step: ThinkingStep; state: "active" | "done"; maxMoments: number; onSeek?: (at: number) => void }) {
  const [more, setMore] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const moments = step.moments ?? [];
  const shown = more ? moments : moments.slice(0, maxMoments);
  const hidden = moments.length - shown.length;
  // "+N more" disappears as the rest pop in; focus moves to the first of them.
  useEffect(() => {
    if (more) list.current?.querySelectorAll("button")[maxMoments]?.focus();
  }, [more, maxMoments]);
  return (
    <li className={styles.step} data-state={state}>
      <span className={styles.node} aria-hidden><Cell size={7} className={styles.cell} /></span>
      <div className={styles.stepBody}>
        <Shimmer active={state === "active"} className={styles.label}>{step.label}</Shimmer>
        {step.detail && <span className={styles.detail}>{step.detail}</span>}
        {moments.length > 0 && (
          <ul ref={list} className={styles.moments} aria-label="Moments it looked at">
            {shown.map((m, i) => (
              <li key={m.id} style={{ "--i": i < maxMoments ? i : i - maxMoments } as CSSProperties}>
                <MomentChip moment={m} onSeek={onSeek} />
              </li>
            ))}
            {hidden > 0 && (
              <li style={{ "--i": shown.length } as CSSProperties}>
                <button type="button" className={styles.chip} aria-label={`Show ${hidden} more moments`} onClick={() => setMore(true)}>+{hidden} more</button>
              </li>
            )}
          </ul>
        )}
      </div>
    </li>
  );
}

export function ThinkingState({
  steps, stepMs = 1300, activeIndex, done, doneLabel = "Ready", label = "Working", onDone, onSeek, maxMoments = 3,
  open, defaultOpen = true, onOpenChange, className,
}: ThinkingStateProps) {
  const uid = useId();
  const controlled = activeIndex !== undefined && Number.isFinite(activeIndex);
  const every = Number.isFinite(stepMs) && stepMs > 0 ? Math.max(stepMs, 300) : 1300;
  const last = Math.max(0, steps.length - 1);

  // On its own timer: one step per beat, then one more beat on the last step before it's done.
  // With `done` controlled, the timer walks the steps but leaves finishing to the stream.
  const [tick, setTick] = useState(0);
  const isDone = done ?? (!controlled && tick > last);
  const limit = done === undefined ? last + 1 : last;
  useEffect(() => {
    if (controlled || isDone || tick >= limit) return;
    const id = window.setTimeout(() => setTick((t) => t + 1), every);
    return () => window.clearTimeout(id);
  }, [tick, controlled, isDone, limit, every]);

  const index = Math.min(Math.max(controlled ? Math.floor(activeIndex!) : tick, 0), last);

  // The clock: read in the render that turns done on; restarts when work starts again.
  const [started, setStarted] = useState(() => Date.now());
  const [took, setTook] = useState<number | null>(null);
  if (isDone && took === null) setTook(Date.now() - started);
  if (!isDone && took !== null) { setTook(null); setStarted(Date.now()); if (!controlled) setTick(0); }
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => { if (took !== null) onDoneRef.current?.(took); }, [took]);

  const [openState, setOpenState] = useState(defaultOpen);
  const isOpen = open ?? openState;
  const toggle = () => { if (open === undefined) setOpenState(!isOpen); onOpenChange?.(!isOpen); };

  const visible = isDone ? steps : steps.slice(0, index + 1);

  return (
    <section className={cx(styles.panel, className)} data-done={isDone || undefined} aria-label="Agent progress">
      <button type="button" className={styles.head} aria-expanded={isOpen} aria-controls={`${uid}-steps`} onClick={toggle}>
        <RollText text={isDone ? "Worked for" : label} shimmer={!isDone} className={styles.headLabel} />
        {isDone ? <Duration ms={took ?? 0} /> : <Duration since={started} running />}
        <ChevronDown className={styles.chevron} aria-hidden />
      </button>
      <Fold open={isOpen} id={`${uid}-steps`}>
        <TrayCard>
          <ol className={styles.rail} aria-live="polite" aria-relevant="additions">
            {visible.map((s, i) => (
              <Step key={s.id} step={s} state={isDone || i < index ? "done" : "active"} maxMoments={maxMoments} onSeek={onSeek} />
            ))}
            {isDone && (
              <li className={styles.step} data-state="final">
                <span className={styles.node} aria-hidden><span className={styles.pop}><DrawCheck size={13} delay={260} /></span></span>
                <div className={styles.stepBody}><span className={styles.label}>{doneLabel}</span></div>
              </li>
            )}
          </ol>
        </TrayCard>
      </Fold>
    </section>
  );
}
