/**
 * AgentMonitor: one agent at work, kept in view as a card.
 *
 * The header says who is working, where the run is (a small state pill) and
 * what it has cost so far. Inside the card, a well shows the step it is on
 * with the run's clock; under it a time strip gives every finished step a bar
 * as long as the step took, the running one growing live; under that, the
 * finished steps, newest on top, three rows tall. Pointing at a bar lights its
 * row and the other way round. When the agent needs your OK before it touches
 * something real, the card shows the exact action and takes Allow (Enter) or
 * Decline (Esc). Folded, the card becomes one bar: the agent, the tools it has
 * picked up, and the clock.
 *
 * State is told by words and material, never by a hue, except Failed.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { ChevronsDownUp, ChevronsUpDown, Clock3, Download, Eye, Film, Gauge, Hand, Pause, Play, RotateCcw, Scissors, Search, Type, Video, Wrench, X, ZoomIn } from "lucide-react";
import { DrawCheck, Fold, IconKey, Kbd, Key, Mark, RollNumber, RollText, Swap, formatDuration, useNow } from "@/ui/atoms";
import { Tray, TrayCard, TraySpacer, trayStyles } from "@/ui/molecules/tray";
import { blurIn, motionTokens } from "@/ui/tokens/motion";
import { AutoHeight } from "@/ui/atoms";
import { CtaKey, approvalLabels } from "@/ui/cta";
import styles from "./agent-monitor.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type MonitorState = "idle" | "running" | "waiting" | "paused" | "finished" | "failed";
export type MonitorStepKind = "read" | "look" | "zoom" | "cut" | "speed" | "overlay" | "camera" | "render" | "export";

export interface MonitorStep {
  id: string;
  /** What the step did or does, in plain words: "Rendered 1080p". */
  label: string;
  /** Picks a plain icon when there's no `icon`. */
  kind?: MonitorStepKind;
  /** A 14px icon for the tool the step used. */
  icon?: ReactNode;
  state: "queued" | "running" | "done" | "failed";
  /** When it started (ms since epoch). The running bar grows from here. */
  since?: number;
  /** How long it took, in ms, once done or failed. */
  took?: number;
}

export interface MonitorAsk {
  /** A short line for the well: "Wants to overwrite the export". */
  title: string;
  /** The exact action it is about to take: "Overwrite Projects-demo.mp4 in ~/Movies". */
  action: string;
  /** The tool's icon, before the action. */
  icon?: ReactNode;
  /** The tool asking, e.g. "export_overwrite". Words the Allow key ("Overwrite export"). */
  tool?: string;
  /** A label the agent proposed for Allow. */
  label?: string;
}

export interface AgentMonitorProps {
  /** Where the run is. Shown as the pill next to the cost. Default "idle". */
  state?: MonitorState;
  /** Who is working: a name and, optionally, what it's doing it as ("Export"). */
  agent?: { name: string; role?: string };
  /** Every step, oldest first. Done and failed ones become bars and rows; queued ones count toward "3 of 6". */
  steps: MonitorStep[];
  /** Overrides what the well says while running. Defaults to the running step. */
  current?: { label: string; kind?: MonitorStepKind; icon?: ReactNode };
  /** When the run began (ms since epoch). The clock counts from here. */
  since?: number;
  /** When it ended. Stops the clock. */
  until?: number;
  /** Time spent paused, in ms, left out of the clock. */
  pausedFor?: number;
  /** Dollars spent so far. */
  cost?: number;
  /** While waiting: what it wants to do, exactly. */
  ask?: MonitorAsk;
  /** Once finished: one line on what came out ("Exported Projects-demo.mp4"). */
  outcome?: string;
  /** Once failed: what went wrong, in a few words. */
  error?: string;
  /** Allow while waiting. Enter does the same while the card has focus. */
  onAllow?: () => void;
  /** Decline while waiting. Esc does the same while focus is in the card. */
  onDecline?: () => void;
  /** Shows Pause while running. */
  onPause?: () => void;
  /** Shows Resume while paused. */
  onResume?: () => void;
  /** Shows Cancel while running or paused. */
  onCancel?: () => void;
  /** Shows Try again after a failure. */
  onRetry?: () => void;
  /** Controlled fold. */
  folded?: boolean;
  /** Start folded, as the small bar. */
  defaultFolded?: boolean;
  /** The card folded or opened. */
  onFoldedChange?: (folded: boolean) => void;
  className?: string;
}

const STATE_LABEL: Record<MonitorState, string> = {
  idle: "Not started", running: "Running", waiting: "Needs you", paused: "Paused", finished: "Finished", failed: "Failed",
};

