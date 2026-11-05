/**
 * ToolCall: one line per call the agent makes to the editor. It reads as a
 * sentence: an icon tile, what the call does in plain words ("Added a zoom"),
 * a short summary ("0:11.2–0:16.6 · 1.8×") and how long it took. While it runs
 * the title shimmers and the clock ticks; when it lands the rays turn into a
 * check that draws itself.
 *
 * The line folds open to what the agent asked for and what came back, as
 * labelled rows ("Scale 1.8×", "Range 0:11.2 – 0:16.6"), never as raw JSON.
 * Copy still copies the JSON, for bug reports. A failed call opens itself to
 * show the error and a Retry key.
 *
 * ToolCallGroup gathers the calls of one turn under a single quiet line:
 * "Used 3 tools · 1 failed · 2.7s", with the tools' icons stacked beside it.
 */
import { Children, isValidElement, useEffect, useId, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, CircleAlert, Copy, Crosshair, Eye, Film, Gauge, RotateCcw, Scissors, Search, Type, Video, Wrench, ZoomIn } from "lucide-react";
import { Duration, Fold, IconKey, Key, RollText, StatusGlyph, Swap, formatDuration } from "@/ui/atoms";
import { blurIn, motionTokens } from "@/ui/tokens/motion";
import styles from "./tool-call.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ───────────────────────── Tool names ───────────────────────── */

export interface ToolMeta {
  /** Once it has landed: "Added a zoom". */
  done: string;
  /** While it runs: "Adding a zoom". */
  doing: string;
  /** Plain request, used when it failed: "Add a zoom". */
  ask: string;
  icon: ReactNode;
}

/** What each editor tool is called in words. Same wording as the agent thread's steps. */
export const TOOLS: Record<string, ToolMeta> = {
  get_project: { done: "Read the project", doing: "Reading the project", ask: "Read the project", icon: <Search /> },
  get_input_events: { done: "Read clicks and focus", doing: "Reading clicks and focus", ask: "Read clicks and focus", icon: <Crosshair /> },
  render_frame: { done: "Looked at the frame", doing: "Looking at the frame", ask: "Look at the frame", icon: <Eye /> },
  add_zoom: { done: "Added a zoom", doing: "Adding a zoom", ask: "Add a zoom", icon: <ZoomIn /> },
  update_zoom: { done: "Adjusted a zoom", doing: "Adjusting a zoom", ask: "Adjust a zoom", icon: <ZoomIn /> },
  remove_zoom: { done: "Removed an auto zoom", doing: "Removing an auto zoom", ask: "Remove an auto zoom", icon: <ZoomIn /> },
  add_overlay: { done: "Added an overlay", doing: "Adding an overlay", ask: "Add an overlay", icon: <Type /> },
  set_speed: { done: "Changed speed", doing: "Changing speed", ask: "Change speed", icon: <Gauge /> },
  cut: { done: "Cut a section", doing: "Cutting a section", ask: "Cut a section", icon: <Scissors /> },
  set_shot: { done: "Changed the shot", doing: "Changing the shot", ask: "Change the shot", icon: <Film /> },
  set_motion: { done: "Retuned the camera", doing: "Retuning the camera", ask: "Retune the camera", icon: <Video /> },
};

