/**
 * ContextWindow: what fills the agent's context right now, as a field of cells.
 *
 * Reads top to bottom: how much is used ("48.2k of 200k") and its share, a
 * field of skewed cells filled part by part in order, then one row per part:
 * the system prompt (locked), tools, the project outline, the transcript, your
 * notes, the frames it looked at, and the conversation. Parts are told apart
 * by graphite level; your notes take the ink.
 *
 * Pointing at a part (its row or its cells) fades the other cells and rolls
 * the big number to that part. Any change sweeps through the field cell by
 * cell from where it starts. Removing a frame folds its row away and empties
 * its cells left to right. Compact makes the part's cells shimmer in a wave
 * while it works, then most of them clear, the numbers roll down, and the key
 * turns into a drawn check that fades.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import { ChevronRight, Lock, Shrink, X } from "lucide-react";
import { Cell, DrawCheck, Fold, IconKey, Key, RaySpinner, RollNumber, RollText, Swap, Tag, Timecode } from "@/ui/atoms";
import { Tray, TraySpacer } from "@/ui/molecules/tray";
import { formatTime } from "@/editor/model";
import { motionTokens } from "@/ui/tokens/motion";
import styles from "./context-window.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** A graphite level from the ramp, or `ink` for what you made yourself (notes). */
export type ContextTone = "ink" | 100 | 200 | 300 | 400 | 500 | 600;
export interface ContextItem {
  id: string;
  label: string;
  tokens: number;
  /** A moment on the recording, shown in the time face after the label ("Frame 0:12"). */
  at?: number;
}
export interface ContextPart {
  id: string;
  label: string;
  /** Size in tokens. Defaults to the sum of `items`. */
  tokens?: number;
  /** Things in this part that can be dropped one by one, e.g. frames the agent looked at. */
  items?: ContextItem[];
  /** Can't be changed from here, e.g. the system prompt. */
  locked?: boolean;
  /** Offers Compact, e.g. the conversation. */
  compact?: boolean;
  /** Graphite level for its cells. Defaults to the ramp, dim to bright, in order. */
  tone?: ContextTone;
}

export interface ContextWindowProps {
  /** What fills the context. They fill the field in this order. */
  parts: ContextPart[];
  /** Size of the context window in tokens. */
  limit: number;
  /** Heading in the tray. */
  title?: string;
  /** Small tag in the tray head, e.g. the model. */
  model?: string;
  /** An item was removed. With it the card shows exactly what you pass; without it the removal lives in the card. */
  onRemoveItem?: (partId: string, itemId: string) => void;
  /** Compact was pressed. Return a promise: the cells shimmer until it settles. Without it the part shrinks on its own. */
  onCompact?: (partId: string) => void | Promise<unknown>;
  /** A key on the tray foot, e.g. New chat. */
  action?: { label: string; onClick: () => void };
  /** Share of the limit from which the percentage turns foreground with a tag and the tray says how much is left. */
  warnAt?: number;
  /** Cells in the field. */
  cells?: number;
  /** Cells per row. */
  columns?: number;
  /** Light a part as if it were pointed at. For walkthroughs. */
  pointAt?: string | null;
  className?: string;
}

const RAMP: ContextTone[] = [600, 500, 400, 300, 200, 100];
const toneVar = (t: ContextTone) => (t === "ink" ? "var(--ink)" : `var(--g-${t})`);
/** Tokens in tenths of a thousand, so a number can roll: 482 reads "48.2k". */
const tenths = (n: number) => Math.round(n / 100);
const k = (t: number) => `${(t / 10).toFixed(1)}k`;
const short = (n: number) => k(tenths(n)).replace(".0k", "k");
/** Share of the window a compacted part keeps when the card compacts it on its own. */
const COMPACT_SHARE = 0.22;
const SHOW_DONE = 1800;

type Compaction = { state: "busy" | "done"; before: number; after?: number };

