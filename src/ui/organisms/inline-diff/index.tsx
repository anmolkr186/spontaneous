/**
 * InlineDiff: the agent's edits to prose in the project, reviewed in place.
 *
 * Captions, the narration script, on-screen text and the video's title read as
 * one paragraph with the edits inline: removed words struck on a faint dark
 * wash, new words on a faint light wash. Each pending edit is focusable; a
 * small popover with Accept (Y) and Reject (N) rises above the one in focus and
 * glides to the next. Accepting shrinks the struck words to nothing while the
 * new words settle into the text; rejecting does the opposite. The tray's
 * footer counts what's left, steps through edits, accepts or rejects them all,
 * and turns into "All changes reviewed" once nothing is left.
 */
import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import { DrawCheck, IconKey, Kbd, Key, RollNumber, Swap } from "@/ui/atoms";
import { Tray, TraySpacer } from "@/ui/molecules/tray";
import { motionTokens } from "@/ui/tokens/motion";
import { diffWords, textOf } from "./diff";
import type { DiffSegment } from "./diff";
import { CtaKey, diffLabel, proposedPrimary } from "@/ui/cta";
import type { CtaProposal } from "@/ui/cta";
import styles from "./inline-diff.module.css";

export { diffWords } from "./diff";
export type { DiffSegment } from "./diff";

export type Decision = "pending" | "accepted" | "rejected";

export interface InlineDiffHandle {
  /** Point at a pending change and open its popover, or clear with null. */
  highlight: (index: number | null) => void;
  accept: (index: number) => void;
  reject: (index: number) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  /** Takes back the last decision (Accept all and Reject all count as one). */
  undo: () => void;
  /** Every change pending again, history cleared. */
  reset: () => void;
}

