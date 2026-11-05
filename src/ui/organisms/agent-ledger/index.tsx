/**
 * AgentLedger: everything the agent changed in the project, each change with
 * an Undo that is honest about what goes with it.
 *
 * One row per change, newest first: what it did and where ("Speed · Onboarding
 * 0:31"), before and after ("1× → 1.5×"), and when. Pointing at or tabbing to
 * Undo lights the change and everything built on it: rows that would be undone
 * too say "Also undone", things that can't be taken back (a file written to
 * disk, an upload) say "Can't undo".
 *
 * Undo draws a line across each row, down the chain a beat after each other,
 * and the rows go quiet with Redo in their place. Rows never change height:
 * the time, Undo, Redo and the flags all share one slot. New changes open
 * their row at the top and then fade in.
 */
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { ArrowRight, Redo2, Undo2, Wand2 } from "lucide-react";
import { Key, Mark, RollNumber, Swap, Tag, useNow } from "@/ui/atoms";
import { Tray, TrayCard } from "@/ui/molecules/tray";
import { formatTime } from "@/editor/model";
import { motionTokens } from "@/ui/tokens/motion";
import styles from "./agent-ledger.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export interface LedgerEntry {
  id: string;
  /** What kind of change, one word: "Zoom", "Speed", "Cut", "Caption", "Export". */
  action: string;
  /** What it touched: "Create button". */
  target?: string;
  /** Where on the recording, in seconds: one moment or a span. Shown in the time face after the target. */
  position?: number | [start: number, end: number];
  icon?: ReactNode;
  /** When it happened, epoch ms. */
  at: number;
  /** Before and after, shown as before (struck) → after. */
  change?: [before: string, after: string];
  /** A single line instead of `change`: "Removed 9.0s". */
  detail?: string;
  /** False for things that can't be taken back: a file written to disk, an upload. No Undo. */
  reversible?: boolean;
  /** Ids of the changes this one builds on. Undoing one of those undoes this too, if it can be. */
  dependsOn?: string[];
}

export interface AgentLedgerProps {
  /** Every change, any order; newest shows first. */
  entries: LedgerEntry[];
  /** Who made the changes, next to the title. */
  agent?: string;
  /** The clock for "4m ago", epoch ms. Defaults to now, kept fresh. */
  now?: number;
  /** Controlled ids of undone changes. */
  undone?: string[];
  /** Starting undone ids when uncontrolled. */
  defaultUndone?: string[];
  /** The change and its reversible dependents were undone. Revert them. */
  onUndo?: (ids: string[]) => void;
  /** The change was redone, with what it needs and what was undone with it. Reapply them. */
  onRedo?: (ids: string[]) => void;
  /** Light a change and what builds on it, as if its Undo were pointed at. For walkthroughs. */
  pointAt?: string | null;
  /** Heading in the tray. */
  title?: string;
  className?: string;
}

type Lit = "self" | "also" | "cant";
type SlotState = "time" | "undo" | "redo" | "also" | "cant";

/** Walks a graph breadth first from `id`, nearest first. */
function walk(id: string, next: (id: string) => string[]) {
  const out: string[] = [];
  const queue = [...next(id)];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === id || out.includes(n)) continue;
    out.push(n);
    queue.push(...next(n));
  }
  return out;
}

