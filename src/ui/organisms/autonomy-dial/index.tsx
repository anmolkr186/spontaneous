/**
 * AutonomyDial: how much the agent may do without asking you.
 *
 * Reads top to bottom: a three-stop dial (Always ask, If risky, Full auto), one
 * sentence on what the chosen stop means, then the agent's real actions in two
 * groups, "Runs on its own" and "Asks you first". Changing the stop glides each
 * action that changes side into its new group, a beat after each other, while
 * the card's height follows and the counts roll. A lock on any action keeps it
 * in "Asks you first" whatever the stop.
 */
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { LayoutGroup, motion, MotionConfig, useReducedMotion } from "motion/react";
import { Lock, LockOpen } from "lucide-react";
import { Cell, IconKey, RollNumber, Swap, Tag } from "@/ui/atoms";
import { Tray } from "@/ui/molecules/tray";
import { motionTokens } from "@/ui/tokens/motion";
import styles from "./autonomy-dial.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type AutonomyLevel = 0 | 1 | 2;
export type ActionRisk = "safe" | "risky" | "destructive";
export interface AgentAction {
  id: string;
  /** What the agent does, as a verb phrase: "Cut footage". */
  label: string;
  /** One line on what that means in this project. Hidden in narrow panels. */
  detail?: string;
  risk: ActionRisk;
  icon?: ReactNode;
}

export interface AutonomyDialProps {
  /** The agent's actions, in the order they should list. */
  actions: AgentAction[];
  /** Controlled stop: 0 Always ask, 1 If risky (safe actions run), 2 Full auto. */
  level?: AutonomyLevel;
  /** Starting stop when uncontrolled. */
  defaultLevel?: AutonomyLevel;
  /** Another stop was picked. */
  onLevelChange?: (level: AutonomyLevel) => void;
  /** Controlled ids of locked actions: they always ask, whatever the stop. */
  pinned?: string[];
  /** Starting locks when uncontrolled. */
  defaultPinned?: string[];
  /** A lock was set or removed. */
  onPinnedChange?: (pinned: string[]) => void;
  /** Heading, usually the agent's name. */
  title?: string;
  /** Line under the heading. */
  subtitle?: string;
  className?: string;
}

const LEVELS: { label: string; means: string }[] = [
  { label: "Always ask", means: "Asks you before every edit, even a zoom." },
  { label: "If risky", means: "Makes safe edits on its own and asks before anything risky or destructive." },
  { label: "Full auto", means: "Makes every edit on its own, except the ones you lock." },
];

const runsAt = (a: AgentAction, level: AutonomyLevel, pinned: string[]) =>
  !pinned.includes(a.id) && (level === 2 || (level === 1 && a.risk === "safe"));