export interface InlineDiffProps {
  /** The text as it is now. */
  original?: string;
  /** The text the agent suggests, diffed word by word against `original`. */
  suggested?: string;
  /** Pre-computed segments instead of `original` and `suggested`. */
  changes?: DiffSegment[];
  /** Called on every decision and undo with the text so far; pending changes keep the original words. */
  onChange?: (text: string) => void;
  /** Called once the last pending change is decided, with the final text. */
  onDone?: (text: string) => void;
  /** Tray title: what is being edited and why. "Captions · Make it shorter". */
  label?: ReactNode;
  /** Right of the tray title. */
  meta?: ReactNode;
  /** Labels the agent proposed for the main key. Shown when they pass the checks; otherwise the derived label. */
  cta?: CtaProposal;
  className?: string;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
const quote = (s: string) => `“${s.trim()}”`;
const words = (s: string) => s.match(/^\s+|\S+\s*/g) ?? [];

function describe(c: Extract<DiffSegment, { type: "change" }>) {
  if (!c.insert.trim()) return `remove ${quote(c.remove)}`;
  if (!c.remove.trim()) return `add ${quote(c.insert)}`;
  return `replace ${quote(c.remove)} with ${quote(c.insert)}`;
}

export const InlineDiff = forwardRef<InlineDiffHandle, InlineDiffProps>(function InlineDiff(
  { original = "", suggested = "", changes, onChange, onDone, label, meta, cta, className },
  ref,
) {
  const reduce = useReducedMotion();
  const uid = useId();
  const segments = useMemo(() => changes ?? diffWords(original, suggested), [changes, original, suggested]);
  const list = useMemo(() => segments.filter((s): s is Extract<DiffSegment, { type: "change" }> => s.type === "change"), [segments]);
  const total = list.length;

  // New input starts a new review.
  const signature = JSON.stringify(segments);
  const [seen, setSeen] = useState(signature);
  const [decisions, setDecisions] = useState<Decision[]>(() => list.map(() => "pending"));
  const [history, setHistory] = useState<Decision[][]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [said, setSaid] = useState("");
  if (seen !== signature) {
    setSeen(signature);
    setDecisions(list.map(() => "pending"));
    setHistory([]);
    setActive(null);
  }

  const root = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const changeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const undoRef = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<number | "undo" | null>(null);

  const left = decisions.filter((d) => d === "pending").length;
  const done = left === 0;

  const nextPending = (from: number, step: 1 | -1, ds = decisions) => {
    for (let n = 1; n <= total; n++) {
      const i = (((from + step * n) % total) + total) % total;
      if (ds[i] === "pending") return i;
    }
    return null;
  };

  const commit = (next: Decision[], message: string, from: number | null, focus: boolean) => {
    const remaining = next.filter((d) => d === "pending").length;
    setHistory((h) => [...h, decisions]);
    setDecisions(next);
    setSaid(remaining ? `${message} ${remaining} left.` : `${message} All changes reviewed.`);
    const after = from === null ? null : nextPending(from, 1, next);
    setActive(after);
    focusAfter.current = focus ? (after ?? "undo") : remaining ? null : "undo";
    onChange?.(textOf(segments, (k) => next[k] === "accepted"));
    if (!remaining) onDone?.(textOf(segments, (k) => next[k] === "accepted"));
  };

  const decide = (i: number, d: "accepted" | "rejected", focus = false) => {
    const c = list[i];
    if (!c || decisions[i] !== "pending") return;
    const next = decisions.slice();
    next[i] = d;
    const message = d === "accepted" ? `Accepted: ${describe(c)}.` : c.remove.trim() ? `Rejected: kept ${quote(c.remove)}.` : `Rejected: left out ${quote(c.insert)}.`;
    commit(next, message, i, focus);
  };

  const decideAll = (d: "accepted" | "rejected") => {
    if (!left) return;
    commit(decisions.map((x) => (x === "pending" ? d : x)), d === "accepted" ? `Accepted ${left === 1 ? "the last change" : `all ${left} changes`}.` : `Rejected ${left === 1 ? "the last change" : `all ${left} changes`}.`, null, false);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setDecisions(prev);
    const remaining = prev.filter((d) => d === "pending").length;
    setSaid(`Undone. ${remaining} left.`);
    // Focus goes back to the first change that is open again.
    const reopened = prev.findIndex((d, i) => d === "pending" && decisions[i] !== "pending");
    if (reopened >= 0) { focusAfter.current = reopened; setActive(reopened); }
    onChange?.(textOf(segments, (k) => prev[k] === "accepted"));
  };

  // Where the arrows step from: the last change pointed at, kept when focus wanders off.
  const cursor = useRef<number | null>(null);
  useEffect(() => { if (active !== null) cursor.current = active; }, [active]);

  const highlight = (i: number | null) => {
    if (i === null || decisions[i] !== "pending") { setActive(null); cursor.current = null; return; }
    setActive(i);
    changeRefs.current[i]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
  };

  const step = (dir: 1 | -1) => {
    const from = active ?? cursor.current ?? (dir === 1 ? -1 : total);
    highlight(nextPending(from, dir));
  };

  useImperativeHandle(ref, () => ({
    highlight,
    accept: (i) => decide(i, "accepted"),
    reject: (i) => decide(i, "rejected"),
    acceptAll: () => decideAll("accepted"),
    rejectAll: () => decideAll("rejected"),
    undo,
    reset: () => { setDecisions(list.map(() => "pending")); setHistory([]); setActive(null); setSaid(""); },
  }));

  // Focus follows the review: to the next pending change, or to Undo once nothing is left.
  useEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (target === "undo") undoRef.current?.focus();
    else if (target !== null) changeRefs.current[target]?.focus();
  }, [decisions]);