const humanize = (key: string) => {
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The words and icon for a tool; unknown tools get their name in plain words and a wrench. */
export function toolMeta(name: string): ToolMeta {
  const known = TOOLS[name];
  if (known) return known;
  const words = humanize(name);
  return { done: words, doing: words, ask: words, icon: <Wrench /> };
}

/* ───────────────────────── Values in words ───────────────────────── */

/** A position in the recording with tenths when they matter: "0:11.2", "1:04". */
export function formatAt(t: number) {
  const ds = Math.round(Math.max(0, t) * 10);
  const m = Math.floor(ds / 600);
  const s = Math.floor((ds % 600) / 10);
  const d = ds % 10;
  return `${m}:${String(s).padStart(2, "0")}${d ? `.${d}` : ""}`;
}

function At({ t }: { t: number }) {
  return <span className={styles.time}>{formatAt(t)}</span>;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const TIME_KEYS = new Set(["start", "end", "at", "from", "to", "t", "time"]);
const LENGTH_KEYS = new Set(["removed", "duration", "length", "seconds"]);
/** Bookkeeping the agent uses internally; it means nothing to the person reading. */
const HIDDEN_KEYS = new Set(["undo"]);
const LABELS: Record<string, string> = {
  at: "At", scale: "Scale", speed: "Speed", target: "Focus", label: "Label", shot: "Shot", amount: "Movement",
  kind: "Kind", fields: "Reads", clicks: "Clicks", focus: "Focused on", removed: "Removed", id: "Edit", ok: "Status",
  duration: "Length", length: "Length", zooms: "Zooms", overlays: "Overlays", notes: "Notes",
};

function valueOf(key: string, v: unknown): ReactNode {
  if (num(v)) {
    if (TIME_KEYS.has(key)) return <At t={v} />;
    if (LENGTH_KEYS.has(key)) return <span className={styles.time}>{formatDuration(v * 1000)}</span>;
    if (key === "scale" || key === "speed") return `${v}×`;
    if (key === "amount") return `${Math.round(v * 100)}%`;
    return String(v);
  }
  if (typeof v === "boolean") return key === "ok" ? (v ? "Done" : "Not done") : v ? "Yes" : "No";
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "None";
  if (Array.isArray(v)) {
    if (!v.length) return "None";
    if (v.every(num) && (key === "clicks" || TIME_KEYS.has(key))) return v.map((t, i) => <span key={i}>{i > 0 && ", "}<At t={t} /></span>);
    return v.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(", ");
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (num(o.x) && num(o.y) && key === "target") return `${Math.round(o.x * 100)}% across, ${Math.round(o.y * 100)}% down`;
    return Object.entries(o).map(([k, inner], i) => <span key={k}>{i > 0 && " · "}{LABELS[k] ?? humanize(k)} {valueOf(k, inner)}</span>);
  }
  return String(v);
}

interface Row { key: string; label: string; value: ReactNode }

/** Turns arguments or a result into labelled rows. A start and end become one Range row. */
function toRows(value: unknown): Row[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [{ key: "value", label: "Value", value: valueOf("value", value) }];
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => !HIDDEN_KEYS.has(k) && o[k] !== undefined);
  const rows: Row[] = [];
  const used = new Set<string>();
  for (const [a, b] of [["start", "end"], ["from", "to"]] as const) {
    const s = o[a], e = o[b];
    if (keys.includes(a) && keys.includes(b) && num(s) && num(e)) {
      rows.push({ key: a, label: "Range", value: <><At t={s} /> – <At t={e} /><span className={styles.span}>{formatDuration((e - s) * 1000)}</span></> });
      used.add(a).add(b);
    }
  }
  for (const k of keys) if (!used.has(k)) rows.push({ key: k, label: LABELS[k] ?? humanize(k), value: valueOf(k, o[k]) });
  return rows;
}

/** The one-line summary next to the title, from the call's arguments. */
function summarize(name: string, args: Record<string, unknown> | undefined): ReactNode {
  if (!args) return null;
  const a = args;
  const range = num(a.start) && num(a.end) ? [a.start, a.end] : num(a.from) && num(a.to) ? [a.from, a.to] : null;
  const extra = (name === "add_zoom" || name === "update_zoom") && num(a.scale) ? `${a.scale}×`
    : name === "set_speed" && num(a.speed) ? `${a.speed}×`
    : typeof a.label === "string" ? a.label
    : null;
  if (range) return <><At t={range[0]!} />–<At t={range[1]!} />{extra && <> · {extra}</>}</>;
  if (num(a.at)) return <><At t={a.at} />{extra && <> · {extra}</>}</>;
  if (name === "set_shot" && a.shot) return String(a.shot);
  if (name === "set_motion" && num(a.speed) && num(a.amount)) return `${a.speed}× speed · ${Math.round(a.amount * 100)}% movement`;
  if (Array.isArray(a.fields)) return a.fields.join(", ");
  return null;
}

const toJson = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2) ?? String(v));

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ───────────────────────── Pieces ───────────────────────── */