export function AutonomyDial({
  actions,
  level,
  defaultLevel = 1,
  onLevelChange,
  pinned,
  defaultPinned = [],
  onPinnedChange,
  title = "Claude Code",
  subtitle = "What it may do without asking you",
  className,
}: AutonomyDialProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const stops = useRef<(HTMLButtonElement | null)[]>([]);
  const refocus = useRef<string | null>(null);

  const [innerLevel, setInnerLevel] = useState(defaultLevel);
  const [innerPinned, setInnerPinned] = useState(defaultPinned);
  const lvl = level ?? innerLevel;
  const locks = pinned ?? innerPinned;
  const [announcement, setAnnouncement] = useState("");

  const runs = actions.filter((a) => runsAt(a, lvl, locks));
  const asks = actions.filter((a) => !runsAt(a, lvl, locks));
  const say = (l: AutonomyLevel, p: string[]) => {
    const n = actions.filter((a) => runsAt(a, l, p)).length;
    setAnnouncement(`${LEVELS[l]!.label}. ${n} run on their own, ${actions.length - n} ask you first.`);
  };

  const choose = (next: AutonomyLevel) => {
    if (next === lvl) return;
    if (level === undefined) setInnerLevel(next);
    onLevelChange?.(next);
    say(next, locks);
  };
  const toggle = (actionId: string) => {
    const next = locks.includes(actionId) ? locks.filter((p) => p !== actionId) : [...locks, actionId];
    if (pinned === undefined) setInnerPinned(next);
    onPinnedChange?.(next);
    say(lvl, next);
    // The row is drawn again in its other group; keep focus on its lock.
    if (root.current?.contains(document.activeElement)) refocus.current = actionId;
  };

  // Actions that changed side glide a beat after each other, in list order.
  const side = useRef(new Map<string, boolean>());
  const moved = actions.filter((a) => side.current.has(a.id) && side.current.get(a.id) !== runsAt(a, lvl, locks));
  const delayOf = (actionId: string) => (reduce ? 0 : Math.max(0, moved.findIndex((a) => a.id === actionId)) * motionTokens.stagger.row);
  useLayoutEffect(() => {
    side.current = new Map(actions.map((a) => [a.id, runsAt(a, lvl, locks)]));
    if (refocus.current) {
      root.current?.querySelector<HTMLElement>(`[data-lock="${CSS.escape(refocus.current)}"]`)?.focus({ preventScroll: true });
      refocus.current = null;
    }
  });

  const onDialKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? 2 : step ? Math.min(2, Math.max(0, lvl + step)) : null;
    if (to === null) return;
    e.preventDefault();
    choose(to as AutonomyLevel);
    stops.current[to]?.focus();
  };

  // The card's height follows its content on the same spring the rows travel on.
  const body = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const meansId = `${id}-means`;
  const travel = reduce ? { duration: 0 } : motionTokens.spring.travel;

  return (
    <MotionConfig reducedMotion="user">
      <Tray ref={root} className={cx(styles.dial, className)}>
        <motion.div className={styles.clip} initial={false} animate={{ height }} transition={travel}>
          <div ref={body} className={styles.body}>
            <header className={styles.header}>
              <h3 className={styles.title}>{title}</h3>
              <p className={styles.subtitle}>{subtitle}</p>
            </header>

            <div role="radiogroup" aria-label="Autonomy" aria-describedby={meansId} className={styles.stops} onKeyDown={onDialKey}>
              {LEVELS.map((l, i) => (
                <button
                  key={l.label}
                  ref={(el) => { stops.current[i] = el; }}
                  type="button"
                  role="radio"
                  aria-checked={lvl === i}
                  tabIndex={lvl === i ? 0 : -1}
                  className={styles.stop}
                  onClick={() => choose(i as AutonomyLevel)}
                >
                  {lvl === i && <motion.span layoutId={`${id}-key`} className={styles.stopKey} transition={reduce ? { duration: 0 } : motionTokens.spring.morph} />}
                  <span className={styles.stopText}>
                    <span className={styles.gauge} aria-hidden>
                      {[0, 1, 2].map((c) => <Cell key={c} size={5} variant={c <= i ? "solid" : "muted"} />)}
                    </span>
                    {l.label}
                  </span>
                </button>
              ))}
            </div>
            <p id={meansId} className={styles.means}><Swap id={String(lvl)}>{LEVELS[lvl]!.means}</Swap></p>

            <LayoutGroup id={id}>
              <Group id={`${id}-runs`} title="Runs on its own" kind="runs" items={runs} locks={locks} layoutKey={id} delayOf={delayOf} travel={travel} onToggle={toggle} />
              <Group id={`${id}-asks`} title="Asks you first" kind="asks" items={asks} locks={locks} layoutKey={id} delayOf={delayOf} travel={travel} onToggle={toggle} />
            </LayoutGroup>
          </div>
        </motion.div>
        <span className="visually-hidden" role="status" aria-live="polite">{announcement}</span>
      </Tray>
    </MotionConfig>
  );
}

/* ───────────────────────── Groups ───────────────────────── */

type Travel = typeof motionTokens.spring.travel | { duration: number };

function Group({ id, title, kind, items, locks, layoutKey, delayOf, travel, onToggle }: {
  id: string;
  title: string;
  kind: "runs" | "asks";
  items: AgentAction[];
  locks: string[];
  layoutKey: string;
  delayOf: (actionId: string) => number;
  travel: Travel;
  onToggle: (actionId: string) => void;
}) {
  return (
    <section className={styles.group} aria-labelledby={id} data-kind={kind}>
      <motion.h4 layout="position" transition={travel} id={id} className={styles.groupHead}>
        <Cell size={6} variant={kind === "runs" ? "solid" : "hollow"} />
        {title}
        <RollNumber value={items.length} className={styles.count} />
      </motion.h4>
      <ul className={styles.list}>
        {items.map((a) => {
          const locked = locks.includes(a.id);
          return (
            <motion.li
              key={a.id}
              layout="position"
              layoutId={`${layoutKey}-${a.id}`}
              transition={{ layout: { ...travel, delay: delayOf(a.id) } }}
              className={styles.action}
              data-locked={locked || undefined}
            >
              {a.icon && <span className={styles.icon} aria-hidden>{a.icon}</span>}
              <span className={styles.text}>
                <span className={styles.label}>{a.label}</span>
                {a.detail && <span className={styles.detail}>{a.detail}</span>}
              </span>
              {a.risk !== "safe" && <Tag size="sm" tone={a.risk === "destructive" ? "rec" : "neutral"}>{a.risk === "destructive" ? "Destructive" : "Risky"}</Tag>}
              <IconKey
                size="sm"
                data-lock={a.id}
                className={styles.lock}
                pressed={locked}
                label={locked ? `Stop always asking before ${lowerFirst(a.label)}` : `Always ask before ${lowerFirst(a.label)}`}
                tooltip="left"
                onClick={() => onToggle(a.id)}
              >
                <Swap id={locked ? "locked" : "open"}>{locked ? <Lock /> : <LockOpen />}</Swap>
              </IconKey>
            </motion.li>
          );
        })}
        {items.length === 0 && (
          <motion.li layout="position" transition={travel} className={styles.empty}>
            {kind === "runs" ? "Nothing runs on its own." : "Nothing asks first."}
          </motion.li>
        )}
      </ul>
    </section>
  );
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