  /* ── The popover's place: above the first line of the active change ── */
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = textRef.current;
    const el = active === null ? null : changeRefs.current[active];
    if (!box || !el) { setPos(null); return; }
    const measure = () => {
      const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const half = (pop.current?.offsetWidth ?? 156) / 2;
      const x = Math.min(Math.max(r.left + r.width / 2 - b.left, half - 6), b.width - half + 6);
      const below = r.top - b.top < 34;
      setPos({ x, y: below ? r.bottom - b.top : r.top - b.top, below });
    };
    measure();
    // Words around it may still be shrinking or growing: follow them for a moment.
    let frame = 0;
    const until = performance.now() + 520;
    const tick = () => { measure(); if (performance.now() < until) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => { cancelAnimationFrame(frame); ro.disconnect(); };
  }, [active, decisions]);

  const onChangeKey = (i: number) => (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "y" || k === "Y" || k === "Enter") { e.preventDefault(); decide(i, "accepted", true); }
    else if (k === "n" || k === "N" || k === "Backspace") { e.preventDefault(); decide(i, "rejected", true); }
    else if (k === " ") { e.preventDefault(); setActive(i); }
    else if (k === "Escape") { e.stopPropagation(); highlight(null); }
  };

  // Y and N also work while a change is highlighted from the toolbar arrows.
  const onRootKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape" && active !== null) { highlight(null); return; }
    if (active === null) return;
    if (e.key === "y" || e.key === "Y") { e.preventDefault(); decide(active, "accepted"); }
    else if (e.key === "n" || e.key === "N") { e.preventDefault(); decide(active, "rejected"); }
  };

  let k = -1;
  const body = segments.map((s, si) => {
    if (s.type === "equal") return <span key={si}>{s.text}</span>;
    const i = ++k;
    const d = decisions[i] ?? "pending";
    const pending = d === "pending";
    const rm = words(s.remove);
    const add = words(s.insert);
    // The space after each side stays outside its wash and goes with it. A replacement at the
    // very end of the text has no space of its own, so it borrows one while both sides show.
    const rmTrail = rm.length ? rm[rm.length - 1]!.slice(rm[rm.length - 1]!.trimEnd().length) : "";
    const addGap = add.length ? add[add.length - 1]!.slice(add[add.length - 1]!.trimEnd().length) : "";
    const rmGap = rmTrail || (rm.length && add.length ? " " : "");
    return (
      <span
        key={si}
        ref={(el) => { changeRefs.current[i] = el; }}
        className={styles.change}
        data-state={d}
        data-active={active === i || undefined}
        role={pending ? "button" : undefined}
        tabIndex={pending ? 0 : undefined}
        aria-label={pending ? `Suggestion ${i + 1} of ${total}: ${describe(s)}. Press Y to accept, N to reject` : undefined}
        onFocus={pending ? () => setActive(i) : undefined}
        onClick={pending ? () => setActive(i) : undefined}
        onKeyDown={pending ? onChangeKey(i) : undefined}
      >
        {rm.length > 0 && (
          <>
            <del className={styles.removed} aria-hidden={d === "accepted" || undefined}>
              {rm.map((w, n) => <Word key={n} gone={d === "accepted"} text={n === rm.length - 1 ? w.trimEnd() : w} />)}
            </del>
            {rmGap && <Word gone={d === "accepted" || (d === "rejected" && !rmTrail)} text={rmGap} gap />}
          </>
        )}
        {add.length > 0 && (
          <>
            <ins className={styles.inserted} aria-hidden={d === "rejected" || undefined}>
              {add.map((w, n) => <Word key={n} gone={d === "rejected"} text={n === add.length - 1 ? w.trimEnd() : w} />)}
            </ins>
            {addGap && <Word gone={d === "rejected"} text={addGap} gap />}
          </>
        )}
      </span>
    );
  });

  const foot = (
    <Swap id={done ? "done" : "review"} className={styles.foot}>
      {done ? (
        <>
          <span className={styles.reviewed}><DrawCheck size={13} className={styles.check} />{total ? "All changes reviewed" : "No changes to review"}</span>
          <TraySpacer />
          <Key ref={undoRef} size="sm" variant="tertiary" disabled={!history.length} onClick={undo}><Undo2 />Undo</Key>
        </>
      ) : (
        <>
          <span className={styles.left}><RollNumber value={left} /> of {total} left</span>
          <TraySpacer />
          <IconKey label="Undo" size="sm" tooltip="top" disabled={!history.length} onClick={undo}><Undo2 /></IconKey>
          <span className={styles.steps}>
            <IconKey label="Previous change" size="sm" tooltip="top" onClick={() => step(-1)}><ChevronLeft /></IconKey>
            <IconKey label="Next change" size="sm" tooltip="top" onClick={() => step(1)}><ChevronRight /></IconKey>
          </span>
          <Key size="sm" variant="tertiary" onClick={() => decideAll("rejected")}>Reject all</Key>
          <CtaKey size="sm" intent="review" count={left} label={diffLabel(left)} proposal={proposedPrimary(cta, "review")} onClick={() => decideAll("accepted")} />
        </>
      )}
    </Swap>
  );

  return (
    <MotionConfig reducedMotion="user">
      <Tray
        ref={root}
        className={cx(styles.root, className)}
        aria-label={typeof label === "string" ? label : "Suggested edits"}
        title={label}
        meta={meta}
        foot={foot}
        onKeyDown={onRootKey}
        onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) setActive(null); }}
      >
        <div ref={textRef} className={styles.text}>
          {body}
          <AnimatePresence>
            {active !== null && pos && (
              <motion.div
                key="pop"
                ref={pop}
                className={styles.pop}
                data-below={pos.below || undefined}
                role="group"
                aria-label={`Suggestion ${active + 1}`}
                aria-describedby={`${uid}-hint`}
                onPointerDown={(e) => e.preventDefault()}
                initial={{ opacity: 0, x: pos.x, y: pos.y + (pos.below ? -4 : 4), filter: `blur(${motionTokens.blur.subtle}px)` }}
                animate={{ opacity: 1, x: pos.x, y: pos.y, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: reduce ? 0 : motionTokens.duration.exit, ease: motionTokens.ease.standard } }}
                transition={reduce ? { duration: 0 } : { x: motionTokens.spring.morph, y: motionTokens.spring.morph, opacity: { duration: motionTokens.duration.standard }, filter: { duration: motionTokens.duration.standard } }}
              >
                <Key size="sm" variant="secondary" tabIndex={-1} onClick={() => decide(active, "accepted", true)}>Accept<Kbd>Y</Kbd></Key>
                <Key size="sm" variant="tertiary" tabIndex={-1} onClick={() => decide(active, "rejected", true)}>Reject<Kbd>N</Kbd></Key>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <span id={`${uid}-hint`} className="visually-hidden">Press Y to accept, N to reject</span>
        <span className="visually-hidden" role="status" aria-live="polite">{said}</span>
      </Tray>
    </MotionConfig>
  );
});

