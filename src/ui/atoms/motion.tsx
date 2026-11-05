/**
 * Motion atoms: the small moving parts every agent component is built from.
 *
 *   RaySpinner   eight rays fading in turn, so it turns without rotating
 *   StatusGlyph  queued ring → rays → a check or cross that draws itself
 *   Shimmer      a band of light sweeping over a label while work runs
 *   RollText     a label that rolls up out of a blur to the next one, gliding to its new width
 *   RollNumber   digits that roll one by one when a number changes
 *   Fold         height that folds open and shut (grid rows 0fr → 1fr)
 *   AutoHeight   height that springs to fit content that keeps changing
 *   Swap         one piece of content blurring out while the next blurs in
 *   Duration     a ticking or settled duration ("2.7s", "1m 05s"), in the time face
 *
 * Every one of them has a reduced-motion branch: the global rule in tokens.css
 * collapses durations, and the parts that loop (rays, sweeps) stand still.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import type { AnimationPlaybackControls } from "motion/react";
import { blurIn, motionTokens } from "@/ui/tokens/motion";
import styles from "./motion.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const RAYS = [0, 1, 2, 3, 4, 5, 6, 7];

/* ───────────────────────── Spinner and status ───────────────────────── */

/** Eight thin rays in the live color, fading one after another. Inherits size from `size`. */
export function RaySpinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg className={cx(styles.rays, className)} viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      {RAYS.map((i) => (
        <line key={i} x1="8" y1="1.75" x2="8" y2="4.75" transform={`rotate(${i * 45} 8 8)`} style={{ animationDelay: `${(i - 8) * 100}ms` }} />
      ))}
    </svg>
  );
}

export type GlyphStatus = "queued" | "running" | "done" | "failed" | "stopped";

/**
 * One slot that walks a step through its life: a hairline ring while queued,
 * rays while running, then the rays shrink away as a check (or a cross) grows
 * in and draws itself. Every layer is always mounted so the hand-off animates.
 */
export function StatusGlyph({ status, size = 14, className, label }: { status: GlyphStatus; size?: number; className?: string; label?: string }) {
  return (
    <span className={cx(styles.glyph, className)} data-status={status} style={{ "--glyph": `${size}px` } as CSSProperties} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className={styles.glyphRing} />
      <RaySpinner size={size} className={styles.glyphRays} />
      <svg className={styles.glyphCheck} viewBox="0 0 16 16" width={size} height={size}><path d="M3.5 8.4 6.6 11.3 12.5 4.9" pathLength={1} /></svg>
      <svg className={styles.glyphCross} viewBox="0 0 16 16" width={size} height={size}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" pathLength={1} /></svg>
      <span className={styles.glyphStop} />
    </span>
  );
}

/** A check that draws itself when it mounts. For confirmations that appear in place of something else. */
export function DrawCheck({ size = 14, className, delay = 80 }: { size?: number; className?: string; delay?: number }) {
  return (
    <svg className={cx(styles.drawn, className)} viewBox="0 0 16 16" width={size} height={size} aria-hidden style={{ animationDelay: `${delay}ms` }}>
      <path d="M3.5 8.4 6.6 11.3 12.5 4.9" pathLength={1} style={{ animationDelay: `${delay}ms` }} />
    </svg>
  );
}

/* ───────────────────────── Shimmer ───────────────────────── */

/** A band of light sweeping over text while something works. Stops the moment `active` turns off. */
export function Shimmer({ active = true, children, className, ...props }: HTMLAttributes<HTMLSpanElement> & { active?: boolean }) {
  return <span className={cx(active && styles.shimmer, className)} {...props}>{children}</span>;
}

/* ───────────────────────── RollText ───────────────────────── */

export interface RollTextProps {
  /** The current label. Changing it rolls the old one up and out while the new one rolls in. */
  text: string;
  /** Sweep a band of light over the label. */
  shimmer?: boolean;
  className?: string;
  /** Glide the box to the width of each new label. Off for labels in fixed-width slots. */
  glide?: boolean;
}

/**
 * A label that changes in place. The old text rolls up and blurs out; the new
 * one rises out of a blur; the box glides to the new width so whatever sits
 * next to it moves calmly instead of jumping.
 */
export function RollText({ text, shimmer, className, glide = true }: RollTextProps) {
  const [shown, setShown] = useState({ key: 0, text });
  const [leaving, setLeaving] = useState<{ key: number; text: string } | null>(null);
  if (text !== shown.text) {
    setLeaving(shown);
    setShown({ key: shown.key + 1, text });
  }
  const box = useRef<HTMLSpanElement>(null);
  const current = useRef<HTMLSpanElement>(null);
  const measured = useRef(false);
  useLayoutEffect(() => {
    const b = box.current, c = current.current;
    if (!b || !c || !glide) return;
    if (!measured.current) b.style.transition = "none";
    b.style.width = `${c.scrollWidth + 1}px`;
    if (!measured.current) { b.getBoundingClientRect(); b.style.transition = ""; measured.current = true; }
  }, [shown.key, glide]);
  return (
    <span ref={box} className={cx(styles.roll, className)} data-glide={glide || undefined}>
      {leaving && (
        <span key={leaving.key} className={cx(styles.rollItem, styles.rollOut)} aria-hidden onAnimationEnd={() => setLeaving(null)}>{leaving.text}</span>
      )}
      <span key={shown.key} ref={current} className={cx(styles.rollItem, shown.key > 0 && styles.rollIn, shimmer && styles.shimmer)}>{shown.text}</span>
    </span>
  );
}

