/**
 * GettingStarted: a short first-run checklist for a new project.
 *
 * Reads top to bottom: the tray says what it is and how far along you are
 * ("2 of 5", rolling), a bar in a well fills with the light face, and each step
 * is a checkbox row. Ticking a step fills and pops its ring, draws the tick,
 * strikes the label as it fades to muted and sends a pass of light along the
 * bar. Rows never move or change height, so nothing jumps while you work
 * through the list.
 *
 * Steps can be ticked by hand, or by the app when the person does the thing
 * (pass a new `done` on the step). `autoPlay` ticks the open steps one by one
 * for previews and stops for good on the first click or key press.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { RollNumber, RollText } from "@/ui/atoms";
import { Tray } from "@/ui/molecules/tray";
import styles from "./getting-started.module.css";

export interface GettingStartedStep {
  id: string;
  /** What to do, in a few words: "Record a take". Stays on one line. */
  label: string;
  /** Ticked. Changing it from the app ticks or unticks the step in place. */
  done?: boolean;
  /** A small icon on the right, e.g. the tool the step belongs to. */
  icon?: ReactNode;
}

export interface GettingStartedProps {
  /** The steps, in the order they're usually done. Five or six read best. */
  steps: GettingStartedStep[];
  /** Tray title while steps are open. */
  title?: string;
  /** Tray title once every step is ticked. */
  doneTitle?: string;
  /** Tick the open steps one by one, then stop. Stops for good on any click or key press. */
  autoPlay?: boolean;
  /** Ms between two automatic ticks. */
  interval?: number;
  /** Called with every step and its state after each tick or untick. */
  onChange?: (steps: GettingStartedStep[]) => void;
  className?: string;
}

export function GettingStarted({
  steps,
  title = "Getting started",
  doneTitle = "All set",
  autoPlay = false,
  interval = 2200,
  onChange,
  className,
}: GettingStartedProps) {
  const [done, setDone] = useState(() => new Set(steps.filter((s) => s.done).map((s) => s.id)));
  const [playing, setPlaying] = useState(autoPlay);

  // A `done` flag that changes in props wins over what was ticked by hand.
  const flags = useRef(new Map(steps.map((s) => [s.id, !!s.done])));
  const signature = steps.map((s) => `${s.id}:${s.done ? 1 : 0}`).join("|");
  useEffect(() => {
    const changed = steps.filter((s) => flags.current.get(s.id) !== !!s.done);
    flags.current = new Map(steps.map((s) => [s.id, !!s.done]));
    if (!changed.length) return;
    setDone((prev) => {
      const next = new Set(prev);
      changed.forEach((s) => (s.done ? next.add(s.id) : next.delete(s.id)));
      return next;
    });
  }, [signature]);

  const total = steps.length;
  const count = steps.filter((s) => done.has(s.id)).length;
  const complete = total > 0 && count === total;

  // The light pass runs only when progress grows, never when a step is unticked.
  const [sweep, setSweep] = useState(0);
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) setSweep((n) => n + 1);
    last.current = count;
  }, [count]);

  const toggle = (id: string) => {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
    onChange?.(steps.map((s) => ({ ...s, done: next.has(s.id) })));
  };

  useEffect(() => {
    if (!playing) return;
    const open = steps.find((s) => !done.has(s.id));
    if (!open) { setPlaying(false); return; }
    const t = window.setTimeout(() => toggle(open.id), interval);
    return () => window.clearTimeout(t);
  }, [playing, done]);

  const stop = () => setPlaying(false);

  return (
    <Tray
      className={[styles.root, className].filter(Boolean).join(" ")}
      aria-label={title}
      data-complete={complete || undefined}
      onPointerDown={stop}
      onKeyDown={stop}
      title={<RollText text={complete ? doneTitle : title} className={styles.title} />}
      meta={<span className={styles.count} aria-hidden><RollNumber value={count} /> of {total}</span>}
    >
      <div className={styles.body}>
        <div className={styles.bar} role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={total} aria-valuenow={count} aria-valuetext={`${count} of ${total} done`}>
          <span className={styles.fill} style={{ "--p": total ? count / total : 0 } as CSSProperties}>
            {sweep > 0 && <span key={sweep} className={styles.sweep} />}
          </span>
        </div>
        <ul className={styles.list}>
          {steps.map((step, i) => {
            const checked = done.has(step.id);
            return (
              <li key={step.id} className={styles.item} style={{ "--i": Math.min(i, 8) } as CSSProperties}>
                <button type="button" role="checkbox" aria-checked={checked} className={styles.step} onClick={() => toggle(step.id)}>
                  <span className={styles.box} aria-hidden>
                    <svg viewBox="0 0 16 16"><path d="M4.2 8.3 6.9 11 11.8 5.3" pathLength={1} /></svg>
                  </span>
                  <span className={styles.label} title={step.label}><span>{step.label}</span></span>
                  {step.icon && <span className={styles.icon} aria-hidden>{step.icon}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Tray>
  );
}