const KIND_ICON: Record<MonitorStepKind, ReactNode> = {
  read: <Search />, look: <Eye />, zoom: <ZoomIn />, cut: <Scissors />, speed: <Gauge />,
  overlay: <Type />, camera: <Video />, render: <Film />, export: <Download />,
};

const iconOf = (s: { kind?: MonitorStepKind; icon?: ReactNode }) => s.icon ?? (s.kind ? KIND_ICON[s.kind] : <Wrench />);
const usd = (n: number) => `$${n.toFixed(2)}`;

export function AgentMonitor({
  state = "idle",
  agent = { name: "Claude Code" },
  steps,
  current,
  since,
  until,
  pausedFor = 0,
  cost,
  ask,
  outcome,
  error,
  onAllow,
  onDecline,
  onPause,
  onResume,
  onCancel,
  onRetry,
  folded: controlledFold,
  defaultFolded = false,
  onFoldedChange,
  className,
}: AgentMonitorProps) {
  const [ownFold, setOwnFold] = useState(defaultFolded);
  const folded = controlledFold ?? ownFold;
  const foldKey = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLButtonElement>(null);
  const setFolded = (next: boolean) => {
    if (controlledFold === undefined) setOwnFold(next);
    onFoldedChange?.(next);
    requestAnimationFrame(() => (next ? bar : foldKey).current?.focus());
  };

  // The clock ticks while the agent works or waits on you; paused, it stands still.
  const ticking = (state === "running" || state === "waiting") && until === undefined;
  const now = useNow(ticking, 100);
  const elapsed = since === undefined ? 0 : Math.max(0, (until ?? now) - since - pausedFor);

  const running = steps.find((s) => s.state === "running");
  const finished = steps.filter((s) => s.state === "done" || s.state === "failed");
  const waiting = state === "waiting";

  const well = (() => {
    switch (state) {
      case "waiting": return { key: "waiting", icon: <Hand />, label: ask?.title ?? "Waiting for your OK" };
      case "finished": return { key: "finished", icon: <DrawCheck size={14} className={styles.success} />, label: outcome ?? "Finished" };
      case "failed": return { key: "failed", icon: <X className={styles.danger} />, label: error ?? "Failed" };
      case "idle": return { key: "idle", icon: <Clock3 />, label: "Not started" };
      default: {
        const on = current ?? running;
        const label = on?.label ?? "Working";
        return { key: state === "paused" ? "paused" : `step:${running?.id ?? label}`, icon: state === "paused" ? <Pause /> : iconOf(on ?? {}), label };
      }
    }
  })();

  // Tools picked up so far, in the order first used: the folded bar's stack.
  const tools: { key: string; icon: ReactNode }[] = [];
  for (const s of steps) {
    if (s.state === "queued") continue;
    const key = s.kind ?? s.id;
    if (!tools.some((t) => t.key === key)) tools.push({ key, icon: iconOf(s) });
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!waiting) return;
    // Enter allows only from the card itself, so it never steals a press meant for a button inside.
    if (e.key === "Enter" && e.target === e.currentTarget && onAllow) { e.preventDefault(); onAllow(); }
    if (e.key === "Escape" && onDecline) { e.preventDefault(); onDecline(); }
  };

  const doneCount = steps.filter((s) => s.state === "done").length;
  const attention = state === "waiting" || state === "failed" || state === "finished";

  return (
    <MotionConfig reducedMotion="user">
      <Tray
        bare
        className={cx(styles.monitor, className)}
        aria-label={`${agent.name}, ${STATE_LABEL[state]}: ${well.label}`}
        tabIndex={waiting ? 0 : -1}
        onKeyDown={onKeyDown}
        data-state={state}
      >
        <AutoHeight className={styles.morph}>
          <div className={cx(trayStyles.head, styles.head)}>
            <Swap id={folded ? "bar" : "head"} className={styles.headSwap}>
              {folded ? (
                <button ref={bar} type="button" className={styles.bar} aria-expanded={false} aria-label={`${agent.name}, ${STATE_LABEL[state]}: ${well.label}. Open`} onClick={() => setFolded(false)}>
                  <Mark size={13} title="" />
                  <span className={styles.name}>{agent.name}</span>
                  <ToolStack tools={tools} />
                  <TraySpacer />
                  <Swap id={attention ? state : "quiet"}>{attention ? <StatePill state={state} /> : null}</Swap>
                  <span className={styles.barClock}>{formatDuration(elapsed)}</span>
                  <ChevronsUpDown className={styles.chevron} aria-hidden />
                </button>
              ) : (
                <>
                  <span className={trayStyles.title}>
                    <Mark size={13} title="" />
                    <span className={styles.name}>{agent.name}</span>
                    {agent.role && <span className={styles.role}>{agent.role}</span>}
                  </span>
                  <span className={styles.meta}>
                    <StatePill state={state} />
                    {cost !== undefined && (
                      <span className={styles.cost}><span className="visually-hidden">Cost so far </span><RollNumber value={cost} format={usd} /></span>
                    )}
                    <IconKey ref={foldKey} size="sm" label="Fold away" tooltip="top" aria-expanded onClick={() => setFolded(true)}><ChevronsDownUp /></IconKey>
                  </span>
                </>
              )}
            </Swap>
          </div>

          <AnimatePresence mode="popLayout" initial={false}>
            {!folded && (
              <motion.div
                key="open"
                className={styles.open}
                initial={{ opacity: 0, y: -4, filter: `blur(${motionTokens.blur.subtle}px)` }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -4, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.exit, ease: motionTokens.ease.standard } }}
                transition={{ duration: motionTokens.duration.considered, ease: motionTokens.ease.standard }}
              >
                <TrayCard className={styles.card}>
                  <div className={styles.well} data-state={state}>
                    <span className={styles.wellIcon}><Swap id={well.key}>{well.icon}</Swap></span>
                    <span className={styles.wellLabel}><RollText text={well.label} shimmer={state === "running"} glide={false} /></span>
                    <span className={styles.clock}><span className="visually-hidden">Time </span>{formatDuration(elapsed)}</span>
                  </div>

                  <StepsView steps={finished} running={running} now={now} state={state} />

                  <Fold open={waiting && !!ask}>
                    <div className={styles.ask}>
                      <span className={styles.askLabel}>Wants to</span>
                      <p className={styles.askAction}>{ask?.icon ?? null}<span>{ask?.action}</span></p>
                      <div className={styles.askRow}>
                        <span className={styles.askHint}><Kbd>↵</Kbd> allow <Kbd>esc</Kbd> decline</span>
                        <TraySpacer />
                        {onDecline && <Key size="sm" variant="tertiary" onClick={onDecline}>Decline</Key>}
                        {onAllow && <CtaKey size="sm" intent="decide" risk="risky" label={ask?.tool ? approvalLabels(ask.tool).approve : "Allow"} proposal={ask?.label} onClick={onAllow} />}
                      </div>
                    </div>
                  </Fold>
                </TrayCard>

                <div className={trayStyles.foot}>
                  <Swap id={state} className={styles.foot}>
                    <span className={styles.status}>
                      {state === "finished" ? <>Finished in {formatDuration(elapsed)}</>
                        : state === "failed" ? <>Stopped after {doneCount} of {steps.length} steps</>
                        : state === "idle" ? <>{steps.length} steps planned</>
                        : <><RollNumber value={doneCount} /> of {steps.length} steps</>}
                    </span>
                    <TraySpacer />
                    {state === "running" && onPause && <Key size="sm" variant="tertiary" onClick={onPause}><Pause />Pause</Key>}
                    {state === "paused" && onResume && <Key size="sm" variant="secondary" onClick={onResume}><Play />Resume</Key>}
                    {(state === "running" || state === "paused" || state === "waiting") && onCancel && <Key size="sm" variant="tertiary" onClick={onCancel}>Cancel</Key>}
                    {state === "failed" && onRetry && <Key size="sm" variant="secondary" onClick={onRetry}><RotateCcw />Try again</Key>}
                  </Swap>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </AutoHeight>
      </Tray>
    </MotionConfig>
  );
}