/* ───────────────────────── RollNumber ───────────────────────── */

/**
 * A number whose changed digits roll: up when it grows, down when it shrinks.
 * Unchanged digits stay still. Screen readers get the whole value once.
 */
export function RollNumber({ value, format = (n) => String(n), className, mono }: { value: number; format?: (n: number) => string; className?: string; mono?: boolean }) {
  const text = format(value);
  const prev = useRef(value);
  const dir = value < prev.current ? "down" : "up";
  const known = useRef<Map<string, boolean>>(new Map());
  const first = useRef(true);
  const chars = text.split("");
  const next = new Map<string, boolean>();
  const keys = chars.map((c, i) => {
    const k = `${chars.length - i}:${c}`;
    next.set(k, known.current.has(k) ? known.current.get(k)! : !first.current);
    return k;
  });
  useLayoutEffect(() => { known.current = next; first.current = false; prev.current = value; });
  return (
    <span className={cx(styles.number, mono && styles.mono, className)} aria-label={text} role="text">
      {chars.map((c, i) => (
        <span key={keys[i]} aria-hidden className={next.get(keys[i]!) ? styles.digitIn : styles.digit} data-dir={dir}>{c}</span>
      ))}
    </span>
  );
}

/* ───────────────────────── Fold ───────────────────────── */

/** Height that folds open and shut. Closed content is inert, so it can't be tabbed into. */
export function Fold({ open, children, className, id }: { open: boolean; children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={cx(styles.fold, className)} data-open={open || undefined} inert={!open || undefined}>
      <div className={styles.foldInner}>{children}</div>
    </div>
  );
}

/* ───────────────────────── Swap ───────────────────────── */

/**
 * Swaps one piece of content for the next: the old one blurs out while the new
 * one rises in. Give each state its own `id`. `layout` keeps neighbours gliding.
 */
export function Swap({ id, children, className, inline = true }: { id: string; children: ReactNode; className?: string; inline?: boolean }) {
  const Tag = inline ? motion.span : motion.div;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <Tag key={id} className={cx(styles.swap, className)} {...blurIn}>{children}</Tag>
    </AnimatePresence>
  );
}

/* ───────────────────────── Time ───────────────────────── */

/** Re-renders every `every` ms while `active`. Returns the current time in ms. */
export function useNow(active = true, every = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(id);
  }, [active, every]);
  return now;
}

/** "0.4s", "2.7s", "42s", "1m 05s", "1h 02m". Durations, never positions: positions read "0:42". */
export function formatDuration(ms: number) {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.floor(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/**
 * A duration in the time face. Ticks while `running` (from `since`); otherwise
 * shows `ms`. Ticks in tenths under ten seconds so short runs feel alive.
 */
export function Duration({ since, ms, running, className, muted }: { since?: number; ms?: number; running?: boolean; className?: string; muted?: boolean }) {
  const now = useNow(!!running && since !== undefined, 100);
  const value = running && since !== undefined ? now - since : ms ?? 0;
  return <span className={cx(styles.duration, className)} data-muted={muted || undefined}>{formatDuration(value)}</span>;
}

/* ───────────────────────── AutoHeight ───────────────────────── */

/**
 * A box whose height springs to fit content that keeps changing: a plan gaining
 * a step, a queue emptying, a reason swapping for a longer one. Fold covers open
 * and shut; this covers everything in between. It clips only while it moves, so
 * focus rings and shadows aren't cut at rest, and a change mid-glide retargets
 * the running spring so it keeps its speed. Reduced motion: it simply follows.
 */
export function AutoHeight({ children, className }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const box = outer.current, content = inner.current;
    if (!box || !content || reduce) return;
    let last = content.offsetHeight;
    let moving: AnimationPlaybackControls | null = null;
    const settle = () => { box.style.height = ""; box.style.overflow = ""; moving = null; };
    const observer = new ResizeObserver(() => {
      const next = content.offsetHeight;
      if (next === last) return;
      const from = last;
      last = next;
      // Mid-glide (a fold inside changes the height every frame), retarget the
      // running spring so it keeps its speed; at rest, start from the old height.
      if (!moving) { box.style.overflow = "hidden"; box.style.height = `${from}px`; }
      const run = animate(box, { height: moving ? next : [from, next] }, motionTokens.spring.smooth);
      moving = run;
      run.then(() => { if (moving === run) settle(); });
    });
    observer.observe(content);
    return () => { observer.disconnect(); moving?.stop(); settle(); };
  }, [reduce]);

  return (
    <div ref={outer} className={className}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