/** Copy key: the two sheets blur out as a check grows in and draws itself; it turns back after 1.4s. */
function CopyKey({ text, what }: { text: string; what: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <IconKey size="sm" tooltip="top" label={copied ? "Copied" : `Copy ${what}`} className={styles.copy} data-copied={copied || undefined}
      onClick={() => { void copyText(text).then((ok) => ok && setCopied(true)); }}>
      <span className={styles.morph} aria-hidden>
        <Copy className={styles.copyGlyph} />
        <svg className={styles.check} viewBox="0 0 16 16"><path d="M3.5 8.4 6.6 11.3 12.5 4.9" pathLength={1} /></svg>
      </span>
    </IconKey>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className={styles.rows}>
      {rows.map((r, i) => (
        <div key={r.key} className={styles.row} style={{ "--i": i } as CSSProperties}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ label, value, maxRows }: { label: "Arguments" | "Result"; value: unknown; maxRows: number }) {
  const [all, setAll] = useState(false);
  const plain = typeof value === "string";
  const rows = plain ? [] : toRows(value);
  const head = rows.slice(0, maxRows);
  const rest = rows.slice(maxRows);
  return (
    <section className={styles.section} aria-label={label}>
      <div className={styles.sectionHead}>
        <span className={styles.sectionLabel}>{label}</span>
        <CopyKey text={toJson(value)} what={label.toLowerCase()} />
      </div>
      {plain ? <p className={styles.plain}>{value}</p> : <Rows rows={head} />}
      {rest.length > 0 && (
        <>
          <Fold open={all}><Rows rows={rest} /></Fold>
          <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll(!all)}>
            <RollText text={all ? "Show less" : `Show all ${rows.length}`} />
          </button>
        </>
      )}
    </section>
  );
}

/* ───────────────────────── ToolCall ───────────────────────── */

export type ToolCallStatus = "running" | "done" | "failed";

export interface ToolCallProps {
  /** The tool as the agent calls it ("add_zoom"). Picks the words and the icon; never shown as is. */
  name: string;
  /** Running ticks the clock and shimmers the title; done draws a check; failed draws a cross and opens the card. */
  status: ToolCallStatus;
  /** Replaces the title from the tool map. */
  title?: string;
  /** Replaces the summary worked out from `args`. Times inside should use the time face. */
  summary?: ReactNode;
  /** Replaces the tool's icon in the tile. A 13px lucide icon fits. */
  icon?: ReactNode;
  /** What the agent asked for. Shown as labelled rows; hidden when undefined. */
  args?: Record<string, unknown>;
  /** What came back. Objects become rows, strings a paragraph. While running without one, the card says it is waiting. */
  result?: unknown;
  /** Why it failed, shown in the body when status is "failed". */
  error?: string;
  /** When the call started (ms since epoch). The clock counts from here instead of from when it turned running. */
  startedAt?: number;
  /** Final duration in ms. Otherwise the time measured while it ran. */
  duration?: number;
  /** Start open (uncontrolled). */
  defaultOpen?: boolean;
  /** Open state (controlled). */
  open?: boolean;
  /** Called when the header is toggled. */
  onOpenChange?: (open: boolean) => void;
  /** Open when the call fails and close again on the next run, unless someone toggled it by hand. Uncontrolled only. */
  openOnError?: boolean;
  /** Shows a Retry key next to the error. */
  onRetry?: () => void;
  /** Rows shown per section before "Show all". */
  maxRows?: number;
  className?: string;
}

export function ToolCall({
  name, status, title, summary, icon, args, result, error, startedAt, duration,
  defaultOpen = false, open: openProp, onOpenChange, openOnError = true, onRetry, maxRows = 5, className,
}: ToolCallProps) {
  const id = useId();
  const meta = toolMeta(name);
  const [openState, setOpenState] = useState(() => defaultOpen || (openOnError && status === "failed"));
  const [autoOpened, setAutoOpened] = useState(false);
  const [prev, setPrev] = useState(status);
  const [since, setSince] = useState(() => startedAt ?? Date.now());
  const [took, setTook] = useState<number | null>(null);
  const open = openProp ?? openState;

  // Status changes, read in render so the clock and the fold change in the same frame as the glyph.
  if (status !== prev) {
    setPrev(status);
    if (status === "running") { setSince(startedAt ?? Date.now()); setTook(null); }
    else if (prev === "running") setTook(Date.now() - (startedAt ?? since));
    if (openProp === undefined && openOnError) {
      if (status === "failed" && !openState) { setOpenState(true); setAutoOpened(true); }
      else if (prev === "failed" && autoOpened) { setOpenState(false); setAutoOpened(false); }
    }
  }

  const toggle = () => {
    setAutoOpened(false);
    if (openProp === undefined) setOpenState(!open);
    onOpenChange?.(!open);
  };

  const heading = title ?? (status === "running" ? meta.doing : status === "done" ? meta.done : meta.ask);
  const line = summary ?? summarize(name, args);
  const ms = duration ?? took;
  const announce = status === "running" ? meta.doing : status === "done" ? meta.done : `${meta.ask} failed${error ? `: ${error}` : ""}`;

  return (
    <article className={cx(styles.call, className)} data-status={status} data-open={open || undefined}>
      <span className="visually-hidden" role="status" aria-live="polite">{announce}</span>
      <button type="button" className={styles.head} aria-expanded={open} aria-controls={`${id}-body`} onClick={toggle}>
        <span className={styles.tile} aria-hidden>{icon ?? meta.icon}</span>
        <span className={styles.main}>
          <RollText text={heading} shimmer={status === "running"} className={styles.title} />
          {line != null && <span className={styles.summary}>{line}</span>}
        </span>
        <span className={styles.status}>
          <Swap id={status}>
            {status === "running" ? <Duration since={startedAt ?? since} running />
              : status === "failed" ? <span className={styles.failed}>Failed</span>
              : ms != null ? <Duration ms={ms} /> : null}
          </Swap>
          <StatusGlyph status={status} size={14} />
        </span>
        <ChevronDown className={styles.chevron} aria-hidden />
      </button>
      <Fold open={open} id={`${id}-body`}>
        <div className={styles.body}>
          <div className={styles.well}>
            {status === "failed" && (
              <div className={styles.error}>
                <CircleAlert className={styles.errorIcon} aria-hidden />
                <p className={styles.errorText}>{error ?? "The call failed."}</p>
                {onRetry && <Key size="sm" onClick={onRetry} className={styles.retry}><RotateCcw />Retry</Key>}
              </div>
            )}
            {args !== undefined && <Section label="Arguments" value={args} maxRows={maxRows} />}
            {result !== undefined ? <Section label="Result" value={result} maxRows={maxRows} />
              : status === "running" ? <p className={styles.waiting}>Waiting for the result</p>
              : null}
          </div>
        </div>
      </Fold>
    </article>
  );
}

/* ───────────────────────── ToolCallGroup ───────────────────────── */

export interface ToolCallGroupProps {
  /** ToolCall elements. The group reads their name, icon, status and duration for its header line. */
  children: ReactNode;
  /** Header once nothing runs. Default: "Used 3 tools". */
  label?: string;
  /** Shimmering header while any call runs. */
  runningLabel?: string;
  /** Total in ms. Otherwise the sum of the calls' durations, or the time measured while any of them ran. */
  duration?: number;
  /** Start open (uncontrolled). */
  defaultOpen?: boolean;
  /** Open state (controlled). */
  open?: boolean;
  /** Called when the header is toggled. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/** How many tool icons the header stacks; older ones slide out as new calls arrive. */
const STACK = 4;

export function ToolCallGroup({ children, label, runningLabel = "Using tools…", duration, defaultOpen = false, open: openProp, onOpenChange, className }: ToolCallGroupProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<ToolCallProps>[];
  const calls = items.map((c) => c.props);
  const running = calls.some((c) => c.status === "running");
  const failed = calls.filter((c) => c.status === "failed").length;

  // Time spent with tools running, summed across stretches (a pause before a retry doesn't count).
  const [since, setSince] = useState<number | null>(null);
  const [spent, setSpent] = useState(0);
  if (running && since === null) {
    const earliest = calls.reduce<number | undefined>((min, c) => (c.status === "running" && c.startedAt !== undefined && (min === undefined || c.startedAt < min) ? c.startedAt : min), undefined);
    setSince(earliest ?? Date.now());
  }
  if (!running && since !== null) { setSpent(spent + Date.now() - since); setSince(null); }
  const summed = calls.length && calls.every((c) => c.duration !== undefined) ? calls.reduce((t, c) => t + (c.duration ?? 0), 0) : null;
  const total = duration ?? summed ?? spent;

  const count = `Used ${calls.length} ${calls.length === 1 ? "tool" : "tools"}`;
  const heading = running ? runningLabel : label ?? count;
  const firstShown = Math.max(0, calls.length - STACK);
  const pop = reduce ? { duration: 0 } : motionTokens.spring.pop;

  return (
    <section className={cx(styles.group, className)} data-open={open || undefined} data-running={running || undefined}>
      <span className="visually-hidden" role="status" aria-live="polite">{running ? runningLabel : `${count}${failed ? `, ${failed} failed` : ""}`}</span>
      <button type="button" className={styles.groupHead} aria-expanded={open} aria-controls={`${id}-list`}
        onClick={() => { if (openProp === undefined) setOpenState(!open); onOpenChange?.(!open); }}>
        <span className={styles.stack} aria-hidden>
          <AnimatePresence initial={false} mode="popLayout">
            {calls.slice(firstShown).map((c, i) => (
              <motion.span key={firstShown + i} layout className={styles.stackTile} transition={pop}
                initial={{ opacity: 0, scale: 0.5, filter: `blur(${motionTokens.blur.subtle}px)` }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.5, transition: { duration: reduce ? 0 : motionTokens.duration.instant } }}>
                {c.icon ?? toolMeta(c.name).icon}
              </motion.span>
            ))}
          </AnimatePresence>
        </span>
        <span className={styles.groupLine}>
          <RollText text={heading} shimmer={running} className={styles.groupTitle} />
          {!running && failed > 0 && <span className={styles.groupFailed}>{failed} failed</span>}
          {running && since !== null ? <Duration since={since - spent} running /> : total > 0 ? <Duration ms={total} /> : null}
        </span>
        <ChevronDown className={styles.chevron} aria-hidden />
      </button>
      <Fold open={open} id={`${id}-list`}>
        <ol className={styles.list}>
          <AnimatePresence initial={false}>
            {items.map((child, i) => (
              <motion.li key={child.key ?? i} {...blurIn} transition={reduce ? { duration: 0 } : blurIn.transition}>{child}</motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </Fold>
    </section>
  );
}
