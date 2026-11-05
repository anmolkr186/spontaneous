/**
 * AgentCheckpoints: the agent's edits as a line of checkpoints, like version
 * history for a cut.
 *
 * Each checkpoint is a skewed cell on a vertical line, with what the agent had
 * just done ("Cut dead air"), when in the run it was saved, and how many edits
 * it holds. The way from the first checkpoint to the one the agent stands on
 * (head) is drawn in the light color; anything off that way fades back. Rewind
 * on any checkpoint and a new lane bends out of it and draws itself down to
 * the new attempt; the attempt you left goes gray but stays, so nothing is
 * lost and you can go back to it.
 *
 * One tab stop: ↑/↓, Home and End move between checkpoints; Enter or Space
 * rewinds to the focused one.
 */
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { GitCommitVertical, RotateCcw } from "lucide-react";
import { Cell, Key, RollNumber, Shimmer, Tag } from "@/ui/atoms";
import type { CellVariant } from "@/ui/atoms";
import { Tray } from "@/ui/molecules/tray";
import { formatTime as formatPosition } from "@/editor/model";
import { AutoHeight } from "@/ui/atoms";
import styles from "./agent-checkpoints.module.css";

export type CheckpointStatus = "running" | "done" | "failed" | "stopped";

export interface Checkpoint {
  id: string;
  /** What the agent had just done: "Cut dead air". */
  title: string;
  /** The checkpoint this one follows. Defaults to the one before it in the list. One whose parent already has a later checkpoint starts a new attempt on its own lane. */
  parent?: string;
  /** Running shimmers; failed gets a tag; stopped means you rewound away while the agent worked toward it. Default "done". */
  status?: CheckpointStatus;
  /** When in the run it was saved, in seconds. */
  at?: number;
  /** How many edits it holds. */
  edits?: number;
}

export interface AgentCheckpointsProps {
  /** In the order they were taken. Pass them again whenever one is added or changes. */
  checkpoints: Checkpoint[];
  /** The checkpoint the agent stands on. Defaults to the last one. */
  head?: string;
  /** Rewind was pressed: add a checkpoint with this one as its parent and move head to it. */
  onRewind?: (checkpoint: Checkpoint) => void;
  /** What the run is for, next to the title. */
  task?: string;
  /** Heading of the tray. Default "Checkpoints". */
  title?: string;
  /** Formats `at`. Default "0:42". */
  formatTime?: (seconds: number) => string;
  className?: string;
}

/** Row height and lane spacing in px. Rows never change height, so the line can be drawn without measuring. */
const ROW = 36;
const LANE = 14;
const PAD = 10;
const GAP = 6;

interface Placed { cp: Checkpoint; index: number; lane: number; parent?: Placed }

/** Puts each checkpoint on a lane: it stays on its parent's lane unless that lane already moved on. */
function place(checkpoints: Checkpoint[]) {
  const byId = new Map<string, Placed>();
  const hasChild = new Set<string>();
  let lanes = 0;
  const placed = checkpoints.map((cp, index) => {
    const parentId = cp.parent ?? checkpoints[index - 1]?.id;
    const parent = parentId ? byId.get(parentId) : undefined;
    const lane = !parent || hasChild.has(parent.cp.id) ? lanes++ : parent.lane;
    if (parent) hasChild.add(parent.cp.id);
    const p: Placed = { cp, index, lane, parent };
    byId.set(cp.id, p);
    return p;
  });
  return { placed, lanes: Math.max(lanes, 1) };
}

const x = (lane: number) => PAD + lane * LANE;
const y = (index: number) => index * ROW + ROW / 2;

/** The line from a checkpoint's parent down to it: straight on the same lane, bending out onto a new one. */
function edgePath(child: Placed, parent: Placed) {
  const x1 = x(parent.lane), y1 = y(parent.index) + GAP, x2 = x(child.lane), y2 = y(child.index) - GAP;
  if (x1 === x2) return `M${x1} ${y1}V${y2}`;
  const bendEnd = Math.min(y(parent.index) + ROW - GAP, y2);
  const mid = (y1 + bendEnd) / 2;
  return `M${x1} ${y1}C${x1} ${mid} ${x2} ${mid} ${x2} ${bendEnd}V${y2}`;
}

const STATUS_WORDS: Record<CheckpointStatus, string> = { running: "in progress", done: "saved", failed: "failed", stopped: "stopped" };

