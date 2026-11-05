/**
 * ApprovalCard: the agent asks before it does something hard to undo.
 *
 * Reads top to bottom: what it wants to do (a key tile with its icon, the
 * title, one line of context, how risky), exactly what will change (a well of
 * label and value rows, or a preview of your own), then the decision on the
 * tray: a quiet countdown, Deny, Approve. "Always allow" sits at the foot of the
 * card. The countdown holds still while you point at or work in the card.
 *
 * A decision blurs the card and its foot away while the tray glides down to a
 * single resolved row whose check or cross draws itself.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Cell, Fold, Kbd, Key, Swap, Tag, Timecode, useNow } from "@/ui/atoms";
import { Tray, TraySpacer, trayStyles } from "@/ui/molecules/tray";
import styles from "./approval-card.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type ApprovalStatus = "pending" | "approved" | "denied";
export type ApprovalRisk = "low" | "medium" | "high";
export type DenyReason = "user" | "timeout";
export interface ApprovalDetail { label: string; value: ReactNode }

export interface ApprovalCardProps {
  /** The action, in the app's words ("Replace the recording's audio"). Also the card's accessible name. */
  title: string;
  /** One line of context under the title. Truncates. */
  description?: ReactNode;
  /** How hard this is to take back. Leave out to hide the tag. */
  risk?: ApprovalRisk;
  /** Icon in the 32px key tile. Defaults to a shield. */
  icon?: ReactNode;
  /** Label and value rows in the preview well. Put times in `Timecode`. */
  details?: ApprovalDetail[];
  /** Custom preview above the details, e.g. a list of takes. `children` work the same. */
  preview?: ReactNode;
  children?: ReactNode;
  /** Controlled status. Setting it back to "pending" starts a fresh request. */
  status?: ApprovalStatus;
  /** Starting status when uncontrolled. */
  defaultStatus?: ApprovalStatus;
  /** Approve or ⌘↵. Return a promise to show the key working and lock the card; a rejection keeps it pending. */
  onApprove?: (decision: { always: boolean }) => void | Promise<unknown>;
  /** Deny, Escape, or the countdown running out. */
  onDeny?: (decision: { reason: DenyReason }) => void;
  /** Shows an Edit key before Deny. */
  onEdit?: () => void;
  /** Seconds until the request lapses and denies itself. Paused while the card is pointed at or focused. */
  expiresIn?: number;
  /** The countdown ran out. Called right before `onDeny({ reason: "timeout" })`. */
  onExpire?: () => void;
  /** Show the "Always allow this action" checkbox. */
  allowAlways?: boolean;
  alwaysLabel?: string;
  approveLabel?: string;
  denyLabel?: string;
  editLabel?: string;
  /** Show the ⌘↵ and Esc caps on the keys. The shortcuts work either way. */
  shortcuts?: boolean;
  /** Small label in the tray head, e.g. "Step 4 · Audio". */
  label?: ReactNode;
  className?: string;
}

type Decided = { outcome: "approved" | "denied"; by: DenyReason; at: number; always: boolean };

const RISK: Record<ApprovalRisk, { word: string; level: number }> = {
  low: { word: "Low risk", level: 1 },
  medium: { word: "Medium risk", level: 2 },
  high: { word: "High risk", level: 3 },
};