/**
 * One word, or the space after a group, that can shrink to nothing and grow
 * back. Shrinking runs from its measured width to zero while it blurs out;
 * growing does the reverse. The settled state lives in CSS.
 */
function Word({ text, gone, gap }: { text: string; gone: boolean; gap?: boolean }) {
  const el = useRef<HTMLSpanElement>(null);
  const was = useRef(gone);
  const reduce = useReducedMotion();
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || was.current === gone) return;
    was.current = gone;
    if (reduce) return;
    const w = `${node.scrollWidth}px`;
    const shown = { maxWidth: w, opacity: 1, filter: "blur(0px)" };
    const hidden = { maxWidth: "0px", opacity: 0, filter: `blur(${motionTokens.blur.subtle}px)` };
    node.animate(gone ? [shown, hidden] : [hidden, shown], gone
      ? { duration: 300, easing: "cubic-bezier(.32, .72, .24, 1)" }
      : { duration: 420, easing: "cubic-bezier(.22, 1, .36, 1)" });
  }, [gone, reduce]);
  const body = gap ? text : <span className={styles.t}>{text.trimEnd()}</span>;
  const tail = gap ? null : text.slice(text.trimEnd().length);
  return <><span ref={el} className={styles.word} data-gone={gone || undefined}>{body}{tail}</span><wbr /></>;
}