export function AgentLedger({
  entries,
  agent = "Claude Code",
  now,
  undone,
  defaultUndone = [],
  onUndo,
  onRedo,
  pointAt,
  title = "Changes",
  className,
}: AgentLedgerProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const tick = useNow(now === undefined, 15000);
  const clock = now ?? tick;

  const [innerUndone, setInnerUndone] = useState(defaultUndone);
  const off = new Set(undone ?? innerUndone);
  const [pointed, setPointed] = useState<string | null>(null);
  const [order, setOrder] = useState(new Map<string, number>());
  const [announcement, setAnnouncement] = useState("");
  const refocus = useRef<{ entry: string; key: "undo" | "redo" } | null>(null);

  const byId = new Map(entries.map((e) => [e.id, e]));
  const rows = [...entries].sort((a, b) => b.at - a.at);
  const children = new Map<string, string[]>();
  for (const e of entries) for (const d of e.dependsOn ?? []) children.set(d, [...(children.get(d) ?? []), e.id]);
  const dependents = (x: string) => walk(x, (n) => children.get(n) ?? []);
  const ancestors = (x: string) => walk(x, (n) => (byId.get(n)?.dependsOn ?? []).filter((d) => byId.has(d)));
  const canUndo = (e: LedgerEntry) => e.reversible !== false;
  const name = (e: LedgerEntry) => [e.action, e.target].filter(Boolean).join(" ");

  /** What one Undo takes with it, in chain order, and what it can't. */
  const chainOf = (x: string) => {
    const deps = dependents(x).map((d) => byId.get(d)!);
    return {
      undo: [x, ...deps.filter((d) => canUndo(d) && !off.has(d.id)).map((d) => d.id)],
      cant: deps.filter((d) => !canUndo(d)).map((d) => d.id),
    };
  };

  const point = pointAt ?? pointed;
  const lit = new Map<string, Lit>();
  if (point && byId.has(point) && !off.has(point) && canUndo(byId.get(point)!)) {
    const chain = chainOf(point);
    chain.undo.forEach((x, i) => lit.set(x, i === 0 ? "self" : "also"));
    chain.cant.forEach((x) => lit.set(x, "cant"));
  }

  const setOff = (next: Set<string>) => { if (undone === undefined) setInnerUndone([...next]); };
  const focusWasIn = () => !!root.current?.contains(document.activeElement);

  const undo = (x: string) => {
    const chain = chainOf(x);
    const e = byId.get(x)!;
    setOrder(new Map(chain.undo.map((u, i) => [u, i])));
    setOff(new Set([...off, ...chain.undo]));
    onUndo?.(chain.undo);
    setPointed(null);
    if (focusWasIn()) refocus.current = { entry: x, key: "redo" };
    const also = chain.undo.length - 1;
    const cant = chain.cant.map((c) => byId.get(c)!.action).join(", ");
    setAnnouncement(`Undid ${name(e)}${also ? ` and ${also} change${also > 1 ? "s" : ""} built on it` : ""}.${cant ? ` Can't undo ${cant}.` : ""}`);
  };
  const redo = (x: string) => {
    const e = byId.get(x)!;
    const ids = [...ancestors(x).filter((a) => off.has(a)), x, ...dependents(x).filter((d) => off.has(d) && canUndo(byId.get(d)!))];
    const next = new Set(off);
    ids.forEach((i) => next.delete(i));
    setOff(next);
    onRedo?.(ids);
    if (focusWasIn()) refocus.current = { entry: x, key: "undo" };
    setAnnouncement(`Redid ${name(e)}.`);
  };

  // Undo turns into Redo (and back) in the same slot; keep focus on the row's key.
  useLayoutEffect(() => {
    if (!refocus.current) return;
    const { entry, key } = refocus.current;
    root.current?.querySelector<HTMLElement>(`[data-entry="${CSS.escape(entry)}"] [data-key="${key}"]`)?.focus({ preventScroll: true });
    refocus.current = null;
  });

  const slotOf = (e: LedgerEntry): SlotState => {
    const l = lit.get(e.id);
    if (l === "also" || l === "cant") return l;
    if (!canUndo(e)) return ancestors(e.id).some((a) => off.has(a)) ? "cant" : "time";
    return off.has(e.id) ? "redo" : "undo";
  };

  const open = reduce ? { duration: 0 } : motionTokens.spring.smooth;
  const fade = reduce ? { duration: 0 } : { duration: motionTokens.duration.standard, ease: motionTokens.ease.standard, delay: 0.16 };

  return (
    <MotionConfig reducedMotion="user">
      <Tray
        ref={root}
        bare
        className={cx(styles.ledger, className)}
        title={<>{title}<span className={styles.byline}><Mark size={13} title="" />{agent}</span></>}
        meta={<>
          <span><RollNumber value={entries.length} /> {entries.length === 1 ? "change" : "changes"}</span>
          {off.size > 0 && <span><RollNumber value={off.size} /> undone</span>}
        </>}
      >
        <TrayCard className={styles.card}>
          <ol className={styles.list} aria-label={title}>
            <AnimatePresence initial={false}>
              {rows.map((e) => {
                const deps = canUndo(e) ? chainOf(e.id).undo.length - 1 : 0;
                const state = slotOf(e);
                return (
                  <motion.li
                    key={e.id}
                    className={styles.item}
                    data-entry={e.id}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1, transition: { height: open, opacity: fade } }}
                    exit={{ height: 0, opacity: 0, transition: { height: open, opacity: { duration: motionTokens.duration.instant } } }}
                  >
                    <div
                      className={styles.row}
                      data-undone={off.has(e.id) || undefined}
                      data-lit={lit.get(e.id)}
                      data-irreversible={!canUndo(e) || undefined}
                      style={{ "--k": order.get(e.id) ?? 0 } as CSSProperties}
                    >
                      <span className={styles.icon} aria-hidden>{e.icon ?? <Wand2 />}</span>
                      <span className={styles.main}>
                        <span className={styles.what}>
                          <span className={styles.action}>{e.action}</span>
                          {e.target && <span className={styles.target}>{e.target}</span>}
                          {e.position !== undefined && <Position value={e.position} />}
                        </span>
                        <span className={styles.change}>
                          {e.change ? (
                            <>
                              <span className={styles.before}>{e.change[0]}</span>
                              <ArrowRight className={styles.arrow} aria-hidden />
                              <span className="visually-hidden"> to </span>
                              <span className={styles.after}>{e.change[1]}</span>
                            </>
                          ) : (
                            <span className={styles.after}>{e.detail}</span>
                          )}
                        </span>
                        <span className={styles.strike} aria-hidden />
                      </span>
                      <span className={styles.slot} data-state={state}>
                        <Swap id={state === "undo" || state === "time" ? "base" : state} className={styles.swap}>
                          {state === "undo" ? (
                            <span className={styles.pair}>
                              <Ago at={e.at} now={clock} className={styles.pairTime} />
                              <Key
                                size="sm"
                                variant="tertiary"
                                data-key="undo"
                                className={styles.key}
                                aria-label={`Undo ${name(e)}${deps ? `, and ${deps} change${deps > 1 ? "s" : ""} built on it` : ""}`}
                                onClick={() => undo(e.id)}
                                onPointerEnter={() => setPointed(e.id)}
                                onPointerLeave={() => setPointed(null)}
                                onFocus={() => setPointed(e.id)}
                                onBlur={() => setPointed(null)}
                              >
                                <Undo2 aria-hidden />Undo
                              </Key>
                            </span>
                          ) : state === "redo" ? (
                            <Key size="sm" variant="tertiary" data-key="redo" className={styles.key} aria-label={`Redo ${name(e)}`} onClick={() => redo(e.id)}>
                              <Redo2 aria-hidden />Redo
                            </Key>
                          ) : state === "also" ? (
                            <Tag size="sm">Also undone</Tag>
                          ) : state === "cant" ? (
                            <Tag size="sm" tone="rec">Can't undo</Tag>
                          ) : (
                            <Ago at={e.at} now={clock} />
                          )}
                        </Swap>
                      </span>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </TrayCard>
        <span id={`${id}-status`} className="visually-hidden" role="status" aria-live="polite">{announcement}</span>
      </Tray>
    </MotionConfig>
  );
}

/* ───────────────────────── Parts ───────────────────────── */

/** "0:12" or "0:42–0:51", in the time face. */
function Position({ value }: { value: number | [number, number] }) {
  return <span className={styles.position}>{Array.isArray(value) ? `${formatTime(value[0])}–${formatTime(value[1])}` : formatTime(value)}</span>;
}

/** "just now", then "4m ago" with the number in the time face. */
function Ago({ at, now, className }: { at: number; now: number; className?: string }) {
  const m = Math.floor(Math.max(0, now - at) / 60000);
  if (m < 1) return <span className={cx(styles.ago, className)}>just now</span>;
  return <span className={cx(styles.ago, className)}><span className={styles.agoTime}>{m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`}</span> ago</span>;
}
