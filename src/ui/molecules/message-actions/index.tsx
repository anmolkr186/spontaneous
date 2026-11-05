/**
 * MessageActions: the quiet bar under an agent message.
 *
 *   Copy        the sheets blur into a check that draws itself, then turn back
 *   Regenerate  the arrow spins once per press and keeps turning while a new
 *               version is written; from two versions a "‹ 2 / 3 ›" switcher
 *               unfolds sideways next to it
 *   Thumbs      a vote fills the thumb with a small pop; thumbs down unfolds a
 *               row of reasons under the bar, then says thanks and folds away
 *   Preview     plays the stretch of the recording the edit changed; while it
 *               plays the icon turns into four level bars
 *
 * MessageText (also exported) crossfades the message itself between versions
 * while its height eases to the new text.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Copy, Play, RotateCw, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { DrawCheck, Fold, IconKey, Key, Meter, RollNumber, Swap } from "@/ui/atoms";
import { motionTokens } from "@/ui/tokens/motion";
import styles from "./message-actions.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type MessageAction = "copy" | "regenerate" | "feedback" | "preview";
export type Vote = "up" | "down";

const ALL: MessageAction[] = ["copy", "regenerate", "feedback", "preview"];
const REASONS = ["Wrong moment", "Too much zoom", "Didn't follow my note", "Other"];
const whole = (n: unknown, fallback: number) => (typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : fallback);

export interface MessageActionsProps {
  /** The message text. Copy writes it to the clipboard. */
  text?: string;
  /** Which actions to show, in this order. `feedback` is the two thumbs. */
  actions?: MessageAction[];
  /** All versions of the message, or how many there are. From two on, the version switcher unfolds next to Regenerate. */
  versions?: number | string[];
  /** Controlled version, 0-based. */
  version?: number;
  /** Starting version when uncontrolled; defaults to the newest. Uncontrolled, the switcher jumps to each new version as it arrives. */
  defaultVersion?: number;
  /** Called with the version picked in the switcher. */
  onVersionChange?: (index: number) => void;
  /** Called after Copy, with `text`. */
  onCopy?: (text?: string) => void;
  /** Called when Regenerate is pressed. Add a version to `versions` and the switcher shows it. */
  onRegenerate?: () => void;
  /** Keeps the arrow turning while a new version is written. */
  regenerating?: boolean;
  /** The vote as soon as a thumb is pressed, null when it's taken back, and "down" once more with a reason when the row is sent. A new version starts without a vote. */
  onFeedback?: (vote: Vote | null, reason?: string) => void;
  /** Quick reasons in the feedback row. "Other" unfolds a small field whose words are sent as the reason. */
  reasons?: string[];
  /** Called with true when the preview starts playing and false when it stops. */
  onPreview?: (playing: boolean) => void;
  /** Controlled playing state; tie it to the player. Without it the preview plays for `previewMs` and stops itself. */
  previewing?: boolean;
  /** How long an uncontrolled preview plays, in ms: the length of the changed range. */
  previewMs?: number;
  /** Accessible name of the bar. */
  label?: string;
  className?: string;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function MessageActions({
  text, actions = ALL, versions, version, defaultVersion, onVersionChange, onCopy, onRegenerate, regenerating = false,
  onFeedback, reasons = REASONS, onPreview, previewing, previewMs = 3200, label = "Message actions", className,
}: MessageActionsProps) {
  const uid = useId();
  const shown = ALL.filter((a) => actions.includes(a)).sort((a, b) => actions.indexOf(a) - actions.indexOf(b));
  const count = Math.max(1, whole(Array.isArray(versions) ? versions.length : versions, 1));

  const [status, setStatus] = useState("");
  // The same words twice still need announcing; a trailing space makes the region change.
  const announce = (s: string) => setStatus((old) => (old === s ? `${s} ` : s));

  /* Versions */
  const [inner, setInner] = useState(() => Math.min(count - 1, Math.max(0, whole(defaultVersion, count - 1))));
  const [seen, setSeen] = useState(count);
  const [vote, setVote] = useState<Vote | null>(null);
  const [panel, setPanel] = useState(false);
  if (seen !== count) {
    // A new version arrived: show it, and it starts without a vote.
    if (count > seen) { setInner(count - 1); setVote(null); setPanel(false); }
    setSeen(count);
  }
  const index = Math.min(count - 1, Math.max(0, whole(version, inner)));
  const goTo = (i: number) => {
    const next = Math.min(count - 1, Math.max(0, i));
    if (next === index) return;
    if (version === undefined) setInner(next);
    onVersionChange?.(next);
    announce(`Version ${next + 1} of ${count}`);
  };

  /* Copy */
  const [copied, setCopied] = useState(0);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(0), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  const copy = () => {
    if (text !== undefined) void copyText(text);
    onCopy?.(text);
    setCopied(Date.now());
    announce("Copied");
  };

  /* Regenerate: each press remounts the arrow, which spins it once. */
  const [spins, setSpins] = useState(0);
  const regenerate = () => {
    if (regenerating) return;
    setSpins((s) => s + 1);
    onRegenerate?.();
    announce("Writing a new version");
  };

  /* Feedback */
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [sent, setSent] = useState(false);
  const downRef = useRef<HTMLButtonElement>(null);
  const up = () => {
    if (vote === "up") { setVote(null); onFeedback?.(null); return; }
    setVote("up");
    setPanel(false);
    onFeedback?.("up");
    announce("Marked as a good edit");
  };
  const down = () => {
    if (vote === "down") { setVote(null); setPanel(false); onFeedback?.(null); return; }
    setVote("down");
    setPanel(true);
    setSent(false);
    setReason(null);
    setOther("");
    onFeedback?.("down");
    announce("Marked as not right. Say what went wrong below");
  };
  const send = () => {
    if (!reason || sent) return;
    onFeedback?.("down", reason === "Other" ? other.trim() || "Other" : reason);
    setSent(true);
    announce("Thanks, noted");
  };
  useEffect(() => {
    if (!sent) return;
    const t = window.setTimeout(() => setPanel(false), 1500);
    return () => window.clearTimeout(t);
  }, [sent]);
  const closePanel = () => { setPanel(false); downRef.current?.focus(); };
  const onPanelKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    closePanel();
  };

  /* Preview */
  const [playingState, setPlayingState] = useState(false);
  const playing = previewing ?? playingState;
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  useEffect(() => {
    if (previewing !== undefined || !playingState) return;
    const t = window.setTimeout(() => { setPlayingState(false); onPreviewRef.current?.(false); }, previewMs);
    return () => window.clearTimeout(t);
  }, [playingState, previewing, previewMs]);
  const preview = () => {
    const next = !playing;
    if (previewing === undefined) setPlayingState(next);
    onPreview?.(next);
    announce(next ? "Playing the changed range" : "Stopped the preview");
  };

  const parts: Record<MessageAction, ReactNode> = {
    copy: (
      <IconKey key="copy" size="sm" tooltip="top" label={copied ? "Copied" : "Copy message"} className={styles.action} data-done={copied ? "" : undefined} onClick={copy}>
        <span className={styles.morph} aria-hidden>
          <span className={styles.layer} data-on={!copied || undefined}><Copy /></span>
          <span className={cx(styles.layer, styles.check)} data-on={!!copied || undefined}>
            <svg viewBox="0 0 16 16"><path d="M3.5 8.4 6.6 11.3 12.5 4.9" pathLength={1} /></svg>
          </span>
        </span>
      </IconKey>
    ),
    regenerate: (
      <span key="regenerate" className={styles.regen}>
        <IconKey size="sm" tooltip="top" label={regenerating ? "Writing a new version" : "Regenerate"} className={styles.action} aria-busy={regenerating || undefined} data-busy={regenerating || undefined} onClick={regenerate}>
          <span key={spins} className={styles.spin} data-spin={spins ? "" : undefined} aria-hidden><RotateCw /></span>
        </IconKey>
        <span className={styles.versions} data-open={count > 1 || undefined} inert={count < 2 || undefined}>
          <span className={styles.versionsClip} role="group" aria-label="Versions">
            <button type="button" className={styles.step} aria-label="Previous version" disabled={index === 0} onClick={() => goTo(index - 1)}><ChevronLeft aria-hidden /></button>
            <span className={styles.count}>
              <span className="visually-hidden">Version {index + 1} of {count}</span>
              <span className={styles.countNow} aria-hidden><RollNumber value={index + 1} /></span>
              <span aria-hidden>/</span>
              <span aria-hidden><RollNumber value={count} /></span>
            </span>
            <button type="button" className={styles.step} aria-label="Next version" disabled={index >= count - 1} onClick={() => goTo(index + 1)}><ChevronRight aria-hidden /></button>
          </span>
        </span>
      </span>
    ),
    feedback: (
      <span key="feedback" className={styles.votes}>
        <IconKey size="sm" tooltip="top" label="Good edit" className={cx(styles.action, styles.vote)} pressed={vote === "up"} onClick={up}>
          <span className={styles.thumb} aria-hidden><ThumbsUp /></span>
        </IconKey>
        <IconKey ref={downRef} size="sm" tooltip="top" label="Not right" className={cx(styles.action, styles.vote)} pressed={vote === "down"}
          aria-expanded={panel} aria-controls={`${uid}-feedback`} onClick={down}>
          <span className={styles.thumb} aria-hidden><ThumbsDown /></span>
        </IconKey>
      </span>
    ),
    preview: (
      <IconKey key="preview" size="sm" tooltip="top" label={playing ? "Stop preview" : "Preview the change"} className={styles.action} pressed={playing} onClick={preview}>
        <span className={styles.morph} aria-hidden>
          <span className={styles.layer} data-on={!playing || undefined}><Play /></span>
          <span className={cx(styles.layer, styles.levels)} data-on={playing || undefined}><Meter bars={4} className={styles.meter} /></span>
        </span>
      </IconKey>
    ),
  };

  return (
    <div className={cx(styles.root, className)}>
      <div role="group" aria-label={label} className={styles.bar}>
        {shown.map((a) => parts[a])}
      </div>
      <span className="visually-hidden" role="status" aria-live="polite">{status}</span>
      {shown.includes("feedback") && (
        <Fold open={panel} id={`${uid}-feedback`}>
          <div className={styles.panel} onKeyDown={onPanelKey}>
            <Swap id={sent ? "sent" : "ask"} inline={false} className={styles.panelSwap}>
              {sent ? (
                <p className={styles.thanks}><DrawCheck size={14} className={styles.thanksCheck} />Thanks. The next edit will take this into account.</p>
              ) : (
                <>
                  <div className={styles.panelHead}>
                    <span className={styles.panelTitle}>What went wrong?</span>
                    <IconKey size="sm" tooltip="top" label="Close" onClick={closePanel}><X /></IconKey>
                  </div>
                  <div className={styles.reasons} role="group" aria-label="Reasons">
                    {reasons.map((r) => (
                      <button key={r} type="button" className={styles.reason} aria-pressed={reason === r} onClick={() => setReason(reason === r ? null : r)}>{r}</button>
                    ))}
                  </div>
                  <Fold open={reason === "Other"}>
                    <input className={styles.field} aria-label="What should it have done?" placeholder="What should it have done?" value={other}
                      onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }} />
                  </Fold>
                  <div className={styles.panelFoot}>
                    <Key size="sm" variant="primary" disabled={!reason} onClick={send}>Send</Key>
                  </div>
                </>
              )}
            </Swap>
          </div>
        </Fold>
      )}
    </div>
  );
}

/* ───────────────────────── MessageText ───────────────────────── */

export interface MessageTextProps {
  /** Which version is showing. A new value crossfades to the new children. */
  version: string | number;
  /** The text of that version. */
  children: ReactNode;
  className?: string;
}

/**
 * The message itself, crossfading between versions: the old text blurs out
 * as the new one sharpens in, and the block eases to the new height.
 */
export function MessageText({ version, children, className }: MessageTextProps) {
  const reduce = useReducedMotion();
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    setHeight(el.offsetHeight);
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const blur = (px: number) => `blur(${px}px)`;
  return (
    <div className={cx(styles.text, className)} data-measured={height !== undefined || undefined} style={height === undefined ? undefined : ({ "--h": `${height}px` } as CSSProperties)}>
      <div ref={inner} className={styles.textInner}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={String(version)}
            initial={reduce ? false : { opacity: 0, filter: blur(motionTokens.blur.roll) }}
            animate={{ opacity: 1, filter: blur(0) }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, filter: blur(motionTokens.blur.subtle), transition: { duration: 0.26, ease: motionTokens.ease.standard } }}
            transition={{ duration: 0.42, ease: motionTokens.ease.standard }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