/* ───────────────────────── State pill ───────────────────────── */

/** Where the run is. Neutral in a well; Needs you rises as a key; Failed is the one in a hue. */
function StatePill({ state }: { state: MonitorState }) {
  return (
    <span className={styles.pill} data-state={state}>
      <RollText text={STATE_LABEL[state]} className={styles.pillText} />
    </span>
  );
}

/* ───────────────────────── Folded stack ───────────────────────── */

/** The tools picked up so far, overlapping; the one in use in front, the earlier ones faded back. */
function ToolStack({ tools }: { tools: { key: string; icon: ReactNode }[] }) {
  const shown = tools.slice(-4);
  return (
    <span className={styles.stack} aria-hidden>
      <AnimatePresence initial={false}>
        {shown.map((t, i) => (
          <motion.span
            key={t.key}
            layout="position"
            className={styles.tool}
            data-current={i === shown.length - 1 || undefined}
            initial={{ opacity: 0, x: -6, filter: `blur(${motionTokens.blur.subtle}px)` }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: `blur(${motionTokens.blur.subtle}px)` }}
            transition={{ ...blurIn.transition, layout: motionTokens.spring.morph }}
          >
            {t.icon}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

/* ───────────────────────── Time strip + list ───────────────────────── */

/**
 * The finished steps twice over: as bars in a strip, each as long as it took,
 * and as rows, newest on top. The two halves light each other up.
 */
function StepsView({ steps, running, now, state }: { steps: MonitorStep[]; running?: MonitorStep; now: number; state: MonitorState }) {
  const [lit, setLit] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [fade, setFade] = useState({ top: false, bottom: false, scrolls: false });
  const reduce = useReducedMotion();

  const measure = () => {
    const el = list.current;
    if (!el) return;
    const next = { top: el.scrollTop > 1, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1, scrolls: el.scrollHeight > el.clientHeight + 1 };
    setFade((f) => (f.top === next.top && f.bottom === next.bottom && f.scrolls === next.scrolls ? f : next));
  };
  useLayoutEffect(measure, [steps.length]);

  // Bars: oldest on the left. The running one grows until it's done.
  const live = running?.since !== undefined ? Math.max(0, now - running.since) : 0;
  const spans = [...steps.map((s) => ({ step: s, ms: s.took ?? 0 })), ...(running ? [{ step: running, ms: live }] : [])];
  const total = spans.reduce((sum, s) => sum + s.ms, 0) || 1;
  let at = 0;
  const bars = spans.map(({ step, ms }) => { const a = at / total; at += ms; return { step, a, b: at / total }; });

  const light = (id: string | null, fromBar = false) => {
    setLit(id);
    const el = list.current, row = id ? rows.current.get(id) : undefined;
    if (!fromBar || !el || !row) return;
    const top = row.offsetTop, bottom = top + row.offsetHeight;
    const to = top < el.scrollTop ? top : bottom > el.scrollTop + el.clientHeight ? bottom - el.clientHeight : null;
    if (to !== null) el.scrollTo({ top: to, behavior: reduce ? "auto" : "smooth" });
  };

  const newestFirst = [...steps].reverse();
  const label = spans.length
    ? `Time per step: ${spans.map(({ step, ms }) => `${step.label}, ${formatDuration(ms)}${step.state === "running" ? " so far" : ""}`).join("; ")}`
    : "No steps finished yet";

  return (
    <>
      <div className={styles.strip} role="img" aria-label={label} data-waiting={state === "waiting" || undefined} data-lit={lit !== null || undefined}>
        <span className={styles.bars}>
          {bars.map(({ step, a, b }) => (
            <span
              key={step.id}
              className={styles.barSeg}
              data-state={step.state}
              data-paused={(state === "paused" && step.state === "running") || undefined}
              data-lit={lit === step.id || undefined}
              style={{ "--a": a, "--b": b } as CSSProperties}
              onPointerEnter={() => light(step.id, true)}
              onPointerLeave={() => setLit(null)}
            />
          ))}
        </span>
        <span className={styles.tail} />
      </div>

      <ol
        ref={list}
        className={styles.list}
        aria-label="Finished steps"
        tabIndex={fade.scrolls ? 0 : undefined}
        data-fade-top={fade.top || undefined}
        data-fade-bottom={fade.bottom || undefined}
        data-lit={lit !== null || undefined}
        onScroll={measure}
      >
        <AnimatePresence initial={false}>
          {newestFirst.map((s) => (
            <motion.li
              key={s.id}
              ref={(el: HTMLLIElement | null) => { if (el) rows.current.set(s.id, el); else rows.current.delete(s.id); }}
              layout="position"
              className={styles.row}
              data-state={s.state}
              data-lit={lit === s.id || undefined}
              initial={{ opacity: 0, y: -8, filter: `blur(${motionTokens.blur.subtle}px)` }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ ...blurIn.transition, duration: motionTokens.duration.considered, layout: motionTokens.spring.travel }}
              onPointerEnter={() => light(s.id)}
              onPointerLeave={() => setLit(null)}
            >
              <span className={styles.rowIcon} aria-hidden>{s.state === "failed" ? <X /> : iconOf(s)}</span>
              <span className={styles.rowLabel}>{s.label}{s.state === "failed" && <span className="visually-hidden">, failed</span>}</span>
              {s.took !== undefined && <span className={styles.took}>{formatDuration(s.took)}</span>}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </>
  );
}
