/**
 * PermissionRequest: the agent asks for one specific right, and you decide how
 * long it holds.
 *
 * Reads as a sentence: who ("Claude Code"), "wants to", the action, and where
 * (the target with its tool icon). Under it, the agent's reason in its own
 * words and exactly what will happen, row by row. You pick how long (once, for
 * an hour, always) and the Allow key says the choice back to you.
 *
 * Decided, the card folds to one line: a check or cross pops in, a timed grant
 * shows its time left over a thin bar that drains until it runs out, and
 * Revoke takes it back.
 */
import { useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from "react";
import { motion, MotionConfig } from "motion/react";
import { Fold, Kbd, Key, Mark, RollText, Tag, useNow } from "@/ui/atoms";
import { Switcher } from "@/ui/molecules";
import { Tray, TraySpacer, trayStyles } from "@/ui/molecules/tray";
import { formatTime } from "@/editor/model";
import { motionTokens } from "@/ui/tokens/motion";
import { CtaKey, proposedPrimary } from "@/ui/cta";
import type { CtaProposal } from "@/ui/cta";
import styles from "./permission-request.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type PermissionRisk = "safe" | "risky" | "destructive";
export type PermissionScope = "once" | "timed" | "always";
export interface PermissionDecision {
  allow: boolean;
  scope: PermissionScope;
  /** When it was decided, epoch ms. */
  at: number;
  /** When a timed grant runs out, epoch ms. */
  until?: number;
}
export interface PermissionPreviewItem { id: string; label: string; meta?: string; icon?: ReactNode }
export interface PermissionAgent { name: string; model?: string; avatar?: ReactNode }

export interface PermissionRequestProps {
  /** Who asks. The avatar defaults to the app's mark. */
  agent?: PermissionAgent;
  /** What it wants to do, read after "wants to": "write to ~/Movies/Spontaneous". */
  action: string;
  /** Where, shown under the title with `toolIcon`: "Files · ~/Movies/Spontaneous". */
  target?: string;
  /** The tool's icon next to the target. */
  toolIcon?: ReactNode;
  /** Risky and destructive carry a tag; destructive also turns Allow into a danger key and leaves out Always. */
  risk?: PermissionRisk;
  /** The agent's own words on why it needs this. */
  reason?: string;
  /** Exactly what will happen: files, tracks, recipients. `meta` sits on the right ("182 MB"). */
  preview?: PermissionPreviewItem[];
  /** Heading of the preview. */
  previewTitle?: string;
  /** Rows shown before "+N more". */
  previewLimit?: number;
  /** The choices of how long. One choice hides the switcher. */
  scopes?: PermissionScope[];
  /** Controlled choice of how long. */
  scope?: PermissionScope;
  /** Starting choice when uncontrolled. */
  defaultScope?: PermissionScope;
  /** Another choice of how long was picked. */
  onScopeChange?: (scope: PermissionScope) => void;
  /** Minutes a timed grant holds. */
  duration?: number;
  /** Controlled decision; null while it waits. */
  decision?: PermissionDecision | null;
  /** Starting decision when uncontrolled. */
  defaultDecision?: PermissionDecision | null;
  /** Allow or Deny, and null for Revoke, Change or Ask again. */
  onDecisionChange?: (decision: PermissionDecision | null) => void;
  /** The clock for the time left, epoch ms. Without it the card ticks every second while a timed grant runs. */
  now?: number;
  /** Labels the agent proposed for Allow. Shown when it passes the checks; otherwise "Allow once" and friends. */
  cta?: CtaProposal;
  className?: string;
}

const ALL_SCOPES: PermissionScope[] = ["once", "timed", "always"];

/** "for an hour", "for 2 hours", "for 30 minutes". */
function forHow(minutes: number) {
  if (minutes >= 60 && minutes % 60 === 0) return minutes === 60 ? "for an hour" : `for ${minutes / 60} hours`;
  return minutes === 1 ? "for a minute" : `for ${minutes} minutes`;
}
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function PermissionRequest({
  agent = { name: "Claude Code" },
  action,
  target,
  toolIcon,
  risk = "risky",
  reason,
  preview,
  previewTitle = "What will happen",
  previewLimit = 3,
  scopes = ALL_SCOPES,
  scope,
  defaultScope = "once",
  onScopeChange,
  duration = 60,
  decision,
  defaultDecision = null,
  onDecisionChange,
  now,
  cta,
  className,
}: PermissionRequestProps) {
  const id = useId();
  const whoId = `${id}-who`, actionId = `${id}-action`, reasonId = `${id}-reason`, previewId = `${id}-preview`;
  const root = useRef<HTMLElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const radios = useRef<HTMLDivElement>(null);

  const destructive = risk === "destructive";
  const offered = scopes.filter((s) => !(destructive && s === "always"));
  const available = offered.length ? offered : (["once"] as PermissionScope[]);
  const [innerScope, setInnerScope] = useState(defaultScope);
  const wanted = scope ?? innerScope;
  const chosen = available.includes(wanted) ? wanted : available[0]!;
  const pick = (s: PermissionScope) => { if (scope === undefined) setInnerScope(s); onScopeChange?.(s); };

  const [innerDecision, setInnerDecision] = useState(defaultDecision);
  const current = decision !== undefined ? decision : innerDecision;
  const commit = (d: PermissionDecision | null) => {
    const focusWasIn = !!root.current?.contains(document.activeElement);
    if (decision === undefined) setInnerDecision(d);
    onDecisionChange?.(d);
    // Keep focus in the card: on the decided line, or back on the request.
    if (focusWasIn) requestAnimationFrame(() => (d ? line.current : root.current?.querySelector<HTMLElement>("[data-action='allow']"))?.focus({ preventScroll: true }));
  };
  const allow = () => {
    const at = Date.now();
    commit({ allow: true, scope: chosen, at, until: chosen === "timed" ? at + duration * 60000 : undefined });
  };
  const deny = () => commit({ allow: false, scope: chosen, at: Date.now() });

  const [more, setMore] = useState(false);
  const [opened, setOpened] = useState(false);
  if (more && !opened) setOpened(true);
  const rows = preview ?? [];
  const shown = rows.slice(0, previewLimit);
  const rest = rows.slice(previewLimit);

  const scopeLabel = (s: PermissionScope) => (s === "once" ? "Once" : s === "timed" ? upper(forHow(duration)) : "Always");
  const allowLabel = chosen === "once" ? "Allow once" : chosen === "timed" ? `Allow ${forHow(duration)}` : "Always allow";

  const onKeyDown = (e: KeyboardEvent) => {
    if (current) return;
    const t = e.target as HTMLElement;
    if (e.key === "Escape") { e.preventDefault(); deny(); return; }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && available.length > 1) {
      e.preventDefault();
      const i = available.indexOf(chosen) + (e.key === "ArrowRight" ? 1 : -1);
      const next = available[(i + available.length) % available.length]!;
      pick(next);
      if (t.getAttribute("role") === "radio") radios.current?.querySelectorAll<HTMLElement>("[role='radio']")[available.indexOf(next)]?.focus();
      return;
    }
    if (e.key === "Enter") {
      // Other keys in the card (Deny, "+2 more") press themselves; anywhere else Enter allows.
      if (t.closest("button") && t.getAttribute("role") !== "radio" && t.dataset.action !== "allow") return;
      e.preventDefault();
      allow();
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <Tray bare ref={root} className={cx(styles.permission, className)} data-decided={current ? true : undefined} data-risk={risk} onKeyDown={onKeyDown}>
        <div className={styles.pendingWrap}>
          <Fold open={!current}>
            <div className={styles.pending}>
              <div className={cx(trayStyles.card, styles.card)} role="dialog" aria-labelledby={`${whoId} ${actionId}`} aria-describedby={reason ? reasonId : undefined}>
                <header className={styles.header}>
                  <span className={styles.avatar} aria-hidden>{agent.avatar ?? <Mark size={32} title="" />}</span>
                  <div className={styles.heading}>
                    <p id={whoId} className={styles.who}>
                      <span className={styles.agent}>{agent.name}</span>
                      {agent.model && <span className={styles.model}>{agent.model}</span>}
                      <span> wants to</span>
                    </p>
                    <h3 id={actionId} className={styles.action}>{action}</h3>
                  </div>
                  {risk !== "safe" && <Tag size="sm" tone={destructive ? "rec" : "neutral"} className={styles.risk}>{destructive ? "Destructive" : "Risky"}</Tag>}
                </header>

                {target && <p className={styles.target}>{toolIcon && <span className={styles.toolIcon} aria-hidden>{toolIcon}</span>}<span className={styles.targetText}>{target}</span></p>}
                {reason && <blockquote id={reasonId} className={styles.reason}>{reason}</blockquote>}

                {rows.length > 0 && (
                  <section className={styles.preview} aria-labelledby={previewId}>
                    <h4 id={previewId} className={styles.previewTitle}>{previewTitle}</h4>
                    <ul className={styles.rows}>
                      {shown.map((p, i) => <PreviewRow key={p.id} item={p} index={i} />)}
                    </ul>
                    {rest.length > 0 && (
                      <>
                        <Fold open={more}>
                          <ul className={styles.rows}>
                            {opened && rest.map((p, i) => <PreviewRow key={p.id} item={p} index={i} />)}
                          </ul>
                        </Fold>
                        <button type="button" className={styles.more} aria-expanded={more} onClick={() => setMore(!more)}>
                          <RollText text={more ? "Show less" : `+${rest.length} more`} />
                        </button>
                      </>
                    )}
                  </section>
                )}

                {available.length > 1 && (
                  <div className={styles.scope}>
                    <span className={styles.scopeLabel} aria-hidden>How long</span>
                    <div ref={radios}>
                      <Switcher label="How long" value={chosen} onChange={pick} options={available.map((s) => ({ value: s, label: scopeLabel(s) }))} />
                    </div>
                  </div>
                )}
              </div>

              <div className={cx(trayStyles.foot, styles.foot)}>
                <TraySpacer />
                <Key variant="tertiary" data-action="deny" aria-keyshortcuts="Escape" onClick={deny}>
                  Deny<span className={styles.hint} aria-hidden><Kbd>Esc</Kbd></span>
                </Key>
                <CtaKey intent="decide" risk={risk} label={allowLabel} proposal={chosen === "once" ? proposedPrimary(cta, "decide") : undefined}
                  data-action="allow" aria-keyshortcuts="Enter" onClick={allow}
                  trailing={<span className={styles.hint} aria-hidden><Kbd className={cx(!destructive && styles.faceKbd)}>↵</Kbd></span>} />
              </div>
            </div>
          </Fold>
        </div>

        <Fold open={!!current}>
          <Decided decision={current} action={action} duration={duration} now={now} lineRef={line} onChange={commit} />
        </Fold>
      </Tray>
    </MotionConfig>
  );
}

/* ───────────────────────── Parts ───────────────────────── */

/** One thing that will happen. Rows rise a beat after each other when they appear. */
function PreviewRow({ item, index }: { item: PermissionPreviewItem; index: number }) {
  return (
    <li className={styles.row} style={{ "--i": index } as CSSProperties}>
      {item.icon && <span className={styles.rowIcon} aria-hidden>{item.icon}</span>}
      <span className={styles.rowLabel}>{item.label}</span>
      {item.meta && <span className={styles.rowMeta}>{item.meta}</span>}
    </li>
  );
}

const CHECK = "M3.5 8.4 6.6 11.3 12.5 4.9";
const CROSS = "M4.5 4.5l7 7M11.5 4.5l-7 7";

/**
 * The folded line. Keeps showing the last decision while it folds shut after
 * a revoke, so it never empties before it closes.
 */
function Decided({ decision, action, duration, now, lineRef, onChange }: {
  decision: PermissionDecision | null;
  action: string;
  duration: number;
  now?: number;
  lineRef: RefObject<HTMLDivElement | null>;
  onChange: (d: PermissionDecision | null) => void;
}) {
  const [last, setLast] = useState(decision);
  if (decision && decision !== last) setLast(decision);
  const d = decision ?? last;
  const timed = !!d?.allow && d.scope === "timed" && d.until !== undefined;
  const tick = useNow(timed && now === undefined && !!decision, 1000);
  const clock = now ?? tick;
  const leftMs = timed ? Math.max(0, d!.until! - clock) : 0;
  const expired = timed && leftMs <= 0;
  const live = !!d?.allow && (d.scope === "always" || (timed && !expired));

  const text = !d ? "" : !d.allow ? "Denied" : expired ? "Expired" : d.scope === "once" ? "Allowed once" : d.scope === "timed" ? `Allowed ${forHow(duration)}` : "Always allowed";
  const button = !d ? null : live ? "Revoke" : !d.allow ? "Change" : expired ? "Ask again" : null;
  // The bar is set once per grant and then drains on its own clock, so ticks never restart it.
  const [bar, setBar] = useState<{ key: number; from: number; ms: number; total: number } | null>(null);
  if (timed && bar?.key !== d!.at) {
    const total = d!.until! - d!.at;
    setBar({ key: d!.at, from: total > 0 ? leftMs / total : 0, ms: leftMs, total });
  }

  return (
    <div className={styles.decided}>
      <div ref={lineRef} tabIndex={-1} role="status" className={cx(trayStyles.foot, styles.line)} data-allow={d?.allow || undefined}>
        {d && (
          <span key={d.at} className={styles.lineBody}>
            <motion.span key={d.allow && !expired ? "check" : "cross"} className={styles.mark} data-kind={d.allow && !expired ? "check" : "cross"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...motionTokens.spring.pop, delay: 0.14 }} aria-hidden>
              <svg viewBox="0 0 16 16"><path d={d.allow && !expired ? CHECK : CROSS} pathLength={1} /></svg>
            </motion.span>
            <span className={styles.outcome}><RollText text={text} /></span>
            <span className={styles.lineAction}>{action}</span>
            <TraySpacer />
            {timed && !expired && <span className={styles.left}><span className={styles.leftTime}>{formatTime(Math.ceil(leftMs / 1000))}</span> left</span>}
            {button && <Key size="sm" variant="tertiary" onClick={() => onChange(null)}>{button}</Key>}
          </span>
        )}
      </div>
      {timed && bar && (
        <div className={styles.bar} data-expired={expired || undefined} aria-hidden>
          <span key={bar.key} className={styles.barFill} style={{ "--from": bar.from, "--ms": `${bar.ms}ms`, "--frac": bar.total > 0 ? leftMs / bar.total : 0 } as CSSProperties} />
        </div>
      )}
    </div>
  );
}