export function AgentCheckpoints({ checkpoints, head: headProp, onRewind, task, title = "Checkpoints", formatTime = formatPosition, className }: AgentCheckpointsProps) {
  const { placed, lanes } = place(checkpoints);
  const headId = headProp ?? checkpoints.at(-1)?.id;
  const head = placed.find((p) => p.cp.id === headId);
  const onPath = new Set<string>();
  for (let p = head; p; p = p.parent) onPath.add(p.cp.id);
  const totalEdits = [...onPath].reduce((sum, id) => sum + (placed.find((p) => p.cp.id === id)?.cp.edits ?? 0), 0);

  // Rows and lines present at first render arrive one after another; later ones arrive at once.
  const [atMount] = useState(() => new Set(checkpoints.map((c) => c.id)));
  const delay = (p: Placed) => (atMount.has(p.cp.id) ? p.index * 60 : 0);

  const headIndex = head?.index ?? 0;
  const [focus, setFocus] = useState(headIndex);
  const [lastHead, setLastHead] = useState(headId);
  if (lastHead !== headId) { setLastHead(headId); setFocus(headIndex); }
  const active = Math.min(focus, placed.length - 1);

  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // Keep the checkpoint the agent stands on in view when the list scrolls, and
  // when head moves while focus is in the list (a rewind from the keyboard), take focus with it.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !head) return;
    const top = head.index * ROW, bottom = top + ROW;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    if (el.contains(document.activeElement)) rows.current[head.index]?.focus({ preventScroll: true });
  }, [headId, placed.length]);

  const canRewind = (p: Placed) => !!onRewind && p.cp.id !== headId && (p.cp.status ?? "done") !== "running";

  const moveTo = (i: number) => {
    const next = Math.max(0, Math.min(placed.length - 1, i));
    setFocus(next);
    rows.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    const keys: Record<string, number> = { ArrowUp: active - 1, ArrowDown: active + 1, Home: 0, End: placed.length - 1 };
    if (e.key in keys) { e.preventDefault(); moveTo(keys[e.key]!); return; }
    if (e.key === "Enter" || e.key === " ") {
      const p = placed[active];
      if (p && canRewind(p)) { e.preventDefault(); onRewind!(p.cp); }
    }
  };

  const attempts = lanes;
  // Kept in list order: moving a path in the DOM would restart its draw.
  const edges = placed.filter((p) => p.parent);

  return (
    <Tray
      className={className}
      aria-labelledby={headingId}
      title={<><GitCommitVertical /><span id={headingId} className={styles.heading}>{title}</span>{task && <span className={styles.task}>{task}</span>}</>}
      meta={<span><RollNumber value={checkpoints.length} /> saved</span>}
      foot={
        <span className={styles.foot} role="status" aria-live="polite">
          <RollNumber value={totalEdits} /> {totalEdits === 1 ? "edit" : "edits"} on this version
          {attempts > 1 && <span className={styles.attempts}><RollNumber value={attempts} /> attempts</span>}
        </span>
      }
    >
      <AutoHeight>
        <div ref={scroller} className={styles.scroller} style={{ "--gutter": `${x(lanes - 1) + 16}px`, "--row": `${ROW}px` } as CSSProperties}>
          <svg className={styles.lines} width={x(lanes - 1) + PAD} height={placed.length * ROW} aria-hidden>
            {edges.map((p) => (
              <path
                key={p.cp.id}
                d={edgePath(p, p.parent!)}
                pathLength={1}
                className={styles.edge}
                data-on-path={onPath.has(p.cp.id) || undefined}
                style={{ "--d": `${delay(p) + 60}ms` } as CSSProperties}
              />
            ))}
          </svg>
          <ol className={styles.list} aria-labelledby={headingId} onKeyDown={onKeyDown}>
            {placed.map((p) => {
              const status = p.cp.status ?? "done";
              const current = p.cp.id === headId;
              const behind = !onPath.has(p.cp.id);
              const rewind = canRewind(p);
              return (
                <li
                  key={p.cp.id}
                  ref={(el) => { rows.current[p.index] = el; }}
                  className={styles.row}
                  tabIndex={p.index === active ? 0 : -1}
                  aria-current={current ? "step" : undefined}
                  aria-label={`${p.cp.title}, attempt ${p.lane + 1}, ${STATUS_WORDS[status]}${current ? ", current" : behind ? ", left behind" : ""}${p.cp.edits !== undefined ? `, ${p.cp.edits} edits` : ""}`}
                  data-status={status}
                  data-current={current || undefined}
                  data-behind={behind || undefined}
                  data-new={!atMount.has(p.cp.id) || undefined}
                  data-rewind={rewind || undefined}
                  style={{ "--x": `${x(p.lane)}px`, "--d": `${delay(p)}ms` } as CSSProperties}
                  onFocus={() => setFocus(p.index)}
                >
                  <Cell variant={nodeVariant(status, behind)} size={8} className={styles.node} />
                  <span className={styles.title}>
                    <Shimmer active={status === "running"}>{p.cp.title}</Shimmer>
                  </span>
                  {status === "failed" && <Tag size="sm" tone="rec">Failed</Tag>}
                  {status === "stopped" && <Tag size="sm">Stopped</Tag>}
                  <span className={styles.slot}>
                    <span className={styles.info} aria-hidden>
                      {p.cp.edits !== undefined && <span className={styles.edits}>{p.cp.edits} {p.cp.edits === 1 ? "edit" : "edits"}</span>}
                      {p.cp.at !== undefined && <span className={styles.time}>{formatTime(p.cp.at)}</span>}
                    </span>
                    {rewind && (
                      <Key size="sm" variant="secondary" tabIndex={-1} aria-hidden className={styles.rewind} onPointerDown={(e) => e.preventDefault()} onClick={() => onRewind!(p.cp)}>
                        <RotateCcw />Rewind
                      </Key>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </AutoHeight>
    </Tray>
  );
}

function nodeVariant(status: CheckpointStatus, behind: boolean): CellVariant {
  if (status === "failed") return behind ? "muted" : "rec";
  if (status === "running") return "hollow";
  if (status === "stopped" || behind) return "muted";
  return "solid";
}
