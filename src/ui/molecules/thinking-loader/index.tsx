import { useEffect, useState } from "react";
import { RollText, StatusGlyph, formatDuration } from "@/ui/atoms";
import styles from "./thinking-loader.module.css";

export interface ThinkingLoaderProps {
  /** What the agent is doing, in order. Two to four words each. */
  phases?: string[];
  /** Time per phase in ms when `phase` isn't controlled. */
  interval?: number;
  /** Controlled index into `phases`, e.g. from stream events. Stops the timer. */
  phase?: number;
  /** Start over after the last phase instead of holding it. */
  loop?: boolean;
  /** Finished: the rays turn into a check and the label into `doneLabel`. Back to false starts over. */
  done?: boolean;
  /** Label once done. A function gets the ms since the loader started. */
  doneLabel?: string | ((ms: number) => string);
  /** 24 or 28px tall. */
  size?: "sm" | "md";
  /** `pill` sits on its own as a key; `plain` is just the glyph and label, for inside a message. */
  variant?: "pill" | "plain";
  className?: string;
}

const DEFAULT_PHASES = ["Reading the project", "Looking at the frame", "Planning the edit", "Applying edits"];

/**
 * One line that says what the agent is doing while you wait for it. The label
 * rolls through phases, the pill glides to each new width, and it settles on a
 * check with how long it took.
 */
export function ThinkingLoader({
  phases = DEFAULT_PHASES,
  interval = 2200,
  phase,
  loop = false,
  done = false,
  doneLabel = (ms) => `Worked for ${formatDuration(ms)}`,
  size = "md",
  variant = "pill",
  className,
}: ThinkingLoaderProps) {
  const list = phases.length ? phases : DEFAULT_PHASES.slice(0, 1);
  const every = Number.isFinite(interval) && interval > 0 ? Math.max(interval, 400) : 2200;
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(() => Date.now());
  const [took, setTook] = useState<number | null>(null);
  // Read the clock in the render that turns done on, and restart it when work starts again.
  if (done && took === null) setTook(Date.now() - started);
  if (!done && took !== null) { setTook(null); setStarted(Date.now()); setStep(0); }

  const controlled = phase !== undefined && Number.isFinite(phase);
  useEffect(() => {
    if (done || controlled || list.length < 2) return;
    const id = window.setInterval(() => setStep((s) => (s + 1 < list.length ? s + 1 : loop ? 0 : s)), every);
    return () => window.clearInterval(id);
  }, [done, controlled, list.length, every, loop]);

  const index = Math.min(Math.max(controlled ? Math.floor(phase!) : step, 0), list.length - 1);
  const label = done ? (typeof doneLabel === "function" ? doneLabel(took ?? 0) : doneLabel) : list[index]!;

  return (
    <span className={[styles.loader, className].filter(Boolean).join(" ")} data-size={size} data-variant={variant} data-done={done || undefined} role="status" aria-live="polite">
      <StatusGlyph status={done ? "done" : "running"} size={size === "sm" ? 13 : 14} />
      <RollText text={label} shimmer={!done} className={styles.label} />
    </span>
  );
}