export function ApprovalCard({
  title,
  description,
  risk,
  icon = <ShieldCheck />,
  details,
  preview,
  children,
  status,
  defaultStatus = "pending",
  onApprove,
  onDeny,
  onEdit,
  expiresIn,
  onExpire,
  allowAlways = true,
  alwaysLabel = "Always allow this action",
  approveLabel = "Approve",
  denyLabel = "Deny",
  editLabel = "Edit",
  shortcuts = true,
  label,
  className,
}: ApprovalCardProps) {
  const id = useId();
  const titleId = `${id}-title`, descId = `${id}-desc`, clockId = `${id}-clock`;
  const root = useRef<HTMLElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);

  const [inner, setInner] = useState<ApprovalStatus>(defaultStatus);
  const current = status ?? inner;
  const [decided, setDecided] = useState<Decided | null>(() => (current === "pending" ? null : { outcome: current, by: "user", at: Date.now(), always: false }));
  const [shown, setShown] = useState(decided);
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(expiresIn);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  // Follow the status when it changes from outside: a fresh request resets the card.
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    if (current === "pending") { setDecided(null); setAlways(false); setBusy(false); setLeft(expiresIn); }
    else if (!decided) setDecided({ outcome: current, by: "user", at: Date.now(), always: false });
  }
  // The resolved row keeps its last content while it folds shut, so it never snaps.
  if (decided && decided !== shown) setShown(decided);

  const resolved = current !== "pending";
  const decide = (outcome: Decided["outcome"], by: DenyReason) => {
    hadFocus.current = !!root.current?.contains(document.activeElement);
    setDecided({ outcome, by, at: Date.now(), always: outcome === "approved" && always });
    if (status === undefined) setInner(outcome);
  };

  const approve = async () => {
    if (busy || resolved) return;
    const result = onApprove?.({ always });
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      setBusy(true);
      try { await result; } catch { setBusy(false); return; }
    }
    decide("approved", "user");
  };
  const deny = (reason: DenyReason) => {
    if (busy || resolved) return;
    if (reason === "timeout") onExpire?.();
    onDeny?.({ reason });
    decide("denied", reason);
  };

  // The countdown: one tick a second, no motion per tick, held while pointed at or focused.
  const ticking = !resolved && !busy && !hovered && !focused && left !== undefined && left > 0;
  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => setLeft((s) => Math.max(0, (s ?? 0) - 1)), 1000);
    return () => window.clearInterval(t);
  }, [ticking]);
  // Runs once when the clock reaches zero; `deny` reads this render's props.
  useEffect(() => { if (left === 0) deny("timeout"); }, [left]);

  useEffect(() => {
    if (resolved && hadFocus.current) { hadFocus.current = false; row.current?.focus({ preventScroll: true }); }
  }, [resolved]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (resolved) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void approve(); }
    else if (e.key === "Escape") { e.preventDefault(); deny("user"); }
  };

  const urgent = left !== undefined && left <= 10;
  const body = preview ?? children;
  const word = (d: Decided) => (d.outcome === "approved" ? "Approved" : d.by === "timeout" ? "Expired" : "Denied");

  return (
    <Tray
      bare
      ref={root}
      className={cx(styles.approval, className)}
      data-resolved={resolved || undefined}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={[description && descId, left !== undefined && !resolved && clockId].filter(Boolean).join(" ") || undefined}
      aria-busy={busy || undefined}
      onKeyDown={onKeyDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
    >
      <div className={styles.pendingWrap}>
        <Fold open={!resolved}>
          <div className={styles.pending}>
            {label && <div className={trayStyles.head}><span className={trayStyles.title}>{label}</span></div>}

            <div className={cx(trayStyles.card, styles.card)}>
              <header className={styles.header}>
                <span className={styles.tile} aria-hidden>{icon}</span>
                <div className={styles.heading}>
                  <h3 id={titleId} className={styles.title}>{title}</h3>
                  {description && <p id={descId} className={styles.description}>{description}</p>}
                </div>
                {risk && <RiskTag risk={risk} />}
              </header>
              {(body || details?.length) && (
                <div className={styles.preview}>
                  {body}
                  {!!details?.length && (
                    <dl className={styles.details}>
                      {details.map((d) => (
                        <div key={d.label} className={styles.detail}>
                          <dt>{d.label}</dt>
                          <dd>{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}
              {allowAlways && <div className={styles.always}><Checkbox checked={always} onChange={setAlways} disabled={busy}>{alwaysLabel}</Checkbox></div>}
            </div>

            <div className={cx(trayStyles.foot, styles.foot)} data-edit={onEdit ? true : undefined}>
              {left !== undefined && (
                <span className={styles.clock} data-urgent={urgent || undefined}>
                  <span className={styles.clockShown} aria-hidden>
                    <span className={styles.clockWords}><Swap id={urgent ? "urgent" : "calm"}>{urgent ? <Tag size="sm">Expiring</Tag> : "Expires in"}</Swap></span>
                    <Timecode value={left} className={styles.clockTime} />
                  </span>
                  <span id={clockId} className="visually-hidden">Expires in {left} seconds unless you approve or deny it.</span>
                </span>
              )}
              <TraySpacer />
              {onEdit && <Key variant="tertiary" aria-disabled={busy || undefined} onClick={() => !busy && onEdit()}>{editLabel}</Key>}
              <Key variant="tertiary" data-action="deny" aria-keyshortcuts="Escape" aria-disabled={busy || undefined} onClick={() => deny("user")}>
                {denyLabel}
                {shortcuts && <span className={styles.hint} aria-hidden><Kbd>Esc</Kbd></span>}
              </Key>
              <Key variant="primary" data-action="approve" aria-keyshortcuts="Meta+Enter Control+Enter" loading={busy} onClick={() => void approve()}>
                <Check aria-hidden />{approveLabel}
                {shortcuts && <span className={cx(styles.hint, styles.collapsible)} aria-hidden><Kbd className={styles.faceKbd}>⌘↵</Kbd></span>}
              </Key>
            </div>
          </div>
        </Fold>
      </div>

      <Fold open={resolved}>
        <div ref={row} tabIndex={-1} className={cx(trayStyles.foot, styles.resolved)} data-outcome={shown?.outcome}>
          {shown && (
            <span key={shown.at} className={styles.resolvedBody}>
              <Drawn kind={shown.outcome === "approved" ? "check" : "cross"} />
              <span className={styles.outcome}>{word(shown)}</span>
              <span className={styles.outcomeTitle}>{title}</span>
              {shown.always && <Tag size="sm">Always</Tag>}
              <TraySpacer />
              <Ago at={shown.at} />
            </span>
          )}
        </div>
      </Fold>

      <span className="visually-hidden" role="status" aria-live="polite">{resolved && decided ? `${word(decided)}: ${title}` : ""}</span>
    </Tray>
  );
}

/* ───────────────────────── Parts ───────────────────────── */

/** Risk as a word with a three-cell gauge. Only high risk takes the rec tone. */
function RiskTag({ risk }: { risk: ApprovalRisk }) {
  const { word, level } = RISK[risk];
  const high = risk === "high";
  return (
    <Tag size="sm" tone={high ? "rec" : "neutral"} className={styles.risk}>
      <span className={styles.gauge} aria-hidden>
        {[1, 2, 3].map((i) => <Cell key={i} size={5} variant={i > level ? "muted" : high ? "rec" : "solid"} />)}
      </span>
      {word}
    </Tag>
  );
}

/**
 * A checkbox in the app's materials: an inset well; checked, a light face
 * cell scales into it and its tick draws. A real input underneath, so Space,
 * labels and forms behave as they should.
 */
function Checkbox({ checked, onChange, disabled, children }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className={styles.check} data-disabled={disabled || undefined}>
      <input type="checkbox" className={styles.checkInput} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.checkBox} aria-hidden>
        <span className={styles.checkFace}>
          <svg viewBox="0 0 16 16"><path d="M4 8.4 6.8 11 12 5.2" pathLength={1} /></svg>
        </span>
      </span>
      <span className={styles.checkLabel}>{children}</span>
    </label>
  );
}

const CHECK = "M3.5 8.4 6.6 11.3 12.5 4.9";
const CROSS = "M4.5 4.5l7 7M11.5 4.5l-7 7";

/** A check or cross that draws itself once the resolved row has started to open. */
function Drawn({ kind }: { kind: "check" | "cross" }) {
  return (
    <svg className={styles.drawn} data-kind={kind} viewBox="0 0 16 16" aria-hidden>
      <path d={kind === "check" ? CHECK : CROSS} pathLength={1} />
    </svg>
  );
}

/** "just now", then "3m ago" with the number in the time face. */
function Ago({ at }: { at: number }) {
  const now = useNow(true, 15000);
  const m = Math.floor(Math.max(0, now - at) / 60000);
  if (m < 1) return <span className={styles.ago}>just now</span>;
  return <span className={styles.ago}><span className={styles.agoTime}>{m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`}</span> ago</span>;
}