export function ContextWindow({
  parts,
  limit,
  title = "Context",
  model,
  onRemoveItem,
  onCompact,
  action,
  warnAt = 0.8,
  cells = 216,
  columns = 36,
  pointAt,
  className,
}: ContextWindowProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [shrunk, setShrunk] = useState<Record<string, { base: number; to: number }>>({});
  const [compaction, setCompaction] = useState<Record<string, Compaction>>({});
  const [settled, setSettled] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pointed, setPointed] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const refocus = useRef<string | null>(null);

  // What the card shows: props, less what was removed or compacted here.
  let ramp = 0;
  const view = parts.map((p) => {
    const items = p.items?.filter((i) => onRemoveItem || !removed.has(`${p.id}/${i.id}`));
    const gone = p.items && !onRemoveItem ? p.items.filter((i) => removed.has(`${p.id}/${i.id}`)).reduce((s, i) => s + i.tokens, 0) : 0;
    const raw = (p.tokens ?? p.items?.reduce((s, i) => s + i.tokens, 0) ?? 0) - gone;
    const sh = shrunk[p.id];
    const tokens = Math.max(0, sh ? sh.to + Math.max(0, raw - sh.base) : raw);
    const tone = p.tone ?? RAMP[Math.min(ramp++, RAMP.length - 1)]!;
    return { ...p, items, tokens, tone };
  });
  const used = view.reduce((s, p) => s + p.tokens, 0);
  const share = limit > 0 ? used / limit : 0;

  // Which part each cell belongs to, filling in order. Any part with tokens gets at least one cell.
  const owner: number[] = new Array(cells).fill(-1);
  let cursor = 0, acc = 0;
  view.forEach((p, i) => {
    acc += p.tokens;
    const end = Math.min(cells, Math.max(cursor + (p.tokens > 0 ? 1 : 0), Math.round((acc / Math.max(limit, 1)) * cells)));
    for (let c = cursor; c < end; c++) owner[c] = i;
    cursor = Math.max(cursor, end);
  });

  // A change sweeps from the first cell that changed hands.
  const keys = owner.map((o) => (o < 0 ? "" : view[o]!.id));
  const prev = useRef<string[] | null>(null);
  const sweep = useRef(0);
  if (prev.current) {
    const first = keys.findIndex((key, i) => key !== prev.current![i]);
    if (first !== -1) sweep.current = first;
  }
  useLayoutEffect(() => { prev.current = keys; });

  // A compaction finishes once the new size has arrived: note it, and say what it saved.
  useEffect(() => {
    for (const p of view) {
      const c = compaction[p.id];
      if (c?.state === "done" && c.after === undefined) {
        setCompaction((all) => ({ ...all, [p.id]: { ...c, after: p.tokens } }));
        setSettled((all) => ({ ...all, [p.id]: p.tokens }));
        setSaid(`Compacted ${p.label}, saved ${short(Math.max(0, c.before - p.tokens))}. ${short(Math.max(0, limit - used))} left.`);
      }
    }
  });

  const compact = async (p: (typeof view)[number]) => {
    if (Object.values(compaction).some((c) => c.state === "busy")) return;
    setCompaction((all) => ({ ...all, [p.id]: { state: "busy", before: p.tokens } }));
    setSaid(`Compacting ${p.label}.`);
    try {
      if (onCompact) await onCompact(p.id);
      else {
        await new Promise((r) => window.setTimeout(r, 1400));
        const raw = parts.find((x) => x.id === p.id);
        const base = (raw?.tokens ?? raw?.items?.reduce((s, i) => s + i.tokens, 0) ?? p.tokens);
        setShrunk((all) => ({ ...all, [p.id]: { base, to: Math.round(p.tokens * COMPACT_SHARE) } }));
      }
    } catch {
      setCompaction((all) => { const { [p.id]: _, ...rest } = all; return rest; });
      setSaid(`Couldn't compact ${p.label}.`);
      return;
    }
    setCompaction((all) => ({ ...all, [p.id]: { state: "done", before: p.tokens } }));
    window.setTimeout(() => {
      if (root.current?.querySelector(`[data-compact="${CSS.escape(p.id)}"]`)?.contains(document.activeElement)) root.current.focus({ preventScroll: true });
      setCompaction((all) => { const { [p.id]: _, ...rest } = all; return rest; });
    }, SHOW_DONE);
  };

  const remove = (part: string, item: ContextItem, label: string) => {
    // Keep focus in the list: the next item's remove key, else the previous, else the part.
    const list = view.find((p) => p.id === part)?.items ?? [];
    const at = list.findIndex((i) => i.id === item.id);
    const neighbour = list[at + 1] ?? list[at - 1];
    if (root.current?.contains(document.activeElement)) refocus.current = neighbour ? `[data-remove="${CSS.escape(`${part}/${neighbour.id}`)}"]` : `[data-part-toggle="${CSS.escape(part)}"]`;
    if (onRemoveItem) onRemoveItem(part, item.id);
    else setRemoved((r) => new Set(r).add(`${part}/${item.id}`));
    setSaid(`Removed ${label}.`);
  };
  useLayoutEffect(() => {
    if (!refocus.current) return;
    root.current?.querySelector<HTMLElement>(refocus.current)?.focus({ preventScroll: true });
    refocus.current = null;
  });

  const point = pointAt ?? pointed;
  const lit = view.find((p) => p.id === point);
  const shown = lit ? lit.tokens : used;
  const pct = Math.round((lit ? lit.tokens / Math.max(limit, 1) : share) * 100);
  const warn = !lit && share >= warnAt;
  const full = share >= 0.95;
  const busyPart = view.find((p) => compaction[p.id]?.state === "busy");
  const left = Math.max(0, limit - used);
  const foot = busyPart ? `Compacting ${busyPart.label.toLowerCase()}` : warn ? `${full ? "Full" : "Almost full"} · ${short(left)} left` : `${short(left)} left`;
  const fieldStyle = { "--cols": columns } as CSSProperties;
  const fold = reduce ? { duration: 0 } : motionTokens.spring.smooth;

  return (
    <MotionConfig reducedMotion="user">
      <Tray
        ref={root}
        tabIndex={-1}
        role="group"
        aria-label={title}
        className={cx(styles.context, className)}
        data-warn={warn || undefined}
        title={title}
        meta={model && <Tag size="sm">{model}</Tag>}
        foot={<>
          <span className={styles.status} aria-hidden>{busyPart && <RaySpinner size={12} />}<RollText text={foot} shimmer={!!busyPart} /></span>
          <TraySpacer />
          {action && <Key size="sm" variant="secondary" onClick={action.onClick}>{action.label}</Key>}
        </>}
      >
        <div className={styles.body}>
          <div className={styles.total}>
            <span className={styles.big} aria-hidden>
              <RollNumber value={tenths(shown)} format={k} className={styles.bigNumber} />
              <span className={styles.of}>of {short(limit)}</span>
            </span>
            <span className={styles.share} aria-hidden data-warn={warn || undefined}>
              <span className={styles.shareLabel}><RollText text={lit ? lit.label : "used"} /></span>
              <RollNumber value={pct} format={(n) => `${n}%`} className={styles.pct} />
              <AnimatePresence initial={false}>
                {warn && <motion.span key="warn" className={styles.warnTag} initial={{ opacity: 0, filter: "blur(2px)", y: 3 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} exit={{ opacity: 0, filter: "blur(2px)" }}><Tag size="sm">{full ? "Full" : "Almost full"}</Tag></motion.span>}
              </AnimatePresence>
            </span>
            <span className="visually-hidden">{used.toLocaleString("en-US")} of {limit.toLocaleString("en-US")} tokens used, {Math.round(share * 100)}%.</span>
          </div>

          <div
            className={styles.field}
            style={fieldStyle}
            data-pointing={lit ? true : undefined}
            aria-hidden
            onPointerOver={(e) => { if (e.target !== e.currentTarget) setPointed((e.target as HTMLElement).dataset.part ?? null); }}
            onPointerLeave={() => setPointed(null)}
          >
            {owner.map((o, i) => {
              const p = o < 0 ? null : view[o]!;
              const wave = !!p && compaction[p.id]?.state === "busy";
              return (
                <Cell
                  key={i}
                  className={styles.cell}
                  data-part={p?.id}
                  data-on={(lit && p?.id === lit.id) || undefined}
                  data-wave={wave || undefined}
                  style={{ "--tone": p ? toneVar(p.tone) : undefined, "--d": Math.max(0, i - sweep.current), "--col": i % columns } as CSSProperties}
                />
              );
            })}
          </div>

          <ul className={styles.parts}>
            {view.map((p) => {
              const c = compaction[p.id];
              const grown = settled[p.id] === undefined || p.tokens > settled[p.id]!;
              const offer = p.compact && !p.locked && (!!c || grown);
              const listId = `${id}-${p.id}`;
              const isOpen = open.has(p.id);
              const name = (
                <>
                  <Cell size={7} className={styles.legend} style={{ "--tone": toneVar(p.tone) } as CSSProperties} />
                  <span className={styles.partLabel}>{p.label}</span>
                </>
              );
              return (
                <li
                  key={p.id}
                  className={styles.part}
                  data-dim={(lit && lit.id !== p.id) || undefined}
                  onPointerEnter={() => setPointed(p.id)}
                  onPointerLeave={() => setPointed(null)}
                  onFocus={() => setPointed(p.id)}
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPointed(null); }}
                >
                  <div className={styles.partRow}>
                    {p.items ? (
                      <button type="button" className={styles.partName} data-part-toggle={p.id} aria-expanded={isOpen} aria-controls={listId}
                        onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                        {name}
                        <span className={styles.itemCount}>{p.items.length}</span>
                        <ChevronRight className={styles.chevron} aria-hidden />
                      </button>
                    ) : (
                      <span className={styles.partName}>{name}</span>
                    )}
                    {p.locked && <span className={styles.locked}><Lock aria-hidden /><span className="visually-hidden">Locked</span></span>}
                    <TraySpacer />
                    <AnimatePresence initial={false}>
                      {offer && (
                        <motion.span key="compact" className={styles.compactSlot} data-compact={p.id} exit={{ opacity: 0, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.considered } }}>
                          <CompactKey state={c?.state} label={p.label} onCompact={() => void compact(p)} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <span className={styles.partTokens}><RollNumber value={tenths(p.tokens)} format={k} /></span>
                  </div>

                  {p.items && (
                    <Fold open={isOpen} id={listId}>
                      <ul className={styles.items}>
                        <AnimatePresence initial={false}>
                          {p.items.map((item) => {
                            const label = item.at !== undefined ? `${item.label} ${formatTime(item.at)}` : item.label;
                            return (
                              <motion.li
                                key={item.id}
                                className={styles.item}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1, transition: { height: fold, opacity: { duration: motionTokens.duration.standard, delay: 0.1 } } }}
                                exit={{ height: 0, opacity: 0, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { height: fold, opacity: { duration: motionTokens.duration.fast } } }}
                              >
                                <span className={styles.itemRow}>
                                  <span className={styles.itemLabel}>{item.label}{item.at !== undefined && <Timecode value={item.at} className={styles.itemTime} />}</span>
                                  <span className={styles.itemTokens}>{short(item.tokens)}</span>
                                  <IconKey size="sm" label={`Remove ${label}`} tooltip={false} data-remove={`${p.id}/${item.id}`} className={styles.remove} onClick={() => remove(p.id, item, label)}><X /></IconKey>
                                </span>
                              </motion.li>
                            );
                          })}
                        </AnimatePresence>
                      </ul>
                    </Fold>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <span className="visually-hidden" role="status" aria-live="polite">{said}</span>
      </Tray>
    </MotionConfig>
  );
}

/* ───────────────────────── Compact key ───────────────────────── */

/**
 * Compact → Compacting (rays, a band of light over the label) → a drawn check
 * with "Compacted", which then fades away with its slot.
 */
function CompactKey({ state, label, onCompact }: { state?: "busy" | "done"; label: string; onCompact: () => void }) {
  const icon: Record<string, ReactNode> = { idle: <Shrink />, busy: <RaySpinner size={13} />, done: <DrawCheck size={13} className={styles.done} /> };
  const s = state ?? "idle";
  return (
    <Key
      size="sm"
      variant="tertiary"
      className={styles.compact}
      data-state={s}
      aria-busy={s === "busy" || undefined}
      aria-disabled={s !== "idle" || undefined}
      aria-label={s === "idle" ? `Compact ${label.toLowerCase()}` : undefined}
      onClick={() => { if (s === "idle") onCompact(); }}
    >
      <span className={styles.compactIcon}><Swap id={s}>{icon[s]}</Swap></span>
      <RollText text={s === "idle" ? "Compact" : s === "busy" ? "Compacting" : "Compacted"} shimmer={s === "busy"} />
    </Key>
  );
}
